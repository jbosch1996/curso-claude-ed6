import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createPointsRuleRouter } from './points-rule.routes.js'
import { PointsRuleService } from '@services/points-rule.service.js'
import { MockPointsRuleRepository } from '@repositories/mocks/MockPointsRuleRepository.js'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'
import { JWT_SECRET } from '@config/env.js'

const token = (role: string, restaurantId: string | null, id = 'u1') =>
    `Bearer ${jwt.sign({ id, role, restaurantId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`

describe('rutas /restaurants/:restaurantId/points-rules', () => {
    let app: express.Express

    const crear = (restaurantId = 'r1', auth = token('manager', 'r1'), cuerpo: object = { points: 10, discount: 1 }) =>
        request(app).post(`/restaurants/${restaurantId}/points-rules`).set('Authorization', auth).send(cuerpo)

    beforeEach(() => {
        app = express()
        app.use(express.json())
        app.use('/restaurants/:restaurantId/points-rules', createPointsRuleRouter(new PointsRuleService(new MockPointsRuleRepository())))
        app.use(errorHandler)
    })

    it('devuelve 401 sin token', async () => {
        const res = await request(app).get('/restaurants/r1/points-rules')
        expect(res.status).toBe(401)
    })

    it.each(['cliente', 'camarero', 'cocinero'])('devuelve 403 al rol %s', async (rol) => {
        const res = await request(app).get('/restaurants/r1/points-rules').set('Authorization', token(rol, 'r1'))
        expect(res.status).toBe(403)
    })

    it('devuelve 403 a un manager de otro restaurante', async () => {
        const res = await crear('r2', token('manager', 'r1'))
        expect(res.status).toBe(403)
    })

    it('crea una equivalencia (201)', async () => {
        const res = await crear()
        expect(res.status).toBe(201)
        expect(res.body).toMatchObject({ restaurantId: 'r1', points: 10, discount: 1 })
    })

    it('devuelve 400 con datos inválidos o puntos duplicados', async () => {
        const invalido = await crear('r1', token('manager', 'r1'), { points: 0, discount: 1 })
        expect(invalido.status).toBe(400)
        expect(invalido.body.error).toBe('InvalidPointsRuleError')

        await crear()
        const duplicado = await crear()
        expect(duplicado.status).toBe(400)
        expect(duplicado.body.error).toBe('DuplicatedPointsRuleError')
    })

    it('lista ordenado por puntos y solo del restaurante', async () => {
        await crear('r1', token('admin', null), { points: 100, discount: 10 })
        await crear('r1', token('admin', null), { points: 10, discount: 1 })
        await crear('r2', token('admin', null), { points: 5, discount: 1 })
        const res = await request(app).get('/restaurants/r1/points-rules').set('Authorization', token('manager', 'r1'))
        expect(res.status).toBe(200)
        expect(res.body.map((r: { points: number }) => r.points)).toEqual([10, 100])
    })

    it('actualiza (200), y devuelve 404 si es de otro restaurante', async () => {
        const { body } = await crear('r1')
        const ok = await request(app).put(`/restaurants/r1/points-rules/${body.id}`).set('Authorization', token('manager', 'r1')).send({ points: 20, discount: 3 })
        expect(ok.status).toBe(200)
        expect(ok.body).toMatchObject({ points: 20, discount: 3 })
        const ajeno = await request(app).put(`/restaurants/r2/points-rules/${body.id}`).set('Authorization', token('admin', null)).send({ points: 20, discount: 3 })
        expect(ajeno.status).toBe(404)
        expect(ajeno.body.error).toBe('PointsRuleNotFoundError')
    })

    it('borra (204) y después da 404', async () => {
        const { body } = await crear('r1')
        const borrado = await request(app).delete(`/restaurants/r1/points-rules/${body.id}`).set('Authorization', token('manager', 'r1'))
        expect(borrado.status).toBe(204)
        const otra = await request(app).delete(`/restaurants/r1/points-rules/${body.id}`).set('Authorization', token('manager', 'r1'))
        expect(otra.status).toBe(404)
    })
})
