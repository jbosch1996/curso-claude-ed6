import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { assertSeedAllowed, seedDatabase } from './seed.js'

const ahora = '2026-10-22T10:00:00.000Z'
const TIMEOUT = 30000 // bcrypt (10 rondas) para los 10 usuarios del seed

describe('assertSeedAllowed', () => {
    it('se niega a ejecutarse en producción', () => {
        expect(() => assertSeedAllowed('production')).toThrow('NODE_ENV=production')
    })

    it.each(['development', 'test', '', undefined])('permite NODE_ENV=%j', (env) => {
        expect(() => assertSeedAllowed(env)).not.toThrow()
    })
})

describe('seedDatabase', () => {
    let db: Database

    const contar = async (tabla: string) => (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${tabla}"`))!.n

    const recuentos = async () => {
        const tablas = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        const resultado: Record<string, number> = {}
        for (const { name } of tablas) resultado[name] = await contar(name)
        return resultado
    }

    const insertarDatosPropios = async () => {
        await db.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['r-propio', 'Mi Restaurante', 'Calle Falsa 1', 'mi@rest.com', '600000000', 'Yo', 'Mismo', ahora, ahora]
        )
        await db.run(
            'INSERT INTO employees (id, first_name, last_name, email, password_hash, role, restaurant_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['e-propio', 'Cliente', 'Registrado', 'propio@cliente.com', 'hash', 'cliente', null]
        )
        await db.run(
            'INSERT INTO dishes (id, name, description, price, category, available, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['d-propio', 'Plato propio', null, 7, 'principal', 1, 'r-propio', ahora, ahora]
        )
        await db.run('INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at) VALUES (?, ?, ?, ?, ?)', ['o-propio', 'r-propio', null, 'e-propio', ahora])
        await db.run('INSERT INTO order_items (id, order_id, dish_id, quantity, notes, status) VALUES (?, ?, ?, ?, ?, ?)', ['i-propio', 'o-propio', 'd-propio', 1, null, 'pendiente'])
        await db.run(
            'INSERT INTO bills (id, order_id, restaurant_id, client_id, subtotal, discount_code_id, code_discount, points_used, points_discount, total, points_earned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['b-propio', 'o-propio', 'r-propio', 'e-propio', 7, null, 0, 0, 0, 7, 7, ahora]
        )
        await db.run('INSERT INTO client_points (client_id, restaurant_id, balance) VALUES (?, ?, ?)', ['e-propio', 'r-propio', 99])
        await db.run(
            'INSERT INTO discount_codes (id, restaurant_id, code, type, value, expires_at, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['c-propio', 'r-propio', 'MIO10', 'fixed', 5, null, 1, ahora, ahora]
        )
        await db.run(
            'INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['t-propia', 'r-propio', 1, null, 4, 'ocupada', ahora, ahora]
        )
        await db.run(
            'INSERT INTO packs (id, restaurant_id, name, description, price, available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['p-propio', 'r-propio', 'Pack propio', null, 15, 1, ahora, ahora]
        )
        // Datos propios dentro de un restaurante del seed: también deben desaparecer.
        await db.run(
            'INSERT INTO dishes (id, name, description, price, category, available, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['d-en-rest-1', 'Plato añadido a mano', null, 3, 'postre', 1, 'rest-1', ahora, ahora]
        )
    }

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
    })

    afterEach(async () => {
        await db.close()
    })

    it('siembra una base de datos nueva sin fallar por claves foráneas', async () => {
        await seedDatabase(db)

        expect(await recuentos()).toMatchObject({
            restaurants: 2,
            employees: 10,
            ingredients: 8,
            dishes: 7,
            dish_ingredients: 12,
            orders: 1,
            order_items: 8,
            discount_codes: 2,
            points_rules: 4,
            restaurant_tables: 7,
            packs: 1,
            pack_categories: 3,
            pack_excluded_dishes: 1
        })
    }, TIMEOUT)

    it('deja las claves foráneas activadas y los usuarios de ejemplo en su sitio', async () => {
        await seedDatabase(db)

        expect((await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys).toBe(1)
        const admin = await db.get<{ role: string }>("SELECT role FROM employees WHERE email = 'admin@resttek.com'")
        expect(admin?.role).toBe('admin')
        const camarero = await db.get<{ restaurant_id: string }>("SELECT restaurant_id FROM employees WHERE email = 'camarero1@resttek.com'")
        expect(camarero?.restaurant_id).toBe('rest-1')
    }, TIMEOUT)

    it('elimina los datos previos antes de sembrar', async () => {
        await seedDatabase(db)
        const esperado = await recuentos()

        await insertarDatosPropios()
        await seedDatabase(db)

        expect(await recuentos()).toEqual(esperado)
        for (const [tabla, id] of [
            ['restaurants', 'r-propio'], ['employees', 'e-propio'], ['dishes', 'd-propio'], ['dishes', 'd-en-rest-1'],
            ['orders', 'o-propio'], ['order_items', 'i-propio'], ['bills', 'b-propio'], ['discount_codes', 'c-propio'],
            ['restaurant_tables', 't-propia'], ['packs', 'p-propio']
        ]) {
            expect(await db.get(`SELECT 1 FROM "${tabla}" WHERE id = ?`, [id]), `${tabla} ${id}`).toBeUndefined()
        }
        expect(await contar('client_points')).toBe(0)
    }, TIMEOUT)

    it('es repetible: sembrar varias veces no duplica nada', async () => {
        await seedDatabase(db)
        const primera = await recuentos()

        await seedDatabase(db)
        await seedDatabase(db)

        expect(await recuentos()).toEqual(primera)
    }, TIMEOUT)
})
