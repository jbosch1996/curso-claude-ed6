import type { PointsRuleRepository } from '@repositories/points-rule.repository.js'
import type { PointsRule } from '@models/points-rule.model.js'

export class MockPointsRuleRepository implements PointsRuleRepository {
    private rules: Map<string, PointsRule> = new Map()

    async findById(restaurantId: string, id: string): Promise<PointsRule | null> {
        const rule = this.rules.get(id)
        return rule && rule.restaurantId === restaurantId ? rule : null
    }

    async findByRestaurantId(restaurantId: string): Promise<PointsRule[]> {
        return Array.from(this.rules.values())
            .filter(r => r.restaurantId === restaurantId)
            .sort((a, b) => a.points - b.points)
    }

    async findByPoints(restaurantId: string, points: number): Promise<PointsRule | null> {
        return Array.from(this.rules.values()).find(r => r.restaurantId === restaurantId && r.points === points) ?? null
    }

    async save(rule: PointsRule): Promise<void> {
        this.rules.set(rule.id, rule)
    }

    async delete(restaurantId: string, id: string): Promise<void> {
        if (this.rules.get(id)?.restaurantId === restaurantId) this.rules.delete(id)
    }
}
