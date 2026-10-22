import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createPointsEarningRouter } from './points-earning.routes.js'
import { PointsEarningService } from '@services/points-earning.service.js'
import { MockPointsEarningRepository } from '@repositories/mocks/MockPointsEarningRepository.js'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'
import { JWT_SECRET } from '@config/env.js'

const token = (role: string, restaurantId: string | null, id = 'u1') =>
    `Bearer ${jwt.sign({ id, role, restaurantId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`

describe('rutas /restaurants/:restaurantId/points-earning', () => {
    let app: express.Express

    const consultar = (restaurantId = 'r1', auth = token('manager', 'r1')) =>
        request(app).get(`/restaurants/${restaurantId}/points-earning`).set('Authorization', auth)

    const guardar = (restaurantId = 'r1', auth = token('manager', 'r1'), cuerpo: object = { amount: 10, points: 3 }) =>
        request(app).put(`/restaurants/${restaurantId}/points-earning`).set('Authorization', auth).send(cuerpo)

    beforeEach(() => {
        app = express()
        app.use(express.json())
        app.use('/restaurants/:restaurantId/points-earning', createPointsEarningRouter(new PointsEarningService(new MockPointsEarningRepository())))
        app.use(errorHandler)
    })

    it('devuelve 401 sin token', async () => {
        expect((await request(app).get('/restaurants/r1/points-earning')).status).toBe(401)
        expect((await request(app).put('/restaurants/r1/points-earning').send({ amount: 10, points: 3 })).status).toBe(401)
    })

    it.each(['cliente', 'camarero', 'cocinero'])('devuelve 403 al rol %s', async (rol) => {
        expect((await consultar('r1', token(rol, 'r1'))).status).toBe(403)
        expect((await guardar('r1', token(rol, 'r1'))).status).toBe(403)
    })

    it('devuelve 403 a un manager de otro restaurante', async () => {
        expect((await consultar('r2')).status).toBe(403)
        const res = await guardar('r2')
        expect(res.status).toBe(403)
        expect(res.body.error).toBe('Forbidden: No access to this restaurant')
    })

    it('sin configuración devuelve el ritmo por defecto (200)', async () => {
        const res = await consultar()
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ restaurantId: 'r1', amount: 1, points: 1, isDefault: true, updatedAt: null })
    })

    it('guarda el ritmo (200) y lo devuelve después', async () => {
        const res = await guardar()
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ restaurantId: 'r1', amount: 10, points: 3, isDefault: false })

        const leido = await consultar()
        expect(leido.body).toMatchObject({ amount: 10, points: 3, isDefault: false })
    })

    it('devuelve 400 con datos inválidos o sin cuerpo', async () => {
        const invalido = await guardar('r1', token('manager', 'r1'), { amount: 0, points: 3 })
        expect(invalido.status).toBe(400)
        expect(invalido.body.error).toBe('InvalidPointsEarningError')

        const sinCuerpo = await request(app).put('/restaurants/r1/points-earning').set('Authorization', token('manager', 'r1'))
        expect(sinCuerpo.status).toBe(400)
    })

    it('el admin puede gestionar cualquier restaurante', async () => {
        const res = await guardar('r2', token('admin', null), { amount: 5, points: 1 })
        expect(res.status).toBe(200)
        expect((await consultar('r2', token('admin', null))).body).toMatchObject({ amount: 5, points: 1 })
    })
})
