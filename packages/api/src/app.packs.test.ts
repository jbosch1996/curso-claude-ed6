import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { dbConfig } from '@config/database.js'

describe('app: rutas de packs montadas', () => {
    beforeAll(async () => {
        process.env.NODE_ENV = 'test'
        await dbConfig.initialize()
    })

    afterAll(async () => {
        await dbConfig.close()
    })

    it.each([
        ['get', '/api/v1/restaurants/r1/packs'],
        ['post', '/api/v1/restaurants/r1/packs'],
        ['get', '/api/v1/restaurants/r1/packs/p1'],
        ['put', '/api/v1/restaurants/r1/packs/p1'],
        ['delete', '/api/v1/restaurants/r1/packs/p1']
    ] as const)('%s %s exige autenticación (401, no 404)', async (metodo, ruta) => {
        const res = await request(app)[metodo](ruta)
        expect(res.status).toBe(401)
    })

    it('la carta pública de packs no exige autenticación', async () => {
        const res = await request(app).get('/api/v1/public/restaurants/r1/packs')
        expect(res.status).toBe(200)
        expect(res.body).toEqual([])
    })
})
