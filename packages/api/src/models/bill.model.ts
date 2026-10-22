import type { DiscountCode } from '@models/discount-code.model.js'
import { InvalidBillError } from '@errors/DomainErrors.js'

export interface Bill {
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

export function roundMoney(value: number): number {
    return Math.round(value * 100) / 100
}

export function computeCodeDiscount(code: DiscountCode, subtotal: number): number {
    const raw = code.type === 'percent' ? subtotal * code.value / 100 : code.value
    return Math.min(roundMoney(raw), subtotal)
}

export function earnedPoints(total: number): number {
    return Math.floor(total)
}

export function computeTotal(subtotal: number, codeDiscount: number, pointsDiscount: number): number {
    const total = roundMoney(subtotal - codeDiscount - pointsDiscount)
    if (total < 0) {
        throw new InvalidBillError('Discounts cannot exceed the order subtotal')
    }
    return total
}
