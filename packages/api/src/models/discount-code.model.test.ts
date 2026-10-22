import { describe, it, expect } from 'vitest'
import {
    normalizeCode,
    normalizeDiscountType,
    validateDiscountValue,
    normalizeExpiresAt,
    isCodeRedeemable,
    type DiscountCode
} from './discount-code.model.js'
import { InvalidDiscountCodeError } from '@errors/DomainErrors.js'

const codigoBase = (cambios: Partial<DiscountCode> = {}): DiscountCode => ({
    id: 'c1',
    restaurantId: 'r1',
    code: 'VERANO10',
    type: 'percent',
    value: 10,
    expiresAt: null,
    active: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...cambios
})

describe('normalizeCode', () => {
    it('recorta y pasa a mayúsculas', () => {
        expect(normalizeCode('  verano-10_x ')).toBe('VERANO-10_X')
    })

    it.each([undefined, null, 5, '', '  ', 'ab', 'a'.repeat(31), 'con espacio', 'ñandú', 'a$b'])(
        'rechaza %j',
        (valor) => {
            expect(() => normalizeCode(valor)).toThrow(InvalidDiscountCodeError)
        }
    )
})

describe('normalizeDiscountType', () => {
    it('acepta percent y fixed', () => {
        expect(normalizeDiscountType('percent')).toBe('percent')
        expect(normalizeDiscountType('fixed')).toBe('fixed')
    })

    it('rechaza otros tipos', () => {
        expect(() => normalizeDiscountType('otro')).toThrow(InvalidDiscountCodeError)
        expect(() => normalizeDiscountType(undefined)).toThrow(InvalidDiscountCodeError)
    })
})

describe('validateDiscountValue', () => {
    it('acepta un porcentaje entre 0 (exclusivo) y 100', () => {
        expect(() => validateDiscountValue('percent', 10)).not.toThrow()
        expect(() => validateDiscountValue('percent', 100)).not.toThrow()
    })

    it.each([0, -5, 100.01, NaN, Infinity, '10'])('rechaza el porcentaje %j', (valor) => {
        expect(() => validateDiscountValue('percent', valor)).toThrow()
    })

    it('acepta un importe fijo positivo', () => {
        expect(() => validateDiscountValue('fixed', 5.5)).not.toThrow()
    })

    it.each([0, -1, NaN, '5'])('rechaza el importe fijo %j', (valor) => {
        expect(() => validateDiscountValue('fixed', valor)).toThrow()
    })
})

describe('normalizeExpiresAt', () => {
    it('devuelve null si no hay caducidad', () => {
        expect(normalizeExpiresAt(undefined)).toBeNull()
        expect(normalizeExpiresAt(null)).toBeNull()
    })

    it('normaliza una fecha ISO válida', () => {
        expect(normalizeExpiresAt('2026-12-31')).toBe('2026-12-31T00:00:00.000Z')
    })

    it.each(['mañana', '', 5, '2026-13-45'])('rechaza %j', (valor) => {
        expect(() => normalizeExpiresAt(valor)).toThrow(InvalidDiscountCodeError)
    })
})

describe('isCodeRedeemable', () => {
    const ahora = new Date('2026-10-22T12:00:00.000Z')

    it('un código activo sin caducidad es canjeable', () => {
        expect(isCodeRedeemable(codigoBase(), ahora)).toBe(true)
    })

    it('un código inactivo no es canjeable', () => {
        expect(isCodeRedeemable(codigoBase({ active: false }), ahora)).toBe(false)
    })

    it('un código caducado no es canjeable', () => {
        expect(isCodeRedeemable(codigoBase({ expiresAt: '2026-10-22T11:59:59.000Z' }), ahora)).toBe(false)
    })

    it('un código que caduca en el futuro es canjeable', () => {
        expect(isCodeRedeemable(codigoBase({ expiresAt: '2026-10-22T12:00:01.000Z' }), ahora)).toBe(true)
    })
})
