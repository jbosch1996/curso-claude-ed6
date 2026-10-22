import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createPublicPackRouter } from './pack.public.routes.js'
import { PackService } from '@services/pack.service.js'
import { MockPackRepository } from '@repositories/mocks/MockPackRepository.js'
import { MockDishRepository } from '@repositories/mocks/MockDishRepository.js'
import { errorHandler } from '@shared/infrastructure/http/errorHandler.js'

describe('ruta pública /public/restaurants/:restaurantId/packs', () => {
    let app: express.Express

    beforeEach(async () => {
        const packs = new MockPackRepository()
        const dishes = new MockDishRepository()
        for (const [id, category] of [['ensalada', 'entrante'], ['agua', 'bebida'], ['cerveza', 'bebida']] as const) {
            await dishes.save({
                id, name: id, description: null, price: 3, category, available: true, restaurantId: 'r1',
                ingredients: [], createdAt: '', updatedAt: ''
            })
        }
        await packs.save({
            id: 'p1', restaurantId: 'r1', name: 'Menú', description: null, price: 10, available: true,
            categories: ['entrante', 'bebida'], excludedDishIds: ['cerveza'], createdAt: '', updatedAt: ''
        })

        app = express()
        app.use('/public/restaurants/:restaurantId/packs', createPublicPackRouter(new PackService(packs, dishes)))
        app.use(errorHandler)
    })

    it('lista sin token los packs con sus platos elegibles y sin datos internos', async () => {
        const res = await request(app).get('/public/restaurants/r1/packs')
        expect(res.status).toBe(200)
        expect(res.body).toHaveLength(1)
        expect(res.body[0]).not.toHaveProperty('excludedDishIds')
        expect(res.body[0]).not.toHaveProperty('createdAt')
        expect(res.body[0].slots).toEqual([
            { category: 'entrante', dishes: [{ id: 'ensalada', name: 'ensalada', description: null, price: 3 }] },
            { category: 'bebida', dishes: [{ id: 'agua', name: 'agua', description: null, price: 3 }] }
        ])
    })

    it('devuelve una lista vacía para un restaurante sin packs', async () => {
        const res = await request(app).get('/public/restaurants/r2/packs')
        expect(res.status).toBe(200)
        expect(res.body).toEqual([])
    })
})
