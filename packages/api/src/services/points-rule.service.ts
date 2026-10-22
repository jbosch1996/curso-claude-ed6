import { randomUUID } from 'crypto'
import type { PointsRule } from '@models/points-rule.model.js'
import { validatePointsRule } from '@models/points-rule.model.js'
import type { PointsRuleRepository } from '@repositories/points-rule.repository.js'
import { PointsRuleNotFoundError, DuplicatedPointsRuleError } from '@errors/DomainErrors.js'

export interface PointsRuleInput {
    points: unknown
    discount: unknown
}

export class PointsRuleService {
    constructor(private readonly repository: PointsRuleRepository) {}

    async create(input: PointsRuleInput & { restaurantId: string }): Promise<PointsRule> {
        const fields = validatePointsRule(input)
        await this.assertPointsAvailable(input.restaurantId, fields.points)

        const rule: PointsRule = {
            id: randomUUID(),
            restaurantId: input.restaurantId,
            ...fields,
            createdAt: new Date().toISOString()
        }
        await this.repository.save(rule)
        return rule
    }

    async findByRestaurantId(restaurantId: string): Promise<PointsRule[]> {
        return this.repository.findByRestaurantId(restaurantId)
    }

    async findById(restaurantId: string, id: string): Promise<PointsRule> {
        const rule = await this.repository.findById(restaurantId, id)
        if (!rule) throw new PointsRuleNotFoundError()
        return rule
    }

    async update(restaurantId: string, id: string, input: PointsRuleInput): Promise<PointsRule> {
        const existing = await this.findById(restaurantId, id)
        const fields = validatePointsRule(input)
        await this.assertPointsAvailable(restaurantId, fields.points, id)

        const updated: PointsRule = { ...existing, ...fields }
        await this.repository.save(updated)
        return updated
    }

    async delete(restaurantId: string, id: string): Promise<void> {
        await this.findById(restaurantId, id)
        await this.repository.delete(restaurantId, id)
    }

    private async assertPointsAvailable(restaurantId: string, points: number, ownId?: string): Promise<void> {
        const duplicated = await this.repository.findByPoints(restaurantId, points)
        if (duplicated && duplicated.id !== ownId) throw new DuplicatedPointsRuleError()
    }
}
