import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteClientPointsRepository } from './client-points.repository.js'

const ahora = '2026-10-22T10:00:00.000Z'

describe('SqliteClientPointsRepository (Integration)', () => {
    let db: Database
    let repo: SqliteClientPointsRepository

    beforeEach(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqliteClientPointsRepository(db)
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

    it('el saldo de un cliente sin puntos es 0', async () => {
        expect(await repo.getBalance('u1', 'r1')).toBe(0)
    })

    it('suma puntos creando y acumulando el saldo', async () => {
        await repo.add('u1', 'r1', 20)
        await repo.add('u1', 'r1', 5)
        expect(await repo.getBalance('u1', 'r1')).toBe(25)
    })

    it('el saldo es independiente por restaurante y por cliente', async () => {
        await repo.add('u1', 'r1', 20)
        expect(await repo.getBalance('u1', 'r2')).toBe(0)
        expect(await repo.getBalance('u2', 'r1')).toBe(0)
    })

    it('descuenta puntos si hay saldo suficiente', async () => {
        await repo.add('u1', 'r1', 30)
        expect(await repo.tryDeduct('u1', 'r1', 10)).toBe(true)
        expect(await repo.getBalance('u1', 'r1')).toBe(20)
    })

    it('permite gastar todo el saldo', async () => {
        await repo.add('u1', 'r1', 10)
        expect(await repo.tryDeduct('u1', 'r1', 10)).toBe(true)
        expect(await repo.getBalance('u1', 'r1')).toBe(0)
    })

    it('no descuenta si el saldo es insuficiente', async () => {
        await repo.add('u1', 'r1', 5)
        expect(await repo.tryDeduct('u1', 'r1', 10)).toBe(false)
        expect(await repo.getBalance('u1', 'r1')).toBe(5)
    })

    it('no descuenta a un cliente sin saldo', async () => {
        expect(await repo.tryDeduct('u1', 'r1', 1)).toBe(false)
    })

    it('dos descuentos simultáneos no gastan más puntos de los que hay', async () => {
        await repo.add('u1', 'r1', 10)
        const resultados = await Promise.all([repo.tryDeduct('u1', 'r1', 10), repo.tryDeduct('u1', 'r1', 10)])
        expect(resultados.filter(Boolean)).toHaveLength(1)
        expect(await repo.getBalance('u1', 'r1')).toBe(0)
    })
})
