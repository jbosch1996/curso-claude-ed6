import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createBillRouter } from './bill.routes.js'
import { BillService } from '@services/bill.service.js'
import { MockOrderRepository } from '@repositories/mocks/MockOrderRepository.js'
import { MockBillRepository } from '@repositories/mocks/MockBillRepository.js'
import { MockDiscountCodeRepository } from '@repositories/mocks/MockDiscountCodeRepository.js'
import { MockPointsRuleRepository } from '@repositories/mocks/MockPointsRuleRepository.js'
import { MockClientPointsRepository } from '@repositories/mocks/MockClientPointsRepository.js'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'
import { JWT_SECRET } from '@config/env.js'

const token = (role: string, restaurantId: string | null, id: string) =>
    `Bearer ${jwt.sign({ id, role, restaurantId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`

describe('rutas /orders/:orderId/bill', () => {
    let app: express.Express
    let points: MockClientPointsRepository

    const pedir = (orderId: string, auth: string, cuerpo: object = {}) =>
        request(app).post(`/orders/${orderId}/bill`).set('Authorization', auth).send(cuerpo)

    beforeEach(async () => {
        const orders = new MockOrderRepository()
        const codes = new MockDiscountCodeRepository()
        const rules = new MockPointsRuleRepository()
        points = new MockClientPointsRepository()
        await orders.create({
            id: 'o1', restaurantId: 'r1', tableId: null, clientId: 'u1', createdAt: new Date(),
            items: [{ id: 'i1', dishId: 'd1', quantity: 1, notes: null, status: 'entregado', dishPrice: 20 }]
        })
        await orders.create({
            id: 'o2', restaurantId: 'r1', tableId: null, clientId: 'u1', createdAt: new Date(),
            items: [{ id: 'i2', dishId: 'd1', quantity: 1, notes: null, status: 'entregado', dishPrice: 20 }]
        })
        await codes.save({ id: 'c1', restaurantId: 'r1', code: 'VERANO10', type: 'percent', value: 10, expiresAt: null, active: true, createdAt: '', updatedAt: '' })
        await rules.save({ id: 'p10', restaurantId: 'r1', points: 10, discount: 1, createdAt: '' })

        app = express()
        app.use(express.json())
        app.use('/orders', createBillRouter(new BillService(orders, new MockBillRepository(), codes, rules, points)))
        app.use(errorHandler)
    })

    it('devuelve 401 sin token', async () => {
        expect((await request(app).post('/orders/o1/bill')).status).toBe(401)
        expect((await request(app).get('/orders/o1/bill')).status).toBe(401)
    })

    it('el propietario pide la cuenta con un código (201)', async () => {
        const res = await pedir('o1', token('cliente', null, 'u1'), { discountCode: 'verano10' })
        expect(res.status).toBe(201)
        expect(res.body).toMatchObject({ orderId: 'o1', subtotal: 20, codeDiscount: 2, total: 18, pointsEarned: 18 })
    })

    it('pedirla otra vez devuelve 400', async () => {
        await pedir('o1', token('cliente', null, 'u1'))
        const res = await pedir('o1', token('cliente', null, 'u1'))
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('BillAlreadyRequestedError')
    })

    it('el pedido de otro cliente o inexistente devuelve 404', async () => {
        const ajeno = await pedir('o1', token('cliente', null, 'u2'))
        expect(ajeno.status).toBe(404)
        expect(ajeno.body.error).toBe('OrderNotFoundError')
        expect((await pedir('nope', token('cliente', null, 'u1'))).status).toBe(404)
    })

    it('un código inválido devuelve 400 con mensaje único', async () => {
        const res = await pedir('o1', token('cliente', null, 'u1'), { discountCode: 'NOEXISTE' })
        expect(res.status).toBe(400)
        expect(res.body.message).toBe('Invalid or expired discount code')
    })

    it('canjea puntos y devuelve 400 si no alcanzan', async () => {
        const sinSaldo = await pedir('o1', token('cliente', null, 'u1'), { pointsRuleId: 'p10' })
        expect(sinSaldo.status).toBe(400)
        expect(sinSaldo.body.error).toBe('InsufficientPointsError')

        await points.add('u1', 'r1', 10)
        const conSaldo = await pedir('o2', token('cliente', null, 'u1'), { pointsRuleId: 'p10' })
        expect(conSaldo.status).toBe(201)
        expect(conSaldo.body).toMatchObject({ pointsUsed: 10, pointsDiscount: 1, total: 19 })
    })

    it('una equivalencia inexistente devuelve 404', async () => {
        const res = await pedir('o1', token('cliente', null, 'u1'), { pointsRuleId: 'nope' })
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('PointsRuleNotFoundError')
    })

    it('GET devuelve la cuenta al propietario y al personal del restaurante', async () => {
        await pedir('o1', token('cliente', null, 'u1'))
        const dueno = await request(app).get('/orders/o1/bill').set('Authorization', token('cliente', null, 'u1'))
        expect(dueno.status).toBe(200)
        expect(dueno.body.total).toBe(20)
        const personal = await request(app).get('/orders/o1/bill').set('Authorization', token('camarero', 'r1', 'e1'))
        expect(personal.status).toBe(200)
    })

    it('GET devuelve 404 a otro cliente y si el pedido no tiene cuenta', async () => {
        await pedir('o1', token('cliente', null, 'u1'))
        const ajeno = await request(app).get('/orders/o1/bill').set('Authorization', token('cliente', null, 'u2'))
        expect(ajeno.status).toBe(404)
        const sinCuenta = await request(app).get('/orders/o2/bill').set('Authorization', token('cliente', null, 'u1'))
        expect(sinCuenta.status).toBe(404)
        expect(sinCuenta.body.error).toBe('BillNotFoundError')
    })
})
