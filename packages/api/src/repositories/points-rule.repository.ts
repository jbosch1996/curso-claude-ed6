import { Database } from '@config/database.js'
import type { PointsRule } from '@models/points-rule.model.js'

interface PointsRuleRow {
    id: string
    restaurantId: string
    points: number
    discount: number
    createdAt: string
}

const SELECT = 'SELECT id, restaurant_id as restaurantId, points, discount, created_at as createdAt FROM points_rules'

export interface PointsRuleRepository {
    findById(restaurantId: string, id: string): Promise<PointsRule | null>
    findByRestaurantId(restaurantId: string): Promise<PointsRule[]>
    findByPoints(restaurantId: string, points: number): Promise<PointsRule | null>
    save(rule: PointsRule): Promise<void>
    delete(restaurantId: string, id: string): Promise<void>
}

export class SqlitePointsRuleRepository implements PointsRuleRepository {
    constructor(private readonly db: Database) {}

    async findById(restaurantId: string, id: string): Promise<PointsRule | null> {
        const row = await this.db.get<PointsRuleRow>(`${SELECT} WHERE id = ? AND restaurant_id = ?`, [id, restaurantId])
        return row ?? null
    }

    async findByRestaurantId(restaurantId: string): Promise<PointsRule[]> {
        return this.db.all<PointsRuleRow>(`${SELECT} WHERE restaurant_id = ? ORDER BY points ASC`, [restaurantId])
    }

    async findByPoints(restaurantId: string, points: number): Promise<PointsRule | null> {
        const row = await this.db.get<PointsRuleRow>(`${SELECT} WHERE restaurant_id = ? AND points = ?`, [restaurantId, points])
        return row ?? null
    }

    async save(rule: PointsRule): Promise<void> {
        const existing = await this.findById(rule.restaurantId, rule.id)
        if (existing) {
            await this.db.run(
                'UPDATE points_rules SET points = ?, discount = ? WHERE id = ? AND restaurant_id = ?',
                [rule.points, rule.discount, rule.id, rule.restaurantId]
            )
        } else {
            await this.db.run(
                'INSERT INTO points_rules (id, restaurant_id, points, discount, created_at) VALUES (?, ?, ?, ?, ?)',
                [rule.id, rule.restaurantId, rule.points, rule.discount, rule.createdAt]
            )
        }
    }

    async delete(restaurantId: string, id: string): Promise<void> {
        await this.db.run('DELETE FROM points_rules WHERE id = ? AND restaurant_id = ?', [id, restaurantId])
    }
}
