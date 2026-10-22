import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteBillRepository } from './bill.repository.js'
import type { Bill } from '@models/bill.model.js'

const ahora = '2026-10-22T10:00:00.000Z'

const cuenta = (cambios: Partial<Bill> = {}): Bill => ({
    id: 'b1', orderId: 'o1', restaurantId: 'r1', clientId: 'u1', subtotal: 20,
    discountCodeId: 'c1', codeDiscount: 2, pointsUsed: 10, pointsDiscount: 1,
    total: 17, pointsEarned: 17, createdAt: ahora, ...cambios
})

describe('SqliteBillRepository (Integration)', () => {
    let db: Database
    let repo: SqliteBillRepository

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqliteBillRepository(db)
        await db.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['r1', 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', ahora, ahora]
        )
        for (const id of ['o1', 'o2']) {
            await db.run('INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at) VALUES (?, ?, ?, ?, ?)', [id, 'r1', null, 'u1', ahora])
        }
    })

    afterEach(async () => {
        await db.close()
    })

    it('guarda y recupera la cuenta de un pedido', async () => {
        await repo.create(cuenta())
        expect(await repo.findByOrderId('o1')).toEqual(cuenta())
    })

    it('guarda una cuenta sin código de descuento', async () => {
        await repo.create(cuenta({ discountCodeId: null, codeDiscount: 0 }))
        expect((await repo.findByOrderId('o1'))?.discountCodeId).toBeNull()
    })

    it('devuelve null si el pedido no tiene cuenta', async () => {
        expect(await repo.findByOrderId('o2')).toBeNull()
    })

    it('no permite dos cuentas para el mismo pedido', async () => {
        await repo.create(cuenta())
        await expect(repo.create(cuenta({ id: 'b2' }))).rejects.toThrow()
    })

    it('borra una cuenta', async () => {
        await repo.create(cuenta())
        await repo.delete('b1')
        expect(await repo.findByOrderId('o1')).toBeNull()
    })
})
