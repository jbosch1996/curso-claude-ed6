import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteDiscountCodeRepository } from './discount-code.repository.js'
import type { DiscountCode } from '@models/discount-code.model.js'

const ahora = '2026-10-22T10:00:00.000Z'

const codigo = (cambios: Partial<DiscountCode> = {}): DiscountCode => ({
    id: 'c1', restaurantId: 'r1', code: 'VERANO10', type: 'percent', value: 10,
    expiresAt: null, active: true, createdAt: ahora, updatedAt: ahora, ...cambios
})

describe('SqliteDiscountCodeRepository (Integration)', () => {
    let db: Database
    let repo: SqliteDiscountCodeRepository

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqliteDiscountCodeRepository(db)
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

    it('guarda y recupera un código por id dentro de su restaurante', async () => {
        await repo.save(codigo({ expiresAt: '2026-12-31T00:00:00.000Z' }))
        expect(await repo.findById('r1', 'c1')).toEqual(codigo({ expiresAt: '2026-12-31T00:00:00.000Z' }))
    })

    it('no devuelve un código de otro restaurante', async () => {
        await repo.save(codigo())
        expect(await repo.findById('r2', 'c1')).toBeNull()
    })

    it('lista solo los códigos del restaurante', async () => {
        await repo.save(codigo())
        await repo.save(codigo({ id: 'c2', restaurantId: 'r2', code: 'OTRO' }))
        const lista = await repo.findByRestaurantId('r1')
        expect(lista.map(c => c.id)).toEqual(['c1'])
    })

    it('busca por código dentro del restaurante', async () => {
        await repo.save(codigo())
        expect((await repo.findByCode('r1', 'VERANO10'))?.id).toBe('c1')
        expect(await repo.findByCode('r2', 'VERANO10')).toBeNull()
    })

    it('actualiza un código existente', async () => {
        await repo.save(codigo())
        await repo.save(codigo({ value: 15, active: false, updatedAt: '2026-10-23T00:00:00.000Z' }))
        const guardado = await repo.findById('r1', 'c1')
        expect(guardado).toMatchObject({ value: 15, active: false })
    })

    it('borra solo si pertenece al restaurante', async () => {
        await repo.save(codigo())
        await repo.delete('r2', 'c1')
        expect(await repo.findById('r1', 'c1')).not.toBeNull()
        await repo.delete('r1', 'c1')
        expect(await repo.findById('r1', 'c1')).toBeNull()
    })
})
