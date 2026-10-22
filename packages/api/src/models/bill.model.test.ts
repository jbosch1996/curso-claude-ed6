import { describe, it, expect } from 'vitest'
import { roundMoney, computeCodeDiscount, earnedPoints, computeTotal } from './bill.model.js'
import type { DiscountCode } from './discount-code.model.js'
import { InvalidBillError } from '@errors/DomainErrors.js'

const codigo = (type: DiscountCode['type'], value: number): DiscountCode => ({
    id: 'c1', restaurantId: 'r1', code: 'X', type, value, expiresAt: null, active: true, createdAt: '', updatedAt: ''
})

describe('roundMoney', () => {
    it('redondea a 2 decimales', () => {
        expect(roundMoney(1.005 + 0.0001)).toBe(1.01)
        expect(roundMoney(10)).toBe(10)
        expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    })
})

describe('computeCodeDiscount', () => {
    it('calcula un porcentaje del subtotal', () => {
        expect(computeCodeDiscount(codigo('percent', 10), 33.3)).toBe(3.33)
    })

    it('aplica un importe fijo', () => {
        expect(computeCodeDiscount(codigo('fixed', 5), 20)).toBe(5)
    })

    it('limita el importe fijo al subtotal', () => {
        expect(computeCodeDiscount(codigo('fixed', 50), 20)).toBe(20)
    })

    it('un 100 % descuenta todo el subtotal', () => {
        expect(computeCodeDiscount(codigo('percent', 100), 20)).toBe(20)
    })
})

describe('earnedPoints', () => {
    it('da un punto por euro, parte entera', () => {
        expect(earnedPoints(25.99)).toBe(25)
        expect(earnedPoints(0.99)).toBe(0)
        expect(earnedPoints(0)).toBe(0)
    })

    it('aplica el ritmo del restaurante: Y puntos por cada bloque completo de X €', () => {
        expect(earnedPoints(25.99, { amount: 10, points: 3 })).toBe(6)
        expect(earnedPoints(30, { amount: 10, points: 3 })).toBe(9)
        expect(earnedPoints(9.99, { amount: 10, points: 3 })).toBe(0)
    })

    it('calcula en céntimos, sin errores de coma flotante', () => {
        expect(earnedPoints(0.3, { amount: 0.1, points: 1 })).toBe(3)
        expect(earnedPoints(22.5, { amount: 2.5, points: 2 })).toBe(18)
    })
})

describe('computeTotal', () => {
    it('resta los descuentos al subtotal', () => {
        expect(computeTotal(30, 3, 10)).toBe(17)
    })

    it('permite un total de cero', () => {
        expect(computeTotal(10, 4, 6)).toBe(0)
    })

    it('rechaza descuentos que superan el subtotal', () => {
        expect(() => computeTotal(10, 4, 6.01)).toThrow(InvalidBillError)
    })
})
