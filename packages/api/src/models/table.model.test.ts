import { describe, it, expect } from 'vitest'
import { normalizeTableStatus, validateTableFields, assertValidGuests, MAX_TABLE_CAPACITY } from './table.model.js'
import { InvalidTableError, InvalidTableStatusError } from '@errors/DomainErrors.js'

describe('normalizeTableStatus', () => {
    it.each(['libre', 'ocupada', 'reservada'])('acepta %s', (estado) => {
        expect(normalizeTableStatus(estado)).toBe(estado)
    })

    it('recorta y pasa a minúsculas', () => {
        expect(normalizeTableStatus('  OCUPADA ')).toBe('ocupada')
    })

    it.each(['rota', '', undefined, null, 5])('rechaza %j', (valor) => {
        expect(() => normalizeTableStatus(valor)).toThrow(InvalidTableStatusError)
    })
})

describe('validateTableFields', () => {
    it('acepta datos válidos y devuelve la descripción como null si falta', () => {
        expect(validateTableFields({ number: 1, capacity: 4 })).toEqual({ number: 1, description: null, capacity: 4 })
    })

    it('recorta la descripción y trata una vacía como null', () => {
        expect(validateTableFields({ number: 2, capacity: 2, description: '  Terraza ' }).description).toBe('Terraza')
        expect(validateTableFields({ number: 2, capacity: 2, description: '   ' }).description).toBeNull()
    })

    it.each([0, -1, 1.5, NaN, '3', undefined, null])('rechaza el número %j', (number) => {
        expect(() => validateTableFields({ number, capacity: 4 })).toThrow(InvalidTableError)
    })

    it.each([0, -2, 2.5, MAX_TABLE_CAPACITY + 1, NaN, '4', undefined, null])('rechaza la capacidad %j', (capacity) => {
        expect(() => validateTableFields({ number: 1, capacity })).toThrow(InvalidTableError)
    })

    it('acepta la capacidad máxima', () => {
        expect(() => validateTableFields({ number: 1, capacity: MAX_TABLE_CAPACITY })).not.toThrow()
    })

    it('rechaza una descripción que no es texto o supera 200 caracteres', () => {
        expect(() => validateTableFields({ number: 1, capacity: 4, description: 5 })).toThrow(InvalidTableError)
        expect(() => validateTableFields({ number: 1, capacity: 4, description: 'a'.repeat(201) })).toThrow(InvalidTableError)
        expect(() => validateTableFields({ number: 1, capacity: 4, description: 'a'.repeat(200) })).not.toThrow()
    })
})

describe('assertValidGuests', () => {
    it.each([1, 4, MAX_TABLE_CAPACITY])('acepta %d personas', (guests) => {
        expect(() => assertValidGuests(guests)).not.toThrow()
    })

    it.each([0, -1, 1.5, MAX_TABLE_CAPACITY + 1, NaN, '3', undefined, null])('rechaza %j', (guests) => {
        expect(() => assertValidGuests(guests)).toThrow('guests must be an integer between 1 and 50')
    })
})
