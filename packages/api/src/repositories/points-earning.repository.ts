import { Database } from '@config/database.js'
import type { PointsEarningRate } from '@models/points-earning.model.js'

interface PointsEarningRow {
    restaurantId: string
    amount: number
    points: number
    updatedAt: string
}

export interface PointsEarningRepository {
    findByRestaurantId(restaurantId: string): Promise<PointsEarningRate | null>
    save(rate: PointsEarningRate): Promise<void>
}

export class SqlitePointsEarningRepository implements PointsEarningRepository {
    constructor(private readonly db: Database) {}

    async findByRestaurantId(restaurantId: string): Promise<PointsEarningRate | null> {
        const row = await this.db.get<PointsEarningRow>(
            'SELECT restaurant_id as restaurantId, amount, points, updated_at as updatedAt FROM points_earning_rates WHERE restaurant_id = ?',
            [restaurantId]
        )
        return row ? { ...row, isDefault: false } : null
    }

    async save(rate: PointsEarningRate): Promise<void> {
        await this.db.run(
            `INSERT INTO points_earning_rates (restaurant_id, amount, points, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(restaurant_id) DO UPDATE SET amount = excluded.amount, points = excluded.points, updated_at = excluded.updated_at`,
            [rate.restaurantId, rate.amount, rate.points, rate.updatedAt]
        )
    }
}
