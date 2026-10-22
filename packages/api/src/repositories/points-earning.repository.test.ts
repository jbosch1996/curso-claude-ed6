import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqlitePointsEarningRepository } from './points-earning.repository.js'
import type { PointsEarningRate } from '@models/points-earning.model.js'

const ahora = '2026-10-22T10:00:00.000Z'

const ritmo = (cambios: Partial<PointsEarningRate> = {}): PointsEarningRate => ({
    restaurantId: 'r1', amount: 10, points: 3, isDefault: false, updatedAt: ahora, ...cambios
})

describe('SqlitePointsEarningRepository (Integration)', () => {
    let db: Database
    let repo: SqlitePointsEarningRepository

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqlitePointsEarningRepository(db)
        for (const id of ['r1', 'r2']) {
            await db.run(
                'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', ahora, ahora]
            )
        }
    })

    afterEach(async () => {
        await db.close()
    })

    it('devuelve null si el restaurante no tiene ritmo configurado', async () => {
        expect(await repo.findByRestaurantId('r1')).toBeNull()
    })

    it('guarda y lee el ritmo de un restaurante', async () => {
        await repo.save(ritmo())
        expect(await repo.findByRestaurantId('r1')).toEqual(ritmo())
        expect(await repo.findByRestaurantId('r2')).toBeNull()
    })

    it('al volver a guardar actualiza el ritmo existente', async () => {
        await repo.save(ritmo())
        await repo.save(ritmo({ amount: 2.5, points: 1, updatedAt: '2026-10-23T10:00:00.000Z' }))
        expect(await repo.findByRestaurantId('r1')).toEqual(ritmo({ amount: 2.5, points: 1, updatedAt: '2026-10-23T10:00:00.000Z' }))
    })
})
