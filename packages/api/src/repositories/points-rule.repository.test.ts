import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqlitePointsRuleRepository } from './points-rule.repository.js'
import type { PointsRule } from '@models/points-rule.model.js'

const ahora = '2026-10-22T10:00:00.000Z'

const regla = (cambios: Partial<PointsRule> = {}): PointsRule => ({
    id: 'p1', restaurantId: 'r1', points: 10, discount: 1, createdAt: ahora, ...cambios
})

describe('SqlitePointsRuleRepository (Integration)', () => {
    let db: Database
    let repo: SqlitePointsRuleRepository

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqlitePointsRuleRepository(db)
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

    it('guarda y recupera una equivalencia por id dentro de su restaurante', async () => {
        await repo.save(regla())
        expect(await repo.findById('r1', 'p1')).toEqual(regla())
        expect(await repo.findById('r2', 'p1')).toBeNull()
    })

    it('lista las equivalencias del restaurante ordenadas por puntos', async () => {
        await repo.save(regla({ id: 'p100', points: 100, discount: 10 }))
        await repo.save(regla({ id: 'p10', points: 10, discount: 1 }))
        await repo.save(regla({ id: 'x', restaurantId: 'r2', points: 5, discount: 1 }))
        const lista = await repo.findByRestaurantId('r1')
        expect(lista.map(r => r.points)).toEqual([10, 100])
    })

    it('busca por número de puntos dentro del restaurante', async () => {
        await repo.save(regla())
        expect((await repo.findByPoints('r1', 10))?.id).toBe('p1')
        expect(await repo.findByPoints('r2', 10)).toBeNull()
    })

    it('actualiza una equivalencia existente', async () => {
        await repo.save(regla())
        await repo.save(regla({ points: 20, discount: 3 }))
        expect(await repo.findById('r1', 'p1')).toMatchObject({ points: 20, discount: 3 })
    })

    it('borra solo si pertenece al restaurante', async () => {
        await repo.save(regla())
        await repo.delete('r2', 'p1')
        expect(await repo.findById('r1', 'p1')).not.toBeNull()
        await repo.delete('r1', 'p1')
        expect(await repo.findById('r1', 'p1')).toBeNull()
    })
})
