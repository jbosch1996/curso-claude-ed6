import { describe, it, expect, beforeEach } from 'vitest'
import { PointsEarningService } from './points-earning.service.js'
import { MockPointsEarningRepository } from '@repositories/mocks/MockPointsEarningRepository.js'
import { InvalidPointsEarningError } from '@errors/DomainErrors.js'

describe('PointsEarningService', () => {
    let repo: MockPointsEarningRepository
    let service: PointsEarningService

    beforeEach(() => {
        repo = new MockPointsEarningRepository()
        service = new PointsEarningService(repo)
    })

    describe('get', () => {
        it('sin configuración devuelve 1 punto por euro marcado como valor por defecto', async () => {
            expect(await service.get('r1')).toEqual({ restaurantId: 'r1', amount: 1, points: 1, isDefault: true, updatedAt: null })
        })

        it('devuelve el ritmo configurado del restaurante', async () => {
            await service.update('r1', { amount: 10, points: 3 })
            expect(await service.get('r1')).toMatchObject({ restaurantId: 'r1', amount: 10, points: 3, isDefault: false })
            expect(await service.get('r2')).toMatchObject({ amount: 1, points: 1, isDefault: true })
        })
    })

    describe('update', () => {
        it('valida, guarda y devuelve el nuevo ritmo', async () => {
            const ritmo = await service.update('r1', { amount: 2.499, points: 2 })
            expect(ritmo).toMatchObject({ restaurantId: 'r1', amount: 2.5, points: 2, isDefault: false })
            expect(ritmo.updatedAt).toBeTruthy()
            expect(await repo.findByRestaurantId('r1')).toEqual(ritmo)
        })

        it('reemplaza el ritmo anterior', async () => {
            await service.update('r1', { amount: 10, points: 3 })
            await service.update('r1', { amount: 1, points: 1 })
            expect(await service.get('r1')).toMatchObject({ amount: 1, points: 1, isDefault: false })
        })

        it('rechaza datos inválidos sin guardar nada', async () => {
            await expect(service.update('r1', { amount: 0, points: 3 })).rejects.toThrow(InvalidPointsEarningError)
            await expect(service.update('r1', { amount: 10, points: 1.5 })).rejects.toThrow(InvalidPointsEarningError)
            expect(await repo.findByRestaurantId('r1')).toBeNull()
        })
    })
})
