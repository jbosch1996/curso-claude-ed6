import { describe, it, expect } from 'vitest'
import { LoyaltyService } from './loyalty.service.js'
import { MockClientPointsRepository } from '@repositories/mocks/MockClientPointsRepository.js'
import { MockPointsRuleRepository } from '@repositories/mocks/MockPointsRuleRepository.js'

describe('LoyaltyService', () => {
    it('devuelve el saldo del cliente y las equivalencias del restaurante ordenadas', async () => {
        const points = new MockClientPointsRepository()
        const rules = new MockPointsRuleRepository()
        await points.add('u1', 'r1', 42)
        await points.add('u1', 'r2', 7)
        await rules.save({ id: 'p100', restaurantId: 'r1', points: 100, discount: 10, createdAt: '' })
        await rules.save({ id: 'p10', restaurantId: 'r1', points: 10, discount: 1, createdAt: '' })
        await rules.save({ id: 'px', restaurantId: 'r2', points: 5, discount: 1, createdAt: '' })

        const resumen = await new LoyaltyService(points, rules).getSummary('u1', 'r1')

        expect(resumen).toEqual({
            balance: 42,
            rules: [
                { id: 'p10', points: 10, discount: 1 },
                { id: 'p100', points: 100, discount: 10 }
            ]
        })
    })

    it('un cliente sin puntos tiene saldo 0', async () => {
        const resumen = await new LoyaltyService(new MockClientPointsRepository(), new MockPointsRuleRepository()).getSummary('u1', 'r1')
        expect(resumen).toEqual({ balance: 0, rules: [] })
    })
})
