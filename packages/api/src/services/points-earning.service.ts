import type { PointsEarningRate } from '@models/points-earning.model.js'
import { DEFAULT_POINTS_EARNING, validatePointsEarning } from '@models/points-earning.model.js'
import type { PointsEarningRepository } from '@repositories/points-earning.repository.js'

export interface PointsEarningInput {
    amount: unknown
    points: unknown
}

export class PointsEarningService {
    constructor(private readonly repository: PointsEarningRepository) {}

    async get(restaurantId: string): Promise<PointsEarningRate> {
        const rate = await this.repository.findByRestaurantId(restaurantId)
        return rate ?? { restaurantId, ...DEFAULT_POINTS_EARNING, isDefault: true, updatedAt: null }
    }

    async update(restaurantId: string, input: PointsEarningInput): Promise<PointsEarningRate> {
        const fields = validatePointsEarning(input)
        const rate: PointsEarningRate = {
            restaurantId,
            ...fields,
            isDefault: false,
            updatedAt: new Date().toISOString()
        }
        await this.repository.save(rate)
        return rate
    }
}
