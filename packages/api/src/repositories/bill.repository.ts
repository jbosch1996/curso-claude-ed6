import { Database } from '@config/database.js'
import type { Bill } from '@models/bill.model.js'

interface BillRow {
    id: string
    orderId: string
    restaurantId: string
    clientId: string
    subtotal: number
    discountCodeId: string | null
    codeDiscount: number
    pointsUsed: number
    pointsDiscount: number
    total: number
    pointsEarned: number
    createdAt: string
}

export interface BillRepository {
    create(bill: Bill): Promise<void>
    findByOrderId(orderId: string): Promise<Bill | null>
    delete(id: string): Promise<void>
}

export class SqliteBillRepository implements BillRepository {
    constructor(private readonly db: Database) {}

    async create(bill: Bill): Promise<void> {
        await this.db.run(
            `INSERT INTO bills (id, order_id, restaurant_id, client_id, subtotal, discount_code_id, code_discount, points_used, points_discount, total, points_earned, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [bill.id, bill.orderId, bill.restaurantId, bill.clientId, bill.subtotal, bill.discountCodeId, bill.codeDiscount,
                bill.pointsUsed, bill.pointsDiscount, bill.total, bill.pointsEarned, bill.createdAt]
        )
    }

    async findByOrderId(orderId: string): Promise<Bill | null> {
        const row = await this.db.get<BillRow>(
            `SELECT id, order_id as orderId, restaurant_id as restaurantId, client_id as clientId, subtotal,
                    discount_code_id as discountCodeId, code_discount as codeDiscount, points_used as pointsUsed,
                    points_discount as pointsDiscount, total, points_earned as pointsEarned, created_at as createdAt
             FROM bills WHERE order_id = ?`,
            [orderId]
        )
        return row ?? null
    }

    async delete(id: string): Promise<void> {
        await this.db.run('DELETE FROM bills WHERE id = ?', [id])
    }
}
