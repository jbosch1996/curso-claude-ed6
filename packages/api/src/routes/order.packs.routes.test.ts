import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createOrderRouter } from './order.routes.js'
import { OrderService } from '@services/order.service.js'
import { MockOrderRepository } from '@repositories/mocks/MockOrderRepository.js'
import { MockDishRepository } from '@repositories/mocks/MockDishRepository.js'
import { MockPackRepository } from '@repositories/mocks/MockPackRepository.js'
import { JWT_SECRET } from '@config/env.js'

const token = (role: string, restaurantId: string | null, id = 'u1') =>
    `Bearer ${jwt.sign({ id, role, restaurantId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`

describe('POST /orders con packs', () => {
    let app: express.Express

    beforeEach(async () => {
        const dishes = new MockDishRepository()
        const packs = new MockPackRepository()
        for (const [id, category] of [['ensalada', 'entrante'], ['agua', 'bebida'], ['cerveza', 'bebida']] as const) {
            await dishes.save({
                id, name: id, description: null, price: 3, category, available: true, restaurantId: 'rest-1',
                ingredients: [], createdAt: '', updatedAt: ''
            })
        }
        await packs.save({
            id: 'p1', restaurantId: 'rest-1', name: 'Menú', description: null, price: 10, available: true,
            categories: ['entrante', 'bebida'], excludedDishIds: ['cerveza'], createdAt: '', updatedAt: ''
        })
        app = express()
        app.use(express.json())
        app.use('/orders', createOrderRouter(new OrderService(new MockOrderRepository(), dishes, undefined, packs)))
    })

    const pedir = (dishIds: string[]) => request(app).post('/orders').set('Authorization', token('cliente', null, 'c1'))
        .send({ restaurantId: 'rest-1', packs: [{ packId: 'p1', dishIds, quantity: 1 }] })

    it('crea un pedido solo con un pack (201)', async () => {
        const res = await pedir(['ensalada', 'agua'])
        expect(res.status).toBe(201)
        expect(res.body.items).toHaveLength(2)
        expect(res.body.items[0]).toMatchObject({ dishId: 'ensalada', dishPrice: 10, packId: 'p1', packName: 'Menú' })
    })

    it('devuelve 400 si la selección incluye un plato excluido', async () => {
        const res = await pedir(['ensalada', 'cerveza'])
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('Dish cerveza cannot be chosen in pack p1')
    })
})
