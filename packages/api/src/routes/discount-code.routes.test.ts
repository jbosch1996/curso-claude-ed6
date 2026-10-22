import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createDiscountCodeRouter } from './discount-code.routes.js'
import { DiscountCodeService } from '@services/discount-code.service.js'
import { MockDiscountCodeRepository } from '@repositories/mocks/MockDiscountCodeRepository.js'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'
import { JWT_SECRET } from '@config/env.js'

const token = (role: string, restaurantId: string | null, id = 'u1') =>
    `Bearer ${jwt.sign({ id, role, restaurantId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`

describe('rutas /restaurants/:restaurantId/discount-codes', () => {
    let app: express.Express

    const crear = (restaurantId = 'r1', auth = token('manager', 'r1'), cuerpo: object = { code: 'verano10', type: 'percent', value: 10 }) =>
        request(app).post(`/restaurants/${restaurantId}/discount-codes`).set('Authorization', auth).send(cuerpo)

    beforeEach(() => {
        app = express()
        app.use(express.json())
        app.use('/restaurants/:restaurantId/discount-codes', createDiscountCodeRouter(new DiscountCodeService(new MockDiscountCodeRepository())))
        app.use(errorHandler)
    })

    it('devuelve 401 sin token', async () => {
        const res = await request(app).get('/restaurants/r1/discount-codes')
        expect(res.status).toBe(401)
    })

    it.each(['cliente', 'camarero', 'cocinero'])('devuelve 403 al rol %s', async (rol) => {
        const res = await request(app).get('/restaurants/r1/discount-codes').set('Authorization', token(rol, 'r1'))
        expect(res.status).toBe(403)
    })

    it('devuelve 403 a un manager de otro restaurante', async () => {
        const res = await crear('r2', token('manager', 'r1'))
        expect(res.status).toBe(403)
    })

    it('un manager crea un código en su restaurante (201, código normalizado)', async () => {
        const res = await crear()
        expect(res.status).toBe(201)
        expect(res.body).toMatchObject({ restaurantId: 'r1', code: 'VERANO10', type: 'percent', value: 10, active: true, expiresAt: null })
    })

    it('un admin crea un código en cualquier restaurante', async () => {
        const res = await crear('r2', token('admin', null))
        expect(res.status).toBe(201)
        expect(res.body.restaurantId).toBe('r2')
    })

    it('devuelve 400 con datos inválidos o código duplicado', async () => {
        const invalido = await crear('r1', token('manager', 'r1'), { code: 'x', type: 'percent', value: 10 })
        expect(invalido.status).toBe(400)
        expect(invalido.body.error).toBe('InvalidDiscountCodeError')

        await crear()
        const duplicado = await crear()
        expect(duplicado.status).toBe(400)
        expect(duplicado.body.error).toBe('DuplicatedDiscountCodeError')
    })

    it('lista solo los códigos de su restaurante', async () => {
        await crear('r1')
        await crear('r2', token('admin', null))
        const res = await request(app).get('/restaurants/r1/discount-codes').set('Authorization', token('manager', 'r1'))
        expect(res.status).toBe(200)
        expect(res.body).toHaveLength(1)
    })

    it('devuelve el detalle y 404 si el código es de otro restaurante', async () => {
        const { body } = await crear('r1')
        const ok = await request(app).get(`/restaurants/r1/discount-codes/${body.id}`).set('Authorization', token('manager', 'r1'))
        expect(ok.status).toBe(200)
        const ajeno = await request(app).get(`/restaurants/r2/discount-codes/${body.id}`).set('Authorization', token('admin', null))
        expect(ajeno.status).toBe(404)
        expect(ajeno.body.error).toBe('DiscountCodeNotFoundError')
    })

    it('actualiza un código (200) y devuelve 404 si no existe', async () => {
        const { body } = await crear('r1')
        const ok = await request(app).put(`/restaurants/r1/discount-codes/${body.id}`).set('Authorization', token('manager', 'r1'))
            .send({ code: 'verano10', type: 'fixed', value: 5, active: false })
        expect(ok.status).toBe(200)
        expect(ok.body).toMatchObject({ type: 'fixed', value: 5, active: false })
        const noExiste = await request(app).put('/restaurants/r1/discount-codes/nope').set('Authorization', token('manager', 'r1'))
            .send({ code: 'verano10', type: 'fixed', value: 5 })
        expect(noExiste.status).toBe(404)
    })

    it('borra un código (204) y después da 404', async () => {
        const { body } = await crear('r1')
        const borrado = await request(app).delete(`/restaurants/r1/discount-codes/${body.id}`).set('Authorization', token('manager', 'r1'))
        expect(borrado.status).toBe(204)
        const otra = await request(app).delete(`/restaurants/r1/discount-codes/${body.id}`).set('Authorization', token('manager', 'r1'))
        expect(otra.status).toBe(404)
    })
})
