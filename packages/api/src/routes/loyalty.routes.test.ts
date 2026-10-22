import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createLoyaltyRouter } from './loyalty.routes.js'
import { LoyaltyService } from '@services/loyalty.service.js'
import { MockClientPointsRepository } from '@repositories/mocks/MockClientPointsRepository.js'
import { MockPointsRuleRepository } from '@repositories/mocks/MockPointsRuleRepository.js'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'
import { JWT_SECRET } from '@config/env.js'

const token = (id: string) =>
    `Bearer ${jwt.sign({ id, role: 'cliente', restaurantId: null }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`

describe('rutas /loyalty', () => {
    let app: express.Express

    beforeEach(async () => {
        const points = new MockClientPointsRepository()
        const rules = new MockPointsRuleRepository()
        await points.add('u1', 'r1', 42)
        await rules.save({ id: 'p10', restaurantId: 'r1', points: 10, discount: 1, createdAt: '' })
        app = express()
        app.use(express.json())
        app.use('/loyalty', createLoyaltyRouter(new LoyaltyService(points, rules)))
        app.use(errorHandler)
    })

    it('devuelve 401 sin token', async () => {
        expect((await request(app).get('/loyalty/r1')).status).toBe(401)
    })

    it('devuelve el saldo del cliente del token y las equivalencias del restaurante', async () => {
        const res = await request(app).get('/loyalty/r1').set('Authorization', token('u1'))
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ balance: 42, rules: [{ id: 'p10', points: 10, discount: 1 }] })
    })

    it('otro cliente tiene saldo 0', async () => {
        const res = await request(app).get('/loyalty/r1').set('Authorization', token('u2'))
        expect(res.body.balance).toBe(0)
    })
})
