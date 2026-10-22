import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqlitePackRepository } from './pack.repository.js'
import type { Pack } from '@models/pack.model.js'

const ahora = '2026-10-22T10:00:00.000Z'

const pack = (cambios: Partial<Pack> = {}): Pack => ({
    id: 'p1', restaurantId: 'r1', name: 'Menú del día', description: 'Con pan', price: 18,
    available: true, categories: ['principal', 'entrante', 'bebida'], excludedDishIds: ['d-cerveza'],
    createdAt: ahora, updatedAt: ahora, ...cambios
})

describe('SqlitePackRepository (Integration)', () => {
    let db: Database
    let repo: SqlitePackRepository

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqlitePackRepository(db)
        for (const id of ['r1', 'r2']) {
            await db.run(
                'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', ahora, ahora]
            )
        }
        for (const [id, category] of [['d-cerveza', 'bebida'], ['d-cola', 'bebida']]) {
            await db.run(
                'INSERT INTO dishes (id, name, description, price, category, available, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, id, null, 3, category, 1, 'r1', ahora, ahora]
            )
        }
    })

    afterEach(async () => {
        await db.close()
    })

    it('guarda y recupera un pack con sus categorías en orden y sus excluidos', async () => {
        await repo.save(pack())
        expect(await repo.findById('p1')).toEqual(pack())
    })

    it('devuelve null si no existe', async () => {
        expect(await repo.findById('nope')).toBeNull()
    })

    it('guarda available como booleano', async () => {
        await repo.save(pack({ available: false }))
        expect((await repo.findById('p1'))!.available).toBe(false)
    })

    it('actualiza los campos, las categorías y los excluidos', async () => {
        await repo.save(pack())
        const cambiado = pack({ name: 'Menú noche', price: 25, description: null, categories: ['bebida'], excludedDishIds: ['d-cola'], updatedAt: '2026-10-23T10:00:00.000Z' })
        await repo.save(cambiado)
        expect(await repo.findById('p1')).toEqual(cambiado)
    })

    it('lista los packs de un restaurante ordenados por nombre', async () => {
        await repo.save(pack({ id: 'p1', name: 'Zeta' }))
        await repo.save(pack({ id: 'p2', name: 'Alfa', excludedDishIds: [] }))
        await repo.save(pack({ id: 'p3', restaurantId: 'r2', excludedDishIds: [] }))
        const packs = await repo.findByRestaurantId('r1')
        expect(packs.map(p => p.id)).toEqual(['p2', 'p1'])
        expect(packs[1]!.categories).toEqual(['principal', 'entrante', 'bebida'])
    })

    it('borra el pack con sus categorías y excluidos', async () => {
        await repo.save(pack())
        await repo.delete('p1')
        expect(await repo.findById('p1')).toBeNull()
        expect(await db.all('SELECT * FROM pack_categories')).toHaveLength(0)
        expect(await db.all('SELECT * FROM pack_excluded_dishes')).toHaveLength(0)
    })
})
