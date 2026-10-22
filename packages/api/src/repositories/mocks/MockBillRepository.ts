import type { BillRepository } from '@repositories/bill.repository.js'
import type { Bill } from '@models/bill.model.js'

export class MockBillRepository implements BillRepository {
    bills: Bill[] = []

    async create(bill: Bill): Promise<void> {
        if (this.bills.some(b => b.orderId === bill.orderId)) {
            throw new Error('UNIQUE constraint failed: bills.order_id')
        }
        this.bills.push(bill)
    }

    async findByOrderId(orderId: string): Promise<Bill | null> {
        return this.bills.find(b => b.orderId === orderId) ?? null
    }

    async delete(id: string): Promise<void> {
        this.bills = this.bills.filter(b => b.id !== id)
    }
}
