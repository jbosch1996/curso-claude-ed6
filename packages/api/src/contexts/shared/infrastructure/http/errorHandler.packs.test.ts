import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { errorHandler } from './errorHandler.js'
import * as errors from '@errors/DomainErrors.js'

const appQueLanza = (error: Error) => {
    const app = express()
    app.get('/', () => { throw error })
    app.use(errorHandler)
    return app
}

describe('errorHandler (errores de packs)', () => {
    it('devuelve 404 con PackNotFoundError', async () => {
        const res = await request(appQueLanza(new errors.PackNotFoundError())).get('/')
        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: 'PackNotFoundError', message: 'Pack not found' })
    })

    it('devuelve 400 con InvalidPackError y su mensaje', async () => {
        const res = await request(appQueLanza(new errors.InvalidPackError('Price must be a positive number'))).get('/')
        expect(res.status).toBe(400)
        expect(res.body).toEqual({ error: 'InvalidPackError', message: 'Price must be a positive number' })
    })
})
