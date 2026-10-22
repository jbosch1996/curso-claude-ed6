import { describe, it, expect } from 'vitest'
import { validatePointsRule } from './points-rule.model.js'
import { InvalidPointsRuleError } from '@errors/DomainErrors.js'

describe('validatePointsRule', () => {
    it('acepta puntos enteros positivos y descuento positivo', () => {
        expect(validatePointsRule({ points: 100, discount: 10 })).toEqual({ points: 100, discount: 10 })
    })

    it.each([0, -10, 1.5, NaN, '10', undefined, null])('rechaza los puntos %j', (points) => {
        expect(() => validatePointsRule({ points, discount: 1 })).toThrow(InvalidPointsRuleError)
    })

    it.each([0, -1, NaN, '1', undefined, null])('rechaza el descuento %j', (discount) => {
        expect(() => validatePointsRule({ points: 10, discount })).toThrow(InvalidPointsRuleError)
    })

    it('redondea el descuento a 2 decimales', () => {
        expect(validatePointsRule({ points: 10, discount: 1.239 }).discount).toBe(1.24)
    })
})
