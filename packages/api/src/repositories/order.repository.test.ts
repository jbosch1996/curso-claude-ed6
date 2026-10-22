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
        await db.run(
            'INSERT INTO dishes (id, name, description, price, category, available, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['d2', 'Agua', null, 2, 'bebida', 1, 'r1', ahora, ahora]
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

    describe('ítems de pack', () => {
        const itemDePack = (id: string, dishId: string, dishPrice: number) => ({
            id, dishId, quantity: 1, notes: null, status: 'pendiente' as const,
            dishPrice, packId: 'p1', packName: 'Menú', packInstanceId: 'inst-1'
        })

        it('guarda los ítems de pack con su precio y los lee con los datos del pack', async () => {
            const order: Order = {
                ...pedido('o-pack', ['d1']),
                items: [
                    { id: 'o-pack-suelto', dishId: 'd1', quantity: 1, notes: null, status: 'pendiente' },
                    itemDePack('o-pack-1', 'd1', 15),
                    itemDePack('o-pack-2', 'd2', 0)
                ]
            }
            await repo.create(order)

            const guardado = await repo.findById('o-pack')
            const porId = Object.fromEntries(guardado!.items.map(i => [i.id, i]))
            expect(porId['o-pack-suelto']).toEqual({
                id: 'o-pack-suelto', dishId: 'd1', quantity: 1, notes: null, status: 'pendiente',
                dishName: 'Pizza', dishPrice: 10, dishCategory: 'principal'
            })
            expect(porId['o-pack-1']).toMatchObject({ dishName: 'Pizza', dishPrice: 15, packId: 'p1', packName: 'Menú', packInstanceId: 'inst-1' })
            expect(porId['o-pack-2']).toMatchObject({ dishName: 'Agua', dishPrice: 0, packId: 'p1', packName: 'Menú', packInstanceId: 'inst-1' })
            expect(guardado!.items.reduce((sum, i) => sum + (i.dishPrice ?? 0) * i.quantity, 0)).toBe(25)
        })

        it('no deja un pedido a medias si falla la inserción de los datos de pack', async () => {
            const { packName: _sinNombre, ...roto } = itemDePack('o-pr-1', 'd1', 15)
            await expect(repo.create({ ...pedido('o-pack-roto', []), items: [roto] })).rejects.toThrow()
            expect(await repo.findById('o-pack-roto')).toBeNull()
            expect(await db.all('SELECT id FROM order_items WHERE order_id = ?', ['o-pack-roto'])).toHaveLength(0)
        })

        it('los listados de pedidos también traen los datos del pack', async () => {
            await repo.create({ ...pedido('o-pack-cliente', []), clientId: 'c-pack', items: [itemDePack('o-pc-1', 'd2', 9)] })
            const [order] = await repo.findByClientId('c-pack')
            expect(order!.items[0]).toMatchObject({ dishPrice: 9, packName: 'Menú' })
        })
    })
})
