import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteOrderRepository } from '@repositories/order.repository.js'
import type { Order } from '@models/order.model.js'

describe('SqliteOrderRepository (Integration)', () => {
    let db: Database
    let repo: SqliteOrderRepository

    const pedido = (id: string, dishIds: string[]): Order => ({
        id,
        restaurantId: 'r1',
        tableId: null,
        clientId: null,
        createdAt: new Date(),
        items: dishIds.map((dishId, i) => ({
            id: `${id}-item-${i}`,
            dishId,
            quantity: 1,
            notes: null,
            status: 'pendiente' as const
        }))
    })

    beforeAll(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqliteOrderRepository(db)

        const ahora = new Date().toISOString()
        await db.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['r1', 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', ahora, ahora]
        )
        await db.run(
            'INSERT INTO dishes (id, name, description, price, category, available, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['d1', 'Pizza', null, 10, 'principal', 1, 'r1', ahora, ahora]
        )
    })

    afterAll(async () => {
        await db.close()
    })

    it('guarda el pedido con todos sus ítems', async () => {
        await repo.create(pedido('o-ok', ['d1', 'd1', 'd1']))

        const guardado = await repo.findById('o-ok')
        expect(guardado).not.toBeNull()
        expect(guardado!.items).toHaveLength(3)
    })

    it('no deja un pedido a medias si falla la inserción de los ítems', async () => {
        await expect(repo.create(pedido('o-roto', ['d1', 'plato-inexistente']))).rejects.toThrow()

        expect(await repo.findById('o-roto')).toBeNull()
        const huerfanos = await db.all('SELECT id FROM order_items WHERE order_id = ?', ['o-roto'])
        expect(huerfanos).toHaveLength(0)
    })
})
