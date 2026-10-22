import { describe, it, expect } from 'vitest'
import { validatePointsEarning, DEFAULT_POINTS_EARNING } from './points-earning.model.js'
import { InvalidPointsEarningError } from '@errors/DomainErrors.js'

describe('DEFAULT_POINTS_EARNING', () => {
    it('es 1 punto por cada euro', () => {
        expect(DEFAULT_POINTS_EARNING).toEqual({ amount: 1, points: 1 })
    })
})

describe('validatePointsEarning', () => {
    it('acepta un ritmo válido', () => {
        expect(validatePointsEarning({ amount: 10, points: 3 })).toEqual({ amount: 10, points: 3 })
        expect(validatePointsEarning({ amount: 0.5, points: 1 })).toEqual({ amount: 0.5, points: 1 })
    })

    it('redondea el importe a céntimos', () => {
        expect(validatePointsEarning({ amount: 2.499, points: 1 })).toEqual({ amount: 2.5, points: 1 })
    })

    it.each([0, -5, '10', null, undefined, NaN, 0.004, 10000.01])('rechaza el importe %s', (amount) => {
        expect(() => validatePointsEarning({ amount, points: 1 })).toThrow(InvalidPointsEarningError)
    })

    it.each([0, -1, 1.5, '3', null, undefined, 10001])('rechaza los puntos %s', (points) => {
        expect(() => validatePointsEarning({ amount: 1, points })).toThrow(InvalidPointsEarningError)
    })

    it('acepta los límites', () => {
        expect(validatePointsEarning({ amount: 0.01, points: 10000 })).toEqual({ amount: 0.01, points: 10000 })
        expect(validatePointsEarning({ amount: 10000, points: 1 })).toEqual({ amount: 10000, points: 1 })
    })
})
