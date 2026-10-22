import type { DiscountCodeRepository } from '@repositories/discount-code.repository.js'
import type { DiscountCode } from '@models/discount-code.model.js'

export class MockDiscountCodeRepository implements DiscountCodeRepository {
    private codes: Map<string, DiscountCode> = new Map()

    async findById(restaurantId: string, id: string): Promise<DiscountCode | null> {
        const code = this.codes.get(id)
        return code && code.restaurantId === restaurantId ? code : null
    }

    async findByRestaurantId(restaurantId: string): Promise<DiscountCode[]> {
        return Array.from(this.codes.values()).filter(c => c.restaurantId === restaurantId)
    }

    async findByCode(restaurantId: string, code: string): Promise<DiscountCode | null> {
        return Array.from(this.codes.values()).find(c => c.restaurantId === restaurantId && c.code === code) ?? null
    }

    async save(code: DiscountCode): Promise<void> {
        this.codes.set(code.id, code)
    }

    async delete(restaurantId: string, id: string): Promise<void> {
        if (this.codes.get(id)?.restaurantId === restaurantId) this.codes.delete(id)
    }
}
