import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from './database.js'

describe('Database (tablas de packs)', () => {
    let db: Database
    const ahora = new Date().toISOString()

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        await db.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['r1', 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', ahora, ahora]
        )
        await db.run(
            'INSERT INTO dishes (id, name, description, price, category, available, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['d1', 'Cerveza', null, 3, 'bebida', 1, 'r1', ahora, ahora]
        )
        await db.run(
            'INSERT INTO packs (id, restaurant_id, name, description, price, available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['p1', 'r1', 'Menú', null, 20, 1, ahora, ahora]
        )
    })

    afterEach(async () => {
        await db.close()
    })

    it('crea las tablas de packs', async () => {
        const tablas = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        expect(tablas.map(t => t.name)).toEqual(expect.arrayContaining(['packs', 'pack_categories', 'pack_excluded_dishes', 'order_item_packs']))
    })

    it('no permite un pack con precio no positivo', async () => {
        await expect(db.run(
            'INSERT INTO packs (id, restaurant_id, name, description, price, available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['p2', 'r1', 'Gratis', null, 0, 1, ahora, ahora]
        )).rejects.toThrow()
    })

    it('borrar un plato excluido en un pack borra la exclusión', async () => {
        await db.run('INSERT INTO pack_excluded_dishes (pack_id, dish_id) VALUES (?, ?)', ['p1', 'd1'])
        await db.run('DELETE FROM dishes WHERE id = ?', ['d1'])
        const filas = await db.all('SELECT * FROM pack_excluded_dishes')
        expect(filas).toHaveLength(0)
    })

    it('borrar un pack borra sus categorías y exclusiones', async () => {
        await db.run('INSERT INTO pack_categories (pack_id, category, position) VALUES (?, ?, ?)', ['p1', 'bebida', 0])
        await db.run('INSERT INTO pack_excluded_dishes (pack_id, dish_id) VALUES (?, ?)', ['p1', 'd1'])
        await db.run('DELETE FROM packs WHERE id = ?', ['p1'])
        expect(await db.all('SELECT * FROM pack_categories')).toHaveLength(0)
        expect(await db.all('SELECT * FROM pack_excluded_dishes')).toHaveLength(0)
    })

    it('borrar un pedido borra los datos de pack de sus ítems', async () => {
        await db.run('INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at) VALUES (?, ?, ?, ?, ?)', ['o1', 'r1', null, 'u1', ahora])
        await db.run('INSERT INTO order_items (id, order_id, dish_id, quantity, notes, status) VALUES (?, ?, ?, ?, ?, ?)', ['i1', 'o1', 'd1', 1, null, 'pendiente'])
        await db.run(
            'INSERT INTO order_item_packs (order_item_id, pack_id, pack_name, pack_instance_id, unit_price) VALUES (?, ?, ?, ?, ?)',
            ['i1', 'p1', 'Menú', 'x1', 20]
        )
        await db.run('DELETE FROM orders WHERE id = ?', ['o1'])
        expect(await db.all('SELECT * FROM order_item_packs')).toHaveLength(0)
    })
})
