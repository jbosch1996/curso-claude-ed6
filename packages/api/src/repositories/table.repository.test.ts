import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteTableRepository } from './table.repository.js'
import type { Table } from '@models/table.model.js'

const ahora = '2026-10-22T10:00:00.000Z'

const mesa = (cambios: Partial<Table> = {}): Table => ({
    id: 't1', restaurantId: 'r1', number: 1, description: 'Terraza', capacity: 4,
    status: 'libre', createdAt: ahora, updatedAt: ahora, ...cambios
})

describe('SqliteTableRepository (Integration)', () => {
    let db: Database
    let repo: SqliteTableRepository

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqliteTableRepository(db)
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

    describe('CRUD', () => {
        it('guarda y recupera una mesa por id', async () => {
            await repo.save(mesa())
            expect(await repo.findById('t1')).toEqual(mesa())
        })

        it('devuelve null si no existe', async () => {
            expect(await repo.findById('nope')).toBeNull()
        })

        it('guarda una mesa sin descripción', async () => {
            await repo.save(mesa({ description: null }))
            expect((await repo.findById('t1'))?.description).toBeNull()
        })

        it('lista las mesas del restaurante ordenadas por número', async () => {
            await repo.save(mesa({ id: 'a', number: 3 }))
            await repo.save(mesa({ id: 'b', number: 1 }))
            await repo.save(mesa({ id: 'c', restaurantId: 'r2', number: 2 }))
            expect((await repo.findByRestaurantId('r1')).map(t => t.number)).toEqual([1, 3])
        })

        it('actualiza una mesa existente', async () => {
            await repo.save(mesa())
            await repo.save(mesa({ number: 9, capacity: 6, status: 'reservada', description: null, updatedAt: '2026-10-23T00:00:00.000Z' }))
            expect(await repo.findById('t1')).toMatchObject({ number: 9, capacity: 6, status: 'reservada', description: null })
        })

        it('borra una mesa', async () => {
            await repo.save(mesa())
            await repo.delete('t1')
            expect(await repo.findById('t1')).toBeNull()
        })
    })

    describe('restricciones', () => {
        it('no permite dos mesas con el mismo número en un restaurante', async () => {
            await repo.save(mesa())
            await expect(repo.save(mesa({ id: 't2' }))).rejects.toThrow()
        })

        it('permite el mismo número en otro restaurante', async () => {
            await repo.save(mesa())
            await expect(repo.save(mesa({ id: 't2', restaurantId: 'r2' }))).resolves.toBeUndefined()
        })

        it('no permite un estado desconocido', async () => {
            await expect(db.run(
                'INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                ['x', 'r1', 1, null, 4, 'rota', ahora, ahora]
            )).rejects.toThrow()
        })

        it('no permite una capacidad no positiva', async () => {
            await expect(repo.save(mesa({ capacity: 0 }))).rejects.toThrow()
        })
    })

    describe('findAvailable', () => {
        beforeEach(async () => {
            await repo.save(mesa({ id: 'p', number: 1, capacity: 2 }))
            await repo.save(mesa({ id: 'g', number: 2, capacity: 6 }))
            await repo.save(mesa({ id: 'm', number: 3, capacity: 4 }))
            await repo.save(mesa({ id: 'o', number: 4, capacity: 4, status: 'ocupada' }))
            await repo.save(mesa({ id: 'r', number: 5, capacity: 4, status: 'reservada' }))
            await repo.save(mesa({ id: 'x', restaurantId: 'r2', number: 1, capacity: 4 }))
        })

        it('devuelve solo mesas libres con capacidad suficiente, ordenadas por capacidad y número', async () => {
            const mesas = await repo.findAvailable('r1', 3)
            expect(mesas.map(t => t.id)).toEqual(['m', 'g'])
        })

        it('incluye las mesas con capacidad exacta', async () => {
            expect((await repo.findAvailable('r1', 2)).map(t => t.id)).toEqual(['p', 'm', 'g'])
        })

        it('no devuelve nada si no cabe nadie', async () => {
            expect(await repo.findAvailable('r1', 7)).toEqual([])
        })
    })

    describe('occupyIfAvailable', () => {
        const ocupar = (id = 't1', restaurantId = 'r1', guests = 2) =>
            repo.occupyIfAvailable(id, restaurantId, guests, '2026-10-22T12:00:00.000Z')

        beforeEach(async () => {
            await repo.save(mesa())
        })

        it('ocupa una mesa libre con capacidad suficiente y actualiza la fecha', async () => {
            expect(await ocupar()).toBe(true)
            expect(await repo.findById('t1')).toMatchObject({ status: 'ocupada', updatedAt: '2026-10-22T12:00:00.000Z' })
        })

        it('la segunda ocupación de la misma mesa devuelve false', async () => {
            expect(await ocupar()).toBe(true)
            expect(await ocupar()).toBe(false)
        })

        it('dos ocupaciones simultáneas no pueden tener éxito ambas', async () => {
            const resultados = await Promise.all([ocupar(), ocupar()])
            expect(resultados.filter(Boolean)).toHaveLength(1)
        })

        it('devuelve false si la mesa es de otro restaurante', async () => {
            expect(await ocupar('t1', 'r2')).toBe(false)
            expect((await repo.findById('t1'))?.status).toBe('libre')
        })

        it('devuelve false si la mesa es pequeña, reservada o no existe', async () => {
            expect(await ocupar('t1', 'r1', 5)).toBe(false)
            await repo.save(mesa({ id: 't2', number: 2, status: 'reservada' }))
            expect(await ocupar('t2')).toBe(false)
            expect(await ocupar('nope')).toBe(false)
        })
    })
})
