import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createOrderRouter } from './order.routes.js'
import { OrderService } from '@services/order.service.js'
import { MockOrderRepository } from '@repositories/mocks/MockOrderRepository.js'
import { MockDishRepository } from '@repositories/mocks/MockDishRepository.js'
import { JWT_SECRET } from '@config/env.js'
import type { Order } from '@models/order.model.js'

const token = (role: string, restaurantId: string | null, id = 'u1') =>
    `Bearer ${jwt.sign({ id, role, restaurantId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`

const pedidoBase = (id: string, restaurantId: string, clientId: string | null = null): Order => ({
    id,
    restaurantId,
    tableId: null,
    clientId,
    createdAt: new Date(),
    items: [{ id: `${id}-i1`, dishId: 'dish-1', quantity: 1, notes: null, status: 'pendiente' }]
})

describe('rutas /orders', () => {
    let orderRepo: MockOrderRepository
    let dishRepo: MockDishRepository
    let app: express.Express

    const montarApp = (repo: MockOrderRepository) => {
        const aplicacion = express()
        aplicacion.use(express.json())
        aplicacion.use('/orders', createOrderRouter(new OrderService(repo, dishRepo)))
        return aplicacion
    }

    beforeEach(async () => {
        orderRepo = new MockOrderRepository()
        dishRepo = new MockDishRepository()
        const ahora = new Date().toISOString()
        await dishRepo.save({
            id: 'dish-1', name: 'Pizza', description: null, price: 10, category: 'principal',
            available: true, restaurantId: 'rest-1', ingredients: [], createdAt: ahora, updatedAt: ahora
        })
        await orderRepo.create(pedidoBase('o-r1', 'rest-1', 'cliente-1'))
        await orderRepo.create(pedidoBase('o-r2', 'rest-2', 'cliente-2'))
        app = montarApp(orderRepo)
    })

    it('devuelve 401 sin token', async () => {
        const res = await request(app).get('/orders/active?restaurantId=rest-1')
        expect(res.status).toBe(401)
    })

    describe('GET /orders/active', () => {
        it('devuelve 403 a un cliente', async () => {
            const res = await request(app).get('/orders/active?restaurantId=rest-1').set('Authorization', token('cliente', null))
            expect(res.status).toBe(403)
        })

        it('un empleado ve solo los pedidos de su restaurante e ignora el restaurantId del query', async () => {
            const res = await request(app).get('/orders/active?restaurantId=rest-1').set('Authorization', token('camarero', 'rest-2'))
            expect(res.status).toBe(200)
            expect(res.body.map((o: Order) => o.id)).toEqual(['o-r2'])
        })

        it('el admin debe indicar el restaurante', async () => {
            const sinQuery = await request(app).get('/orders/active').set('Authorization', token('admin', null))
            expect(sinQuery.status).toBe(400)

            const conQuery = await request(app).get('/orders/active?restaurantId=rest-1').set('Authorization', token('admin', null))
            expect(conQuery.status).toBe(200)
            expect(conQuery.body.map((o: Order) => o.id)).toEqual(['o-r1'])
        })
    })

    describe('PATCH /orders/:orderId/items/:itemId/status', () => {
        it('devuelve 403 a un cliente', async () => {
            const res = await request(app)
                .patch('/orders/o-r1/items/o-r1-i1/status')
                .set('Authorization', token('cliente', null, 'cliente-1'))
                .send({ status: 'entregado' })
            expect(res.status).toBe(403)
        })

        it('devuelve 404 a un empleado de otro restaurante y no cambia el estado', async () => {
            const res = await request(app)
                .patch('/orders/o-r1/items/o-r1-i1/status')
                .set('Authorization', token('cocinero', 'rest-2'))
                .send({ status: 'preparando' })
            expect(res.status).toBe(404)
            expect((await orderRepo.findById('o-r1'))!.items[0]!.status).toBe('pendiente')
        })

        it('permite a un cocinero del restaurante pasar a preparando', async () => {
            const res = await request(app)
                .patch('/orders/o-r1/items/o-r1-i1/status')
                .set('Authorization', token('cocinero', 'rest-1'))
                .send({ status: 'preparando' })
            expect(res.status).toBe(204)
        })

        it('devuelve 403 a un cocinero que intenta entregar', async () => {
            const res = await request(app)
                .patch('/orders/o-r1/items/o-r1-i1/status')
                .set('Authorization', token('cocinero', 'rest-1'))
                .send({ status: 'entregado' })
            expect(res.status).toBe(403)
        })

        it('devuelve 400 con un estado inválido o ausente', async () => {
            const invalido = await request(app)
                .patch('/orders/o-r1/items/o-r1-i1/status')
                .set('Authorization', token('manager', 'rest-1'))
                .send({ status: 'volando' })
            expect(invalido.status).toBe(400)

            const ausente = await request(app)
                .patch('/orders/o-r1/items/o-r1-i1/status')
                .set('Authorization', token('manager', 'rest-1'))
                .send({})
            expect(ausente.status).toBe(400)
        })
    })

    describe('GET /orders/:id', () => {
        it('devuelve el pedido a su cliente', async () => {
            const res = await request(app).get('/orders/o-r1').set('Authorization', token('cliente', null, 'cliente-1'))
            expect(res.status).toBe(200)
        })

        it('devuelve 404 a otro cliente', async () => {
            const res = await request(app).get('/orders/o-r1').set('Authorization', token('cliente', null, 'cliente-2'))
            expect(res.status).toBe(404)
        })
    })

    describe('POST /orders', () => {
        it('crea un pedido válido', async () => {
            const res = await request(app)
                .post('/orders')
                .set('Authorization', token('cliente', null, 'cliente-1'))
                .send({ restaurantId: 'rest-1', items: [{ dishId: 'dish-1', quantity: 2, notes: null }] })
            expect(res.status).toBe(201)
            expect(res.body.items).toHaveLength(2)
        })

        it('responde 400 de inmediato con una cantidad enorme', async () => {
            const res = await request(app)
                .post('/orders')
                .set('Authorization', token('cliente', null, 'cliente-1'))
                .send({ restaurantId: 'rest-1', items: [{ dishId: 'dish-1', quantity: 1000000000, notes: null }] })
            expect(res.status).toBe(400)
        })

        it('responde 400 con un plato de otro restaurante', async () => {
            const res = await request(app)
                .post('/orders')
                .set('Authorization', token('cliente', null, 'cliente-1'))
                .send({ restaurantId: 'rest-2', items: [{ dishId: 'dish-1', quantity: 1, notes: null }] })
            expect(res.status).toBe(400)
        })

        it('no filtra el mensaje de un error interno', async () => {
            const repoRoto = new MockOrderRepository()
            repoRoto.create = async () => { throw new Error('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed') }
            const res = await request(montarApp(repoRoto))
                .post('/orders')
                .set('Authorization', token('cliente', null, 'cliente-1'))
                .send({ restaurantId: 'rest-1', items: [{ dishId: 'dish-1', quantity: 1, notes: null }] })
            expect(res.status).toBe(500)
            expect(JSON.stringify(res.body)).not.toContain('SQLITE')
        })
    })
})
