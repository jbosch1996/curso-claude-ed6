import { describe, it, expect, beforeEach } from 'vitest'
import { BillService } from './bill.service.js'
import { OrderService } from './order.service.js'
import { MockOrderRepository } from '@repositories/mocks/MockOrderRepository.js'
import { MockDishRepository } from '@repositories/mocks/MockDishRepository.js'
import { MockPackRepository } from '@repositories/mocks/MockPackRepository.js'
import { MockBillRepository } from '@repositories/mocks/MockBillRepository.js'
import { MockDiscountCodeRepository } from '@repositories/mocks/MockDiscountCodeRepository.js'
import { MockPointsRuleRepository } from '@repositories/mocks/MockPointsRuleRepository.js'
import { MockClientPointsRepository } from '@repositories/mocks/MockClientPointsRepository.js'
import type { Dish, DishCategoryType } from '@models/dish.model.js'

const plato = (id: string, category: DishCategoryType, price: number): Dish => ({
    id, name: id, description: null, price, category, available: true, restaurantId: 'r1',
    ingredients: [], createdAt: '', updatedAt: ''
})

describe('Cuenta de un pedido con packs', () => {
    let orders: MockOrderRepository
    let orderService: OrderService
    let billService: BillService
    let codes: MockDiscountCodeRepository

    beforeEach(async () => {
        orders = new MockOrderRepository()
        const dishes = new MockDishRepository()
        const packs = new MockPackRepository()
        codes = new MockDiscountCodeRepository()
        orderService = new OrderService(orders, dishes, undefined, packs)
        billService = new BillService(orders, new MockBillRepository(), codes, new MockPointsRuleRepository(), new MockClientPointsRepository())

        await dishes.save(plato('ensalada', 'entrante', 9))
        await dishes.save(plato('pizza', 'principal', 12.5))
        await dishes.save(plato('agua', 'bebida', 2))
        await packs.save({
            id: 'p1', restaurantId: 'r1', name: 'Menú', description: null, price: 18, available: true,
            categories: ['entrante', 'principal', 'bebida'], excludedDishIds: [], createdAt: '', updatedAt: ''
        })
    })

    const pedir = () => orderService.create({
        restaurantId: 'r1', tableId: null, clientId: 'u1',
        items: [],
        packs: [{ packId: 'p1', dishIds: ['ensalada', 'pizza', 'agua'], quantity: 2 }]
    })

    // Los platos sueltos toman dishPrice del JOIN del repositorio SQLite (ver order.repository.test.ts).
    it('el subtotal es el precio de los packs, no la suma de sus platos', async () => {
        const order = await pedir()
        const cuenta = await billService.create(order.id, { id: 'u1', role: 'cliente', restaurantId: null }, {})
        expect(cuenta).toMatchObject({ subtotal: 36, total: 36, pointsEarned: 36 })
    })

    it('los códigos de descuento se aplican sobre ese subtotal', async () => {
        await codes.save({
            id: 'c1', restaurantId: 'r1', code: 'MITAD', type: 'percent', value: 50, expiresAt: null,
            active: true, createdAt: '', updatedAt: ''
        })
        const order = await pedir()
        const cuenta = await billService.create(order.id, { id: 'u1', role: 'cliente', restaurantId: null }, { discountCode: 'mitad' })
        expect(cuenta).toMatchObject({ subtotal: 36, codeDiscount: 18, total: 18 })
    })
})
