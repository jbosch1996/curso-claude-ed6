import { describe, it, expect } from 'vitest'
import { assertPositiveNumber, assertNonNegativeNumber, assertHttpUrl } from './validation.js'
import { InvalidNumberError, InvalidLogoUrlError, InvalidPriceError } from '@errors/DomainErrors.js'

describe('assertPositiveNumber', () => {
    it('acepta un número positivo', () => {
        expect(() => assertPositiveNumber(5)).not.toThrow()
        expect(() => assertPositiveNumber(0.5)).not.toThrow()
    })

    it.each([NaN, Infinity, -Infinity, 0, -1, '5', 'abc', null, undefined, {}])('rechaza %s', (valor) => {
        expect(() => assertPositiveNumber(valor)).toThrow(InvalidNumberError)
    })

    it('lanza el error indicado', () => {
        expect(() => assertPositiveNumber('abc', new InvalidPriceError())).toThrow(InvalidPriceError)
    })
})

describe('assertNonNegativeNumber', () => {
    it('acepta cero y positivos', () => {
        expect(() => assertNonNegativeNumber(0)).not.toThrow()
        expect(() => assertNonNegativeNumber(3)).not.toThrow()
    })

    it.each([NaN, Infinity, -1, '10', null, undefined])('rechaza %s', (valor) => {
        expect(() => assertNonNegativeNumber(valor)).toThrow(InvalidNumberError)
    })
})

describe('assertHttpUrl', () => {
    it('acepta null y undefined', () => {
        expect(() => assertHttpUrl(null)).not.toThrow()
        expect(() => assertHttpUrl(undefined)).not.toThrow()
    })

    it('acepta http y https', () => {
        expect(() => assertHttpUrl('https://example.com/logo.png')).not.toThrow()
        expect(() => assertHttpUrl('http://example.com/logo.png')).not.toThrow()
    })

    it.each(['javascript:alert(1)', 'data:image/png;base64,AAAA', 'no es una url', '', 'ftp://example.com/a.png', 5])('rechaza %s', (valor) => {
        expect(() => assertHttpUrl(valor)).toThrow(InvalidLogoUrlError)
    })
})
