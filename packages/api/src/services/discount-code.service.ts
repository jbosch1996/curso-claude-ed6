import { randomUUID } from 'crypto'
import type { DiscountCode } from '@models/discount-code.model.js'
import { normalizeCode, normalizeDiscountType, validateDiscountValue, normalizeExpiresAt } from '@models/discount-code.model.js'
import type { DiscountCodeRepository } from '@repositories/discount-code.repository.js'
import { DiscountCodeNotFoundError, DuplicatedDiscountCodeError, InvalidDiscountCodeError } from '@errors/DomainErrors.js'

export interface DiscountCodeInput {
    code: unknown
    type: unknown
    value: unknown
    expiresAt?: unknown
    active?: unknown
}

export class DiscountCodeService {
    constructor(private readonly repository: DiscountCodeRepository) {}

    async create(input: DiscountCodeInput & { restaurantId: string }): Promise<DiscountCode> {
        const fields = this.validate(input)
        await this.assertCodeAvailable(input.restaurantId, fields.code)

        const now = new Date().toISOString()
        const code: DiscountCode = {
            id: randomUUID(),
            restaurantId: input.restaurantId,
            ...fields,
            active: fields.active ?? true,
            createdAt: now,
            updatedAt: now
        }
        await this.repository.save(code)
        return code
    }

    async findByRestaurantId(restaurantId: string): Promise<DiscountCode[]> {
        return this.repository.findByRestaurantId(restaurantId)
    }

    async findById(restaurantId: string, id: string): Promise<DiscountCode> {
        const code = await this.repository.findById(restaurantId, id)
        if (!code) throw new DiscountCodeNotFoundError()
        return code
    }

    async update(restaurantId: string, id: string, input: DiscountCodeInput): Promise<DiscountCode> {
        const existing = await this.findById(restaurantId, id)
        const fields = this.validate(input)
        await this.assertCodeAvailable(restaurantId, fields.code, id)

        const updated: DiscountCode = {
            ...existing,
            ...fields,
            active: fields.active ?? existing.active,
            updatedAt: new Date().toISOString()
        }
        await this.repository.save(updated)
        return updated
    }

    async delete(restaurantId: string, id: string): Promise<void> {
        await this.findById(restaurantId, id)
        await this.repository.delete(restaurantId, id)
    }

    private validate(input: DiscountCodeInput) {
        const code = normalizeCode(input.code)
        const type = normalizeDiscountType(input.type)
        validateDiscountValue(type, input.value)
        const expiresAt = normalizeExpiresAt(input.expiresAt)
        if (input.active !== undefined && typeof input.active !== 'boolean') {
            throw new InvalidDiscountCodeError('active must be a boolean')
        }
        return { code, type, value: input.value as number, expiresAt, active: input.active as boolean | undefined }
    }

    private async assertCodeAvailable(restaurantId: string, code: string, ownId?: string): Promise<void> {
        const duplicated = await this.repository.findByCode(restaurantId, code)
        if (duplicated && duplicated.id !== ownId) throw new DuplicatedDiscountCodeError()
    }
}
