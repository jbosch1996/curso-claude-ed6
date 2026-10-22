import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { authenticate, requireRestaurantAccess, type AuthRequest } from './middlewares.js'
import { JWT_SECRET } from '@config/env.js'

const crearApp = () => {
    const app = express()
    app.get('/protegida', authenticate, (req: AuthRequest, res) => {
        res.status(200).json({ user: req.user })
    })
    return app
}

const payload = { id: 'u1', role: 'manager', restaurantId: 'rest-1' }

describe('authenticate', () => {
    it('devuelve 401 sin cabecera Authorization', async () => {
        const res = await request(crearApp()).get('/protegida')
        expect(res.status).toBe(401)
    })

    it('devuelve 401 con un token mal firmado', async () => {
        const token = jwt.sign(payload, 'otro-secreto-cualquiera')
        const res = await request(crearApp()).get('/protegida').set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(401)
    })

    it('rechaza un token firmado con el secreto público antiguo', async () => {
        const token = jwt.sign(payload, 'super-secret-resttek-key')
        const res = await request(crearApp()).get('/protegida').set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(401)
    })

    it('rechaza un token con alg none', async () => {
        const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
        const cuerpo = Buffer.from(JSON.stringify(payload)).toString('base64url')
        const res = await request(crearApp()).get('/protegida').set('Authorization', `Bearer ${cabecera}.${cuerpo}.`)
        expect(res.status).toBe(401)
    })

    it('rechaza un token firmado con un algoritmo distinto de HS256', async () => {
        const token = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS512' })
        const res = await request(crearApp()).get('/protegida').set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(401)
    })

    it('devuelve 401 con un token caducado', async () => {
        const token = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: -10 })
        const res = await request(crearApp()).get('/protegida').set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(401)
    })

    it('acepta un token válido y rellena req.user', async () => {
        const token = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })
        const res = await request(crearApp()).get('/protegida').set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.user).toMatchObject(payload)
    })
})

describe('requireRestaurantAccess', () => {
    const crearAppConUsuario = () => {
        const app = express()
        const simularUsuario = (req: AuthRequest, _res: express.Response, next: express.NextFunction) => {
            const cabecera = req.headers['x-user']
            if (typeof cabecera === 'string') req.user = JSON.parse(cabecera)
            next()
        }
        app.use(simularUsuario)
        app.get('/restaurants/:restaurantId/recurso', requireRestaurantAccess(), (_req, res) => {
            res.status(200).json({ ok: true })
        })
        app.get('/restaurantes/:id', requireRestaurantAccess('id'), (_req, res) => {
            res.status(200).json({ ok: true })
        })
        return app
    }

    const usuario = (role: string, restaurantId: string | null) => JSON.stringify({ id: 'u1', role, restaurantId })

    it('deja pasar al admin a cualquier restaurante', async () => {
        const res = await request(crearAppConUsuario()).get('/restaurants/rest-2/recurso').set('x-user', usuario('admin', null))
        expect(res.status).toBe(200)
    })

    it('deja pasar a un empleado de su propio restaurante', async () => {
        const res = await request(crearAppConUsuario()).get('/restaurants/rest-1/recurso').set('x-user', usuario('manager', 'rest-1'))
        expect(res.status).toBe(200)
    })

    it('devuelve 403 a un manager de otro restaurante', async () => {
        const res = await request(crearAppConUsuario()).get('/restaurants/rest-2/recurso').set('x-user', usuario('manager', 'rest-1'))
        expect(res.status).toBe(403)
    })

    it('devuelve 403 a un usuario sin restaurante asignado', async () => {
        const res = await request(crearAppConUsuario()).get('/restaurants/rest-1/recurso').set('x-user', usuario('cliente', null))
        expect(res.status).toBe(403)
    })

    it('devuelve 403 si no hay usuario autenticado', async () => {
        const res = await request(crearAppConUsuario()).get('/restaurants/rest-1/recurso')
        expect(res.status).toBe(403)
    })

    it('admite un nombre de parámetro personalizado', async () => {
        const permitido = await request(crearAppConUsuario()).get('/restaurantes/rest-1').set('x-user', usuario('manager', 'rest-1'))
        const denegado = await request(crearAppConUsuario()).get('/restaurantes/rest-2').set('x-user', usuario('manager', 'rest-1'))
        expect(permitido.status).toBe(200)
        expect(denegado.status).toBe(403)
    })
})
