import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from './app.js'

describe('app: rutas de mesas montadas y protegidas', () => {
    it.each([
        ['get', '/api/v1/restaurants/r1/tables'],
        ['post', '/api/v1/restaurants/r1/tables'],
        ['get', '/api/v1/restaurants/r1/tables/available?guests=2'],
        ['post', '/api/v1/restaurants/r1/tables/t1/occupy'],
        ['patch', '/api/v1/restaurants/r1/tables/t1/status']
    ] as const)('%s %s exige autenticación (401, no 404)', async (metodo, ruta) => {
        const res = await request(app)[metodo](ruta)
        expect(res.status).toBe(401)
    })
})
