import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { resetDatabase } from './reset-database.js'

const ahora = '2026-10-22T10:00:00.000Z'

describe('resetDatabase', () => {
    let db: Database

    const contar = async (tabla: string) => (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${tabla}"`))!.n

    const tablasDeUsuario = async () =>
        (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map(t => t.name)

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()

        await db.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['r1', 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', ahora, ahora]
        )
        await db.run(
            'INSERT INTO employees (id, first_name, last_name, email, password_hash, role, restaurant_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['e1', 'Ana', 'López', 'ana@resttek.com', 'hash', 'camarero', 'r1']
        )
        await db.run(
            'INSERT INTO dishes (id, name, description, price, category, available, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['d1', 'Pizza', null, 10, 'principal', 1, 'r1', ahora, ahora]
        )
        await db.run('INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at) VALUES (?, ?, ?, ?, ?)', ['o1', 'r1', null, 'e1', ahora])
        await db.run('INSERT INTO order_items (id, order_id, dish_id, quantity, notes, status) VALUES (?, ?, ?, ?, ?, ?)', ['i1', 'o1', 'd1', 1, null, 'pendiente'])
        await db.run(
            'INSERT INTO discount_codes (id, restaurant_id, code, type, value, expires_at, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['c1', 'r1', 'VERANO10', 'percent', 10, null, 1, ahora, ahora]
        )
        await db.run('INSERT INTO client_points (client_id, restaurant_id, balance) VALUES (?, ?, ?)', ['e1', 'r1', 20])
    })

    afterEach(async () => {
        await db.close()
    })

    it('vacía todas las tablas, incluidas las que tienen claves foráneas', async () => {
        await resetDatabase(db)

        for (const tabla of await tablasDeUsuario()) {
            expect(await contar(tabla), tabla).toBe(0)
        }
    })

    it('devuelve las filas eliminadas por tabla', async () => {
        const eliminadas = await resetDatabase(db)

        expect(eliminadas).toMatchObject({ restaurants: 1, employees: 1, dishes: 1, orders: 1, order_items: 1, discount_codes: 1, client_points: 1 })
        expect(eliminadas.packs).toBe(0)
    })

    it('no modifica el esquema', async () => {
        const antes = await tablasDeUsuario()
        await resetDatabase(db)
        expect(await tablasDeUsuario()).toEqual(antes)
    })

    it('deja las claves foráneas activadas', async () => {
        await resetDatabase(db)

        const pragma = await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')
        expect(pragma?.foreign_keys).toBe(1)
        await expect(db.run(
            'INSERT INTO dishes (id, name, description, price, category, available, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['d2', 'Huérfano', null, 5, 'principal', 1, 'no-existe', ahora, ahora]
        )).rejects.toThrow()
    })

    it('también vacía las tablas que se añadan en el futuro', async () => {
        await db.run('CREATE TABLE futura (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, FOREIGN KEY(restaurant_id) REFERENCES restaurants(id))')
        await db.run("INSERT INTO futura (id, restaurant_id) VALUES ('f1', 'r1')")

        const eliminadas = await resetDatabase(db)

        expect(eliminadas.futura).toBe(1)
        expect(await contar('futura')).toBe(0)
    })

    it('se puede ejecutar sobre una base ya vacía', async () => {
        await resetDatabase(db)
        const eliminadas = await resetDatabase(db)

        expect(Object.values(eliminadas).every(n => n === 0)).toBe(true)
    })
})
