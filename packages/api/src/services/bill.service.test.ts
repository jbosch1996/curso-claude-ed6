import { describe, it, expect, beforeEach } from 'vitest'
import { BillService } from './bill.service.js'
import type { OrderActor } from './order.service.js'
import { MockOrderRepository } from '@repositories/mocks/MockOrderRepository.js'
import { MockBillRepository } from '@repositories/mocks/MockBillRepository.js'
import { MockDiscountCodeRepository } from '@repositories/mocks/MockDiscountCodeRepository.js'
import { MockPointsRuleRepository } from '@repositories/mocks/MockPointsRuleRepository.js'
import { MockClientPointsRepository } from '@repositories/mocks/MockClientPointsRepository.js'
import { MockPointsEarningRepository } from '@repositories/mocks/MockPointsEarningRepository.js'
import type { Order } from '@models/order.model.js'
import type { DiscountCode } from '@models/discount-code.model.js'
import {
    OrderNotFoundError, BillAlreadyRequestedError, BillNotFoundError, InvalidDiscountCodeError,
    PointsRuleNotFoundError, InsufficientPointsError, InvalidBillError
} from '@errors/DomainErrors.js'

const cliente = (id = 'u1'): OrderActor => ({ id, role: 'cliente', restaurantId: null })

const pedido = (id: string, restaurantId: string, clientId: string, precios: number[]): Order => ({
    id, restaurantId, tableId: null, clientId, createdAt: new Date(),
    items: precios.map((dishPrice, i) => ({
        id: `${id}-i${i}`, dishId: `d${i}`, quantity: 1, notes: null, status: 'entregado' as const, dishPrice
    }))
})

const codigo = (cambios: Partial<DiscountCode> = {}): DiscountCode => ({
    id: 'c1', restaurantId: 'r1', code: 'VERANO10', type: 'percent', value: 10, expiresAt: null,
    active: true, createdAt: '', updatedAt: '', ...cambios
})

describe('BillService', () => {
    let orders: MockOrderRepository
    let bills: MockBillRepository
    let codes: MockDiscountCodeRepository
    let rules: MockPointsRuleRepository
    let points: MockClientPointsRepository
    let service: BillService

    const montar = (puntos = points) => new BillService(orders, bills, codes, rules, puntos)

    beforeEach(async () => {
        orders = new MockOrderRepository()
        bills = new MockBillRepository()
        codes = new MockDiscountCodeRepository()
        rules = new MockPointsRuleRepository()
        points = new MockClientPointsRepository()
        service = montar()
        await orders.create(pedido('o1', 'r1', 'u1', [10, 10.5, 9.5]))
    })

    describe('create sin descuentos', () => {
        it('calcula subtotal y total, guarda la cuenta y da un punto por euro', async () => {
            const cuenta = await service.create('o1', cliente(), {})
            expect(cuenta).toMatchObject({
                orderId: 'o1', restaurantId: 'r1', clientId: 'u1', subtotal: 30, discountCodeId: null,
                codeDiscount: 0, pointsUsed: 0, pointsDiscount: 0, total: 30, pointsEarned: 30
            })
            expect(await bills.findByOrderId('o1')).toEqual(cuenta)
            expect(await points.getBalance('u1', 'r1')).toBe(30)
        })

        it('solo da la parte entera de los puntos', async () => {
            await orders.create(pedido('o2', 'r1', 'u1', [9.99]))
            const cuenta = await service.create('o2', cliente(), {})
            expect(cuenta.pointsEarned).toBe(9)
        })

        it('no permite pedir la cuenta dos veces', async () => {
            await service.create('o1', cliente(), {})
            await expect(service.create('o1', cliente(), {})).rejects.toThrow(BillAlreadyRequestedError)
            expect(await points.getBalance('u1', 'r1')).toBe(30)
        })

        it('un pedido inexistente da 404', async () => {
            await expect(service.create('nope', cliente(), {})).rejects.toThrow(OrderNotFoundError)
        })

        it('el pedido de otro cliente se trata como inexistente', async () => {
            await expect(service.create('o1', cliente('u2'), {})).rejects.toThrow(OrderNotFoundError)
        })

        it('el personal del restaurante no puede pedir la cuenta de un cliente', async () => {
            await expect(service.create('o1', { id: 'e1', role: 'camarero', restaurantId: 'r1' }, {})).rejects.toThrow(OrderNotFoundError)
        })

        it('rechaza tipos incorrectos en el cuerpo', async () => {
            await expect(service.create('o1', cliente(), { discountCode: 5 as unknown as string })).rejects.toThrow(InvalidBillError)
            await expect(service.create('o1', cliente(), { pointsRuleId: 5 as unknown as string })).rejects.toThrow(InvalidBillError)
        })
    })

    describe('create con código de descuento', () => {
        beforeEach(async () => {
            await codes.save(codigo())
        })

        it('aplica un porcentaje, sin distinguir mayúsculas ni espacios', async () => {
            const cuenta = await service.create('o1', cliente(), { discountCode: ' verano10 ' })
            expect(cuenta).toMatchObject({ discountCodeId: 'c1', codeDiscount: 3, total: 27, pointsEarned: 27 })
        })

        it('aplica un importe fijo', async () => {
            await codes.save(codigo({ id: 'c2', code: 'FIJO5', type: 'fixed', value: 5 }))
            const cuenta = await service.create('o1', cliente(), { discountCode: 'FIJO5' })
            expect(cuenta).toMatchObject({ codeDiscount: 5, total: 25 })
        })

        it('limita un importe fijo mayor que el subtotal', async () => {
            await codes.save(codigo({ id: 'c2', code: 'GRANDE', type: 'fixed', value: 500 }))
            const cuenta = await service.create('o1', cliente(), { discountCode: 'GRANDE' })
            expect(cuenta).toMatchObject({ codeDiscount: 30, total: 0, pointsEarned: 0 })
        })

        it.each([
            ['no existe', { discountCode: 'NOEXISTE' }],
            ['tiene formato inválido', { discountCode: '!!' }]
        ])('rechaza un código que %s con un mensaje único', async (_n, cuerpo) => {
            await expect(service.create('o1', cliente(), cuerpo)).rejects.toThrow('Invalid or expired discount code')
        })

        it('rechaza un código inactivo', async () => {
            await codes.save(codigo({ active: false }))
            await expect(service.create('o1', cliente(), { discountCode: 'VERANO10' })).rejects.toThrow(InvalidDiscountCodeError)
        })

        it('rechaza un código caducado', async () => {
            await codes.save(codigo({ expiresAt: '2020-01-01T00:00:00.000Z' }))
            await expect(service.create('o1', cliente(), { discountCode: 'VERANO10' })).rejects.toThrow('Invalid or expired discount code')
        })

        it('rechaza un código de otro restaurante con el mismo mensaje', async () => {
            await codes.save(codigo({ id: 'c9', restaurantId: 'r2', code: 'SOLOR2' }))
            await expect(service.create('o1', cliente(), { discountCode: 'SOLOR2' })).rejects.toThrow('Invalid or expired discount code')
        })

        it('no guarda la cuenta si el código es inválido', async () => {
            await service.create('o1', cliente(), { discountCode: 'NOEXISTE' }).catch(() => undefined)
            expect(await bills.findByOrderId('o1')).toBeNull()
        })
    })

    describe('create con canje de puntos', () => {
        beforeEach(async () => {
            await rules.save({ id: 'p10', restaurantId: 'r1', points: 10, discount: 1, createdAt: '' })
            await rules.save({ id: 'p100', restaurantId: 'r1', points: 100, discount: 10, createdAt: '' })
            await rules.save({ id: 'px', restaurantId: 'r2', points: 10, discount: 1, createdAt: '' })
        })

        it('descuenta los puntos del saldo y aplica el descuento', async () => {
            await points.add('u1', 'r1', 25)
            const cuenta = await service.create('o1', cliente(), { pointsRuleId: 'p10' })
            expect(cuenta).toMatchObject({ pointsUsed: 10, pointsDiscount: 1, total: 29, pointsEarned: 29 })
            expect(await points.getBalance('u1', 'r1')).toBe(25 - 10 + 29)
        })

        it('rechaza si el saldo es insuficiente y no guarda nada', async () => {
            await points.add('u1', 'r1', 9)
            await expect(service.create('o1', cliente(), { pointsRuleId: 'p10' })).rejects.toThrow(InsufficientPointsError)
            expect(await bills.findByOrderId('o1')).toBeNull()
            expect(await points.getBalance('u1', 'r1')).toBe(9)
        })

        it('no usa los puntos de otro restaurante', async () => {
            await points.add('u1', 'r2', 500)
            await expect(service.create('o1', cliente(), { pointsRuleId: 'p10' })).rejects.toThrow(InsufficientPointsError)
        })

        it('una equivalencia inexistente o de otro restaurante da 404', async () => {
            await points.add('u1', 'r1', 500)
            await expect(service.create('o1', cliente(), { pointsRuleId: 'nope' })).rejects.toThrow(PointsRuleNotFoundError)
            await expect(service.create('o1', cliente(), { pointsRuleId: 'px' })).rejects.toThrow(PointsRuleNotFoundError)
        })

        it('rechaza un canje que supera lo que queda por pagar y no gasta puntos', async () => {
            await points.add('u1', 'r1', 500)
            await orders.create(pedido('o2', 'r1', 'u1', [4]))
            await expect(service.create('o2', cliente(), { pointsRuleId: 'p100' })).rejects.toThrow(InvalidBillError)
            expect(await points.getBalance('u1', 'r1')).toBe(500)
            expect(await bills.findByOrderId('o2')).toBeNull()
        })

        it('combina código y puntos: el canje se limita a lo que queda tras el código', async () => {
            await codes.save(codigo())
            await points.add('u1', 'r1', 10)
            const cuenta = await service.create('o1', cliente(), { discountCode: 'VERANO10', pointsRuleId: 'p10' })
            expect(cuenta).toMatchObject({ codeDiscount: 3, pointsDiscount: 1, total: 26 })
        })

        it('deshace la cuenta si el saldo se gasta entre la comprobación y el descuento', async () => {
            await points.add('u1', 'r1', 10)
            const carrera = new MockClientPointsRepository()
            await carrera.add('u1', 'r1', 10)
            carrera.tryDeduct = async () => false
            await expect(montar(carrera).create('o1', cliente(), { pointsRuleId: 'p10' })).rejects.toThrow(InsufficientPointsError)
            expect(await bills.findByOrderId('o1')).toBeNull()
            expect(await carrera.getBalance('u1', 'r1')).toBe(10)
        })
    })

    describe('getByOrderId', () => {
        beforeEach(async () => {
            await service.create('o1', cliente(), {})
        })

        it('el propietario ve su cuenta', async () => {
            expect((await service.getByOrderId('o1', cliente())).total).toBe(30)
        })

        it('el personal del restaurante y el admin ven la cuenta', async () => {
            await expect(service.getByOrderId('o1', { id: 'e1', role: 'camarero', restaurantId: 'r1' })).resolves.toBeDefined()
            await expect(service.getByOrderId('o1', { id: 'a', role: 'admin', restaurantId: null })).resolves.toBeDefined()
        })

        it('otro cliente o personal de otro restaurante reciben 404', async () => {
            await expect(service.getByOrderId('o1', cliente('u2'))).rejects.toThrow(OrderNotFoundError)
            await expect(service.getByOrderId('o1', { id: 'e2', role: 'manager', restaurantId: 'r2' })).rejects.toThrow(OrderNotFoundError)
        })

        it('un pedido sin cuenta da BillNotFoundError', async () => {
            await orders.create(pedido('o3', 'r1', 'u1', [5]))
            await expect(service.getByOrderId('o3', cliente())).rejects.toThrow(BillNotFoundError)
        })

        it('un pedido inexistente da OrderNotFoundError', async () => {
            await expect(service.getByOrderId('nope', cliente())).rejects.toThrow(OrderNotFoundError)
        })
    })
})

describe('BillService con ritmo de ganancia configurable', () => {
    let orders: MockOrderRepository
    let points: MockClientPointsRepository
    let earning: MockPointsEarningRepository
    let service: BillService

    const configurar = (amount: number, puntos: number, restaurantId = 'r1') =>
        earning.save({ restaurantId, amount, points: puntos, isDefault: false, updatedAt: '2026-10-22T10:00:00.000Z' })

    beforeEach(async () => {
        orders = new MockOrderRepository()
        points = new MockClientPointsRepository()
        earning = new MockPointsEarningRepository()
        service = new BillService(orders, new MockBillRepository(), new MockDiscountCodeRepository(),
            new MockPointsRuleRepository(), points, earning)
        await orders.create(pedido('o1', 'r1', 'u1', [10, 10.5, 9.5]))
    })

    it('aplica el ritmo del restaurante del pedido: 30 € a 5 puntos por cada 10 € dan 15 puntos', async () => {
        await configurar(10, 5)
        await configurar(1, 100, 'r2')
        const cuenta = await service.create('o1', cliente(), {})
        expect(cuenta).toMatchObject({ total: 30, pointsEarned: 15 })
        expect(await points.getBalance('u1', 'r1')).toBe(15)
    })

    it('sin bloques completos no gana ni suma puntos', async () => {
        await configurar(50, 1)
        const cuenta = await service.create('o1', cliente(), {})
        expect(cuenta.pointsEarned).toBe(0)
        expect(await points.getBalance('u1', 'r1')).toBe(0)
    })

    it('sin ritmo configurado sigue dando 1 punto por euro', async () => {
        const cuenta = await service.create('o1', cliente(), {})
        expect(cuenta.pointsEarned).toBe(30)
        expect(await points.getBalance('u1', 'r1')).toBe(30)
    })

    it('calcula los puntos sobre el total tras los descuentos', async () => {
        await configurar(10, 2)
        const codes = new MockDiscountCodeRepository()
        await codes.save(codigo({ type: 'fixed', value: 5 }))
        service = new BillService(orders, new MockBillRepository(), codes, new MockPointsRuleRepository(), points, earning)
        const cuenta = await service.create('o1', cliente(), { discountCode: 'VERANO10' })
        expect(cuenta).toMatchObject({ total: 25, pointsEarned: 4 })
    })
})
