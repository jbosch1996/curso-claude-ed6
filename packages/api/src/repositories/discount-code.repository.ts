import { Database } from '@config/database.js'
import type { DiscountCode } from '@models/discount-code.model.js'
import { normalizeDiscountType } from '@models/discount-code.model.js'

interface DiscountCodeRow {
    id: string
    restaurantId: string
    code: string
    type: string
    value: number
    expiresAt: string | null
    active: number
    createdAt: string
    updatedAt: string
}

const SELECT = 'SELECT id, restaurant_id as restaurantId, code, type, value, expires_at as expiresAt, active, created_at as createdAt, updated_at as updatedAt FROM discount_codes'

export interface DiscountCodeRepository {
    findById(restaurantId: string, id: string): Promise<DiscountCode | null>
    findByRestaurantId(restaurantId: string): Promise<DiscountCode[]>
    findByCode(restaurantId: string, code: string): Promise<DiscountCode | null>
    save(code: DiscountCode): Promise<void>
    delete(restaurantId: string, id: string): Promise<void>
}

export class SqliteDiscountCodeRepository implements DiscountCodeRepository {
    constructor(private readonly db: Database) {}

    async findById(restaurantId: string, id: string): Promise<DiscountCode | null> {
        const row = await this.db.get<DiscountCodeRow>(`${SELECT} WHERE id = ? AND restaurant_id = ?`, [id, restaurantId])
        return row ? this.map(row) : null
    }

    async findByRestaurantId(restaurantId: string): Promise<DiscountCode[]> {
        const rows = await this.db.all<DiscountCodeRow>(`${SELECT} WHERE restaurant_id = ? ORDER BY created_at ASC`, [restaurantId])
        return rows.map(row => this.map(row))
    }

    async findByCode(restaurantId: string, code: string): Promise<DiscountCode | null> {
        const row = await this.db.get<DiscountCodeRow>(`${SELECT} WHERE restaurant_id = ? AND code = ?`, [restaurantId, code])
        return row ? this.map(row) : null
    }

    async save(code: DiscountCode): Promise<void> {
        const existing = await this.findById(code.restaurantId, code.id)
        if (existing) {
            await this.db.run(
                'UPDATE discount_codes SET code = ?, type = ?, value = ?, expires_at = ?, active = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?',
                [code.code, code.type, code.value, code.expiresAt, code.active ? 1 : 0, code.updatedAt, code.id, code.restaurantId]
            )
        } else {
            await this.db.run(
                'INSERT INTO discount_codes (id, restaurant_id, code, type, value, expires_at, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [code.id, code.restaurantId, code.code, code.type, code.value, code.expiresAt, code.active ? 1 : 0, code.createdAt, code.updatedAt]
            )
        }
    }

    async delete(restaurantId: string, id: string): Promise<void> {
        await this.db.run('DELETE FROM discount_codes WHERE id = ? AND restaurant_id = ?', [id, restaurantId])
    }

    private map(row: DiscountCodeRow): DiscountCode {
        return {
            id: row.id,
            restaurantId: row.restaurantId,
            code: row.code,
            type: normalizeDiscountType(row.type),
            value: row.value,
            expiresAt: row.expiresAt,
            active: row.active === 1,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        }
    }
}
