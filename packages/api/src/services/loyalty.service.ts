import type { ClientPointsRepository } from '@repositories/client-points.repository.js'
import type { PointsRuleRepository } from '@repositories/points-rule.repository.js'

export interface LoyaltySummary {
    balance: number
    rules: { id: string; points: number; discount: number }[]
}

export class LoyaltyService {
    constructor(
        private readonly clientPointsRepository: ClientPointsRepository,
        private readonly pointsRuleRepository: PointsRuleRepository
    ) {}

    async getSummary(clientId: string, restaurantId: string): Promise<LoyaltySummary> {
        const [balance, rules] = await Promise.all([
            this.clientPointsRepository.getBalance(clientId, restaurantId),
            this.pointsRuleRepository.findByRestaurantId(restaurantId)
        ])
        return {
            balance,
            rules: rules.map(r => ({ id: r.id, points: r.points, discount: r.discount }))
        }
    }
}
