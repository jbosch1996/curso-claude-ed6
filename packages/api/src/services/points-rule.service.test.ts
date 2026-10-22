import { describe, it, expect, beforeEach } from 'vitest'
import { PointsRuleService } from './points-rule.service.js'
import { MockPointsRuleRepository } from '@repositories/mocks/MockPointsRuleRepository.js'
import { PointsRuleNotFoundError, DuplicatedPointsRuleError, InvalidPointsRuleError } from '@errors/DomainErrors.js'

describe('PointsRuleService', () => {
    let service: PointsRuleService

    beforeEach(() => {
        service = new PointsRuleService(new MockPointsRuleRepository())
    })

    describe('create', () => {
        it('crea una equivalencia', async () => {
            const regla = await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            expect(regla).toMatchObject({ restaurantId: 'r1', points: 10, discount: 1 })
            expect(regla.id).toBeTruthy()
        })

        it('rechaza dos equivalencias con los mismos puntos en un restaurante', async () => {
            await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            await expect(service.create({ restaurantId: 'r1', points: 10, discount: 2 })).rejects.toThrow(DuplicatedPointsRuleError)
        })

        it('permite los mismos puntos en otro restaurante', async () => {
            await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            await expect(service.create({ restaurantId: 'r2', points: 10, discount: 1 })).resolves.toBeDefined()
        })

        it('rechaza datos inválidos', async () => {
            await expect(service.create({ restaurantId: 'r1', points: 0, discount: 1 })).rejects.toThrow(InvalidPointsRuleError)
            await expect(service.create({ restaurantId: 'r1', points: 10, discount: -1 })).rejects.toThrow(InvalidPointsRuleError)
        })
    })

    describe('consultas', () => {
        it('lista ordenado por puntos y solo del restaurante', async () => {
            await service.create({ restaurantId: 'r1', points: 100, discount: 10 })
            await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            await service.create({ restaurantId: 'r2', points: 5, discount: 1 })
            expect((await service.findByRestaurantId('r1')).map(r => r.points)).toEqual([10, 100])
        })

        it('trata una equivalencia de otro restaurante como inexistente', async () => {
            const { id } = await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            await expect(service.findById('r2', id)).rejects.toThrow(PointsRuleNotFoundError)
        })
    })

    describe('update', () => {
        it('actualiza puntos y descuento', async () => {
            const { id } = await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            const actualizada = await service.update('r1', id, { points: 20, discount: 3 })
            expect(actualizada).toMatchObject({ id, points: 20, discount: 3 })
        })

        it('permite guardar los mismos puntos sin considerarlo duplicado', async () => {
            const { id } = await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            await expect(service.update('r1', id, { points: 10, discount: 2 })).resolves.toBeDefined()
        })

        it('rechaza cambiar a unos puntos que ya existen', async () => {
            await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            const { id } = await service.create({ restaurantId: 'r1', points: 100, discount: 10 })
            await expect(service.update('r1', id, { points: 10, discount: 10 })).rejects.toThrow(DuplicatedPointsRuleError)
        })

        it('no actualiza una equivalencia de otro restaurante', async () => {
            const { id } = await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            await expect(service.update('r2', id, { points: 20, discount: 2 })).rejects.toThrow(PointsRuleNotFoundError)
        })
    })

    describe('delete', () => {
        it('borra una equivalencia', async () => {
            const { id } = await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            await service.delete('r1', id)
            await expect(service.findById('r1', id)).rejects.toThrow(PointsRuleNotFoundError)
        })

        it('no borra una equivalencia de otro restaurante', async () => {
            const { id } = await service.create({ restaurantId: 'r1', points: 10, discount: 1 })
            await expect(service.delete('r2', id)).rejects.toThrow(PointsRuleNotFoundError)
        })
    })
})
