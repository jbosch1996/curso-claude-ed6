import { assertPositiveNumber } from '@models/validation.js'
import { InvalidDiscountCodeError } from '@errors/DomainErrors.js'

const VALID_DISCOUNT_TYPES = ['percent', 'fixed'] as const
const CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/

export type DiscountType = typeof VALID_DISCOUNT_TYPES[number]

export interface DiscountCode {
    id: string
    restaurantId: string
    code: string
    type: DiscountType
    value: number
    expiresAt: string | null
    active: boolean
    createdAt: string
    updatedAt: string
}

export function normalizeCode(value: unknown): string {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
    if (!CODE_PATTERN.test(normalized)) {
        throw new InvalidDiscountCodeError('Code must be 3 to 30 characters: letters, digits, "-" or "_"')
    }
    return normalized
}

export function normalizeDiscountType(value: unknown): DiscountType {
    if (typeof value !== 'string' || !VALID_DISCOUNT_TYPES.includes(value as DiscountType)) {
        throw new InvalidDiscountCodeError(`Invalid type. Must be one of: ${VALID_DISCOUNT_TYPES.join(', ')}`)
    }
    return value as DiscountType
}

export function validateDiscountValue(type: DiscountType, value: unknown): void {
    assertPositiveNumber(value, new InvalidDiscountCodeError('Value must be a positive number'))
    if (type === 'percent' && (value as number) > 100) {
        throw new InvalidDiscountCodeError('Percentage cannot exceed 100')
    }
}

export function normalizeExpiresAt(value: unknown): string | null {
    if (value === null || value === undefined) return null
    const date = typeof value === 'string' && value.trim() !== '' ? new Date(value) : null
    if (!date || Number.isNaN(date.getTime())) {
        throw new InvalidDiscountCodeError('expiresAt must be a valid date')
    }
    return date.toISOString()
}

export function isCodeRedeemable(code: DiscountCode, now: Date): boolean {
    if (!code.active) return false
    return code.expiresAt === null || new Date(code.expiresAt).getTime() > now.getTime()
}
