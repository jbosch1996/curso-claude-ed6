import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createPackRouter } from './pack.routes.js'
import { PackService } from '@services/pack.service.js'
import { MockPackRepository } from '@repositories/mocks/MockPackRepository.js'
import { MockDishRepository } from '@repositories/mocks/MockDishRepository.js'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'
import { JWT_SECRET } from '@config/env.js'

const token = (role: string, restaurantId: string | null, id = 'u1') =>
    `Bearer ${jwt.sign({ id, role, restaurantId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`

const cuerpo = { name: 'Menú del día', price: 20, categories: ['entrante', 'principal', 'bebida'] }

describe('rutas /restaurants/:restaurantId/packs', () => {
    let app: express.Express

    const crear = (restaurantId = 'r1', auth = token('manager', 'r1'), body: object = cuerpo) =>
        request(app).post(`/restaurants/${restaurantId}/packs`).set('Authorization', auth).send(body)

    beforeEach(() => {
        app = express()
        app.use(express.json())
        app.use('/restaurants/:restaurantId/packs', createPackRouter(new PackService(new MockPackRepository(), new MockDishRepository())))
        app.use(errorHandler)
    })

    it('devuelve 401 sin token', async () => {
        const res = await request(app).get('/restaurants/r1/packs')
        expect(res.status).toBe(401)
    })

    it.each(['cliente', 'camarero', 'cocinero'])('devuelve 403 al rol %s', async (rol) => {
        const res = await request(app).get('/restaurants/r1/packs').set('Authorization', token(rol, 'r1'))
        expect(res.status).toBe(403)
    })

    it('devuelve 403 a un manager de otro restaurante', async () => {
        const res = await crear('r2', token('manager', 'r1'))
        expect(res.status).toBe(403)
    })

    it('un manager crea un pack en su restaurante (201)', async () => {
        const res = await crear()
        expect(res.status).toBe(201)
        expect(res.body).toMatchObject({ restaurantId: 'r1', name: 'Menú del día', price: 20, available: true, excludedDishIds: [] })
    })

    it('un admin crea un pack en cualquier restaurante', async () => {
        const res = await crear('r2', token('admin', null))
        expect(res.status).toBe(201)
        expect(res.body.restaurantId).toBe('r2')
    })

    it('devuelve 400 con datos inválidos', async () => {
        const res = await crear('r1', token('manager', 'r1'), { ...cuerpo, categories: ['sopa'] })
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('InvalidPackError')
    })

    it('lista solo los packs de su restaurante', async () => {
        await crear('r1')
        await crear('r2', token('admin', null))
        const res = await request(app).get('/restaurants/r1/packs').set('Authorization', token('manager', 'r1'))
        expect(res.status).toBe(200)
        expect(res.body).toHaveLength(1)
    })

    it('devuelve el detalle y 404 si el pack es de otro restaurante', async () => {
        const { body } = await crear('r1')
        const ok = await request(app).get(`/restaurants/r1/packs/${body.id}`).set('Authorization', token('manager', 'r1'))
        expect(ok.status).toBe(200)
        expect(ok.body.id).toBe(body.id)
        const ajeno = await request(app).get(`/restaurants/r2/packs/${body.id}`).set('Authorization', token('admin', null))
        expect(ajeno.status).toBe(404)
        expect(ajeno.body.error).toBe('PackNotFoundError')
    })

    it('actualiza un pack (200)', async () => {
        const { body } = await crear('r1')
        const res = await request(app).put(`/restaurants/r1/packs/${body.id}`).set('Authorization', token('manager', 'r1'))
            .send({ ...cuerpo, name: 'Menú noche', price: 25, available: false })
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ id: body.id, name: 'Menú noche', price: 25, available: false })
    })

    it('borra un pack (204) y después da 404', async () => {
        const { body } = await crear('r1')
        const borrar = () => request(app).delete(`/restaurants/r1/packs/${body.id}`).set('Authorization', token('manager', 'r1'))
        expect((await borrar()).status).toBe(204)
        expect((await borrar()).status).toBe(404)
    })
})
