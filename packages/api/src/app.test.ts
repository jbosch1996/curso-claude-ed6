import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from './app.js'

describe('app: rutas de descuentos y puntos montadas', () => {
    it.each([
        ['get', '/api/v1/restaurants/r1/discount-codes'],
        ['post', '/api/v1/restaurants/r1/discount-codes'],
        ['get', '/api/v1/restaurants/r1/points-rules'],
        ['get', '/api/v1/loyalty/r1'],
        ['post', '/api/v1/orders/o1/bill'],
        ['get', '/api/v1/orders/o1/bill']
    ] as const)('%s %s exige autenticación (401, no 404)', async (metodo, ruta) => {
        const res = await request(app)[metodo](ruta)
        expect(res.status).toBe(401)
    })
})
