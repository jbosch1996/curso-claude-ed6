import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from './database.js'

describe('Database (tablas de descuentos y puntos)', () => {
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
    })

    afterEach(async () => {
        await db.close()
    })

    it('crea las tablas nuevas', async () => {
        const tablas = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        const nombres = tablas.map(t => t.name)
        expect(nombres).toEqual(expect.arrayContaining(['discount_codes', 'points_rules', 'client_points', 'bills']))
    })

    it('no permite dos códigos iguales en el mismo restaurante', async () => {
        const insertar = (id: string) => db.run(
            'INSERT INTO discount_codes (id, restaurant_id, code, type, value, expires_at, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, 'r1', 'VERANO10', 'percent', 10, null, 1, ahora, ahora]
        )
        await insertar('c1')
        await expect(insertar('c2')).rejects.toThrow()
    })

    it('no permite dos equivalencias con los mismos puntos en el mismo restaurante', async () => {
        const insertar = (id: string) => db.run(
            'INSERT INTO points_rules (id, restaurant_id, points, discount, created_at) VALUES (?, ?, ?, ?, ?)',
            [id, 'r1', 100, 10, ahora]
        )
        await insertar('p1')
        await expect(insertar('p2')).rejects.toThrow()
    })

    it('no permite un saldo de puntos negativo', async () => {
        await expect(db.run(
            'INSERT INTO client_points (client_id, restaurant_id, balance) VALUES (?, ?, ?)',
            ['u1', 'r1', -1]
        )).rejects.toThrow()
    })

    it('no permite dos cuentas para el mismo pedido', async () => {
        await db.run('INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at) VALUES (?, ?, ?, ?, ?)', ['o1', 'r1', null, 'u1', ahora])
        const insertar = (id: string) => db.run(
            'INSERT INTO bills (id, order_id, restaurant_id, client_id, subtotal, discount_code_id, code_discount, points_used, points_discount, total, points_earned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, 'o1', 'r1', 'u1', 10, null, 0, 0, 0, 10, 10, ahora]
        )
        await insertar('b1')
        await expect(insertar('b2')).rejects.toThrow()
    })
})

describe('Database (ritmo de ganancia de puntos)', () => {
    let db: Database
    const ahora = new Date().toISOString()
    const insertarRitmo = (amount: number, points: number, restaurantId = 'r1') => db.run(
        'INSERT INTO points_earning_rates (restaurant_id, amount, points, updated_at) VALUES (?, ?, ?, ?)',
        [restaurantId, amount, points, ahora]
    )

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        await db.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['r1', 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', ahora, ahora]
        )
    })

    afterEach(async () => {
        await db.close()
    })

    it('guarda un único ritmo por restaurante', async () => {
        await insertarRitmo(10, 3)
        await expect(insertarRitmo(5, 1)).rejects.toThrow()
    })

    it('no permite importes ni puntos no positivos ni restaurantes inexistentes', async () => {
        await expect(insertarRitmo(0, 1)).rejects.toThrow()
        await expect(insertarRitmo(1, 0)).rejects.toThrow()
        await expect(insertarRitmo(1, 1, 'no-existe')).rejects.toThrow()
    })

    it('crea la tabla en una base existente que aún no la tiene, sin perder datos', async () => {
        await db.run('DROP TABLE points_earning_rates')
        await (db as any).runInitialMigrations()
        await insertarRitmo(10, 3)
        const restaurantes = await db.all<{ id: string }>('SELECT id FROM restaurants')
        expect(restaurantes.map(r => r.id)).toEqual(['r1'])
    })
})
