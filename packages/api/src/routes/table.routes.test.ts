import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createTableRouter } from './table.routes.js'
import { TableService } from '@services/table.service.js'
import { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'
import { JWT_SECRET } from '@config/env.js'

const token = (role: string, restaurantId: string | null, id = 'u1') =>
    `Bearer ${jwt.sign({ id, role, restaurantId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`

const ADMIN = token('admin', null)
const MANAGER_R1 = token('manager', 'r1')
const CAMARERO_R1 = token('camarero', 'r1')
const COCINERO_R1 = token('cocinero', 'r1')
const CLIENTE = token('cliente', null, 'c1')

describe('rutas /restaurants/:restaurantId/tables', () => {
    let app: express.Express

    const crear = (restaurantId = 'r1', auth = ADMIN, cuerpo: object = { number: 1, capacity: 4, description: 'Terraza' }) =>
        request(app).post(`/restaurants/${restaurantId}/tables`).set('Authorization', auth).send(cuerpo)

    beforeEach(() => {
        app = express()
        app.use(express.json())
        app.use('/restaurants/:restaurantId/tables', createTableRouter(new TableService(new MockTableRepository())))
        app.use(errorHandler)
    })

    describe('CRUD (solo admin)', () => {
        it('devuelve 401 sin token', async () => {
            expect((await request(app).get('/restaurants/r1/tables')).status).toBe(401)
            expect((await request(app).post('/restaurants/r1/tables').send({})).status).toBe(401)
        })

        it.each([['manager', MANAGER_R1], ['camarero', CAMARERO_R1], ['cliente', CLIENTE]])('devuelve 403 al rol %s al crear', async (_r, auth) => {
            expect((await crear('r1', auth)).status).toBe(403)
        })

        it('crea una mesa libre (201)', async () => {
            const res = await crear()
            expect(res.status).toBe(201)
            expect(res.body).toMatchObject({ restaurantId: 'r1', number: 1, capacity: 4, description: 'Terraza', status: 'libre' })
        })

        it('devuelve 400 con datos inválidos o número duplicado', async () => {
            const invalido = await crear('r1', ADMIN, { number: 1, capacity: 0 })
            expect(invalido.status).toBe(400)
            expect(invalido.body.error).toBe('InvalidTableError')

            await crear()
            const duplicado = await crear()
            expect(duplicado.status).toBe(400)
            expect(duplicado.body.error).toBe('DuplicatedTableNumberError')
        })

        it('actualiza una mesa (200), 404 si no existe, 400 si es inválida', async () => {
            const { body } = await crear()
            const ok = await request(app).put(`/restaurants/r1/tables/${body.id}`).set('Authorization', ADMIN)
                .send({ number: 2, capacity: 6, description: null, status: 'reservada' })
            expect(ok.status).toBe(200)
            expect(ok.body).toMatchObject({ number: 2, capacity: 6, description: null, status: 'reservada' })

            const noExiste = await request(app).put('/restaurants/r1/tables/nope').set('Authorization', ADMIN).send({ number: 2, capacity: 6 })
            expect(noExiste.status).toBe(404)
            expect(noExiste.body.error).toBe('TableNotFoundError')

            const invalida = await request(app).put(`/restaurants/r1/tables/${body.id}`).set('Authorization', ADMIN).send({ number: 2, capacity: 0 })
            expect(invalida.status).toBe(400)
        })

        it('borra una mesa libre (204) y después da 404', async () => {
            const { body } = await crear()
            expect((await request(app).delete(`/restaurants/r1/tables/${body.id}`).set('Authorization', ADMIN)).status).toBe(204)
            expect((await request(app).delete(`/restaurants/r1/tables/${body.id}`).set('Authorization', ADMIN)).status).toBe(404)
        })

        it('no borra una mesa ocupada (400)', async () => {
            const { body } = await crear('r1', ADMIN, { number: 1, capacity: 4, status: 'ocupada' })
            const res = await request(app).delete(`/restaurants/r1/tables/${body.id}`).set('Authorization', ADMIN)
            expect(res.status).toBe(400)
            expect(res.body.error).toBe('TableOccupiedError')
        })
    })

    describe('consulta (personal del restaurante)', () => {
        it.each([['manager', MANAGER_R1], ['camarero', CAMARERO_R1], ['cocinero', COCINERO_R1], ['admin', ADMIN]])('el rol %s lista las mesas con su estado', async (_r, auth) => {
            await crear('r1')
            const res = await request(app).get('/restaurants/r1/tables').set('Authorization', auth)
            expect(res.status).toBe(200)
            expect(res.body).toHaveLength(1)
            expect(res.body[0].status).toBe('libre')
        })

        it('devuelve 403 a un cliente y al personal de otro restaurante', async () => {
            expect((await request(app).get('/restaurants/r1/tables').set('Authorization', CLIENTE)).status).toBe(403)
            expect((await request(app).get('/restaurants/r2/tables').set('Authorization', CAMARERO_R1)).status).toBe(403)
        })

        it('lista solo las mesas del restaurante', async () => {
            await crear('r1')
            await crear('r2')
            const res = await request(app).get('/restaurants/r1/tables').set('Authorization', CAMARERO_R1)
            expect(res.body).toHaveLength(1)
        })

        it('devuelve el detalle y 404 si es de otro restaurante o no existe', async () => {
            const { body } = await crear('r1')
            expect((await request(app).get(`/restaurants/r1/tables/${body.id}`).set('Authorization', CAMARERO_R1)).status).toBe(200)
            const ajeno = await request(app).get(`/restaurants/r2/tables/${body.id}`).set('Authorization', ADMIN)
            expect(ajeno.status).toBe(404)
            expect(ajeno.body.error).toBe('TableNotFoundError')
            expect((await request(app).get('/restaurants/r1/tables/nope').set('Authorization', ADMIN)).status).toBe(404)
        })
    })

    describe('PATCH /:id/status', () => {
        it.each([['camarero', CAMARERO_R1], ['manager', MANAGER_R1], ['cocinero', COCINERO_R1], ['admin', ADMIN]])('el rol %s cambia el estado (200)', async (_r, auth) => {
            const { body } = await crear()
            const res = await request(app).patch(`/restaurants/r1/tables/${body.id}/status`).set('Authorization', auth).send({ status: 'ocupada' })
            expect(res.status).toBe(200)
            expect(res.body.status).toBe('ocupada')
        })

        it('devuelve 403 a un cliente y a un camarero de otro restaurante', async () => {
            const { body } = await crear()
            expect((await request(app).patch(`/restaurants/r1/tables/${body.id}/status`).set('Authorization', CLIENTE).send({ status: 'libre' })).status).toBe(403)
            expect((await request(app).patch(`/restaurants/r1/tables/${body.id}/status`).set('Authorization', token('camarero', 'r2')).send({ status: 'libre' })).status).toBe(403)
        })

        it('devuelve 400 con un estado inválido y 404 si la mesa no existe', async () => {
            const { body } = await crear()
            const invalido = await request(app).patch(`/restaurants/r1/tables/${body.id}/status`).set('Authorization', CAMARERO_R1).send({ status: 'rota' })
            expect(invalido.status).toBe(400)
            expect(invalido.body.error).toBe('InvalidTableStatusError')
            expect((await request(app).patch('/restaurants/r1/tables/nope/status').set('Authorization', CAMARERO_R1).send({ status: 'libre' })).status).toBe(404)
        })
    })

    describe('cliente: GET /available y POST /:id/occupy', () => {
        const disponibles = (guests: string, auth = CLIENTE, restaurantId = 'r1') =>
            request(app).get(`/restaurants/${restaurantId}/tables/available?guests=${guests}`).set('Authorization', auth)

        it('devuelve 401 sin token y 403 al personal', async () => {
            expect((await request(app).get('/restaurants/r1/tables/available?guests=2')).status).toBe(401)
            expect((await disponibles('2', CAMARERO_R1)).status).toBe(403)
            expect((await disponibles('2', ADMIN)).status).toBe(403)
        })

        it('lista solo mesas libres con capacidad suficiente, sin estado ni datos internos', async () => {
            await crear('r1', ADMIN, { number: 1, capacity: 2 })
            await crear('r1', ADMIN, { number: 2, capacity: 4, description: 'Ventana' })
            await crear('r1', ADMIN, { number: 3, capacity: 6, status: 'ocupada' })
            const res = await disponibles('3')
            expect(res.status).toBe(200)
            expect(res.body).toEqual([{ id: expect.any(String), number: 2, description: 'Ventana', capacity: 4 }])
        })

        it.each(['0', '-1', 'abc', '', '51', '2.5'])('devuelve 400 con guests=%j', async (guests) => {
            const res = await disponibles(guests)
            expect(res.status).toBe(400)
            expect(res.body.error).toBe('InvalidTableError')
        })

        it('devuelve 400 si falta guests', async () => {
            const res = await request(app).get('/restaurants/r1/tables/available').set('Authorization', CLIENTE)
            expect(res.status).toBe(400)
        })

        it('/available no se confunde con un id de mesa', async () => {
            const res = await disponibles('2')
            expect(res.status).toBe(200)
            expect(Array.isArray(res.body)).toBe(true)
        })

        it('ocupa una mesa libre (200) y ya no aparece como disponible', async () => {
            const { body } = await crear('r1', ADMIN, { number: 1, capacity: 4 })
            const res = await request(app).post(`/restaurants/r1/tables/${body.id}/occupy`).set('Authorization', CLIENTE).send({ guests: 3 })
            expect(res.status).toBe(200)
            expect(res.body).toEqual({ id: body.id, number: 1, description: null, capacity: 4 })
            expect((await disponibles('1')).body).toEqual([])
            const estado = await request(app).get(`/restaurants/r1/tables/${body.id}`).set('Authorization', CAMARERO_R1)
            expect(estado.body.status).toBe('ocupada')
        })

        it('la segunda ocupación devuelve 400 TableNotAvailableError', async () => {
            const { body } = await crear()
            await request(app).post(`/restaurants/r1/tables/${body.id}/occupy`).set('Authorization', CLIENTE).send({ guests: 2 })
            const otra = await request(app).post(`/restaurants/r1/tables/${body.id}/occupy`).set('Authorization', token('cliente', null, 'c2')).send({ guests: 2 })
            expect(otra.status).toBe(400)
            expect(otra.body.error).toBe('TableNotAvailableError')
        })

        it('devuelve 400 si la mesa es pequeña o de otro restaurante, y con guests inválido', async () => {
            const { body } = await crear('r1', ADMIN, { number: 1, capacity: 2 })
            expect((await request(app).post(`/restaurants/r1/tables/${body.id}/occupy`).set('Authorization', CLIENTE).send({ guests: 3 })).status).toBe(400)
            expect((await request(app).post(`/restaurants/r2/tables/${body.id}/occupy`).set('Authorization', CLIENTE).send({ guests: 2 })).status).toBe(400)
            expect((await request(app).post(`/restaurants/r1/tables/${body.id}/occupy`).set('Authorization', CLIENTE).send({ guests: 0 })).status).toBe(400)
            expect((await request(app).post(`/restaurants/r1/tables/${body.id}/occupy`).set('Authorization', CLIENTE).send({})).status).toBe(400)
        })

        it('devuelve 403 si ocupa un empleado y 401 sin token', async () => {
            const { body } = await crear()
            expect((await request(app).post(`/restaurants/r1/tables/${body.id}/occupy`).set('Authorization', CAMARERO_R1).send({ guests: 2 })).status).toBe(403)
            expect((await request(app).post(`/restaurants/r1/tables/${body.id}/occupy`).send({ guests: 2 })).status).toBe(401)
        })
    })
})
