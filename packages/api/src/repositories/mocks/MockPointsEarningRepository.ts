import type { PointsEarningRepository } from '@repositories/points-earning.repository.js'
import type { PointsEarningRate } from '@models/points-earning.model.js'

export class MockPointsEarningRepository implements PointsEarningRepository {
    private rates: Map<string, PointsEarningRate> = new Map()

    async findByRestaurantId(restaurantId: string): Promise<PointsEarningRate | null> {
        return this.rates.get(restaurantId) ?? null
    }

    async save(rate: PointsEarningRate): Promise<void> {
        this.rates.set(rate.restaurantId, rate)
    }
}
