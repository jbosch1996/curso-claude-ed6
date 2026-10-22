import { describe, it, expect } from 'vitest'
import { validatePackFields, eligibleDishes, resolvePackSelection } from './pack.model.js'
import type { Pack } from './pack.model.js'
import type { Dish, DishCategoryType } from './dish.model.js'
import { InvalidPackError, InvalidOrderError } from '@errors/DomainErrors.js'

const valido = { name: ' Menú del día ', price: 20, categories: ['entrante', 'Principal', 'bebida'] }

describe('validatePackFields', () => {
    it('normaliza un pack válido con valores por defecto', () => {
        expect(validatePackFields(valido)).toEqual({
            name: 'Menú del día',
            description: null,
            price: 20,
            available: undefined,
            categories: ['entrante', 'principal', 'bebida'],
            excludedDishIds: []
        })
    })

    it('acepta descripción, disponibilidad y platos excluidos', () => {
        const campos = validatePackFields({ ...valido, description: ' Incluye pan ', available: false, excludedDishIds: ['d1', 'd2'] })
        expect(campos.description).toBe('Incluye pan')
        expect(campos.available).toBe(false)
        expect(campos.excludedDishIds).toEqual(['d1', 'd2'])
    })

    it('convierte una descripción vacía en null', () => {
        expect(validatePackFields({ ...valido, description: '   ' }).description).toBeNull()
    })

    it.each([undefined, '', '   ', 5, 'x'.repeat(101)])('rechaza el nombre %s', (name) => {
        expect(() => validatePackFields({ ...valido, name })).toThrow(InvalidPackError)
    })

    it.each([5, 'x'.repeat(301)])('rechaza la descripción %s', (description) => {
        expect(() => validatePackFields({ ...valido, description })).toThrow(InvalidPackError)
    })

    it.each([0, -5, '20', NaN, Infinity, undefined])('rechaza el precio %s', (price) => {
        expect(() => validatePackFields({ ...valido, price })).toThrow('Price must be a positive number')
    })

    it('rechaza available que no sea booleano', () => {
        expect(() => validatePackFields({ ...valido, available: 'si' })).toThrow('available must be a boolean')
    })

    it.each([
        ['vacías', []],
        ['no array', 'entrante'],
        ['más de 4', ['entrante', 'principal', 'postre', 'bebida', 'entrante']],
        ['inválidas', ['entrante', 'sopa']],
        ['repetidas', ['entrante', 'Entrante']]
    ])('rechaza categorías %s', (_caso, categories) => {
        expect(() => validatePackFields({ ...valido, categories })).toThrow(InvalidPackError)
    })

    it.each([
        ['no array', 'd1'],
        ['con elementos no texto', ['d1', 3]],
        ['con elementos vacíos', ['']],
        ['repetidos', ['d1', 'd1']],
        ['más de 100', Array.from({ length: 101 }, (_, i) => `d${i}`)]
    ])('rechaza excludedDishIds %s', (_caso, excludedDishIds) => {
        expect(() => validatePackFields({ ...valido, excludedDishIds })).toThrow(InvalidPackError)
    })
})

const plato = (id: string, category: DishCategoryType, extra: Partial<Dish> = {}): Dish => ({
    id, name: id, description: null, price: 5, category, available: true, restaurantId: 'r1',
    ingredients: [], createdAt: '', updatedAt: '', ...extra
})

const pack: Pack = {
    id: 'p1', restaurantId: 'r1', name: 'Menú', description: null, price: 20, available: true,
    categories: ['entrante', 'principal', 'bebida'], excludedDishIds: ['cerveza'], createdAt: '', updatedAt: ''
}

const carta = [
    plato('ensalada', 'entrante'),
    plato('sopa', 'entrante', { available: false }),
    plato('pizza', 'principal'),
    plato('pizza-ajena', 'principal', { restaurantId: 'r2' }),
    plato('agua', 'bebida'),
    plato('cerveza', 'bebida'),
    plato('tarta', 'postre')
]

describe('eligibleDishes', () => {
    it('devuelve los platos disponibles del restaurante y la categoría que no están excluidos', () => {
        expect(eligibleDishes(pack, carta, 'entrante').map(d => d.id)).toEqual(['ensalada'])
        expect(eligibleDishes(pack, carta, 'principal').map(d => d.id)).toEqual(['pizza'])
        expect(eligibleDishes(pack, carta, 'bebida').map(d => d.id)).toEqual(['agua'])
    })
})

describe('resolvePackSelection', () => {
    it('devuelve los platos en el orden de las categorías del pack aunque lleguen desordenados', () => {
        const platos = resolvePackSelection(pack, ['agua', 'ensalada', 'pizza'], carta)
        expect(platos.map(d => d.id)).toEqual(['ensalada', 'pizza', 'agua'])
    })

    it.each([
        ['no es un array', 'ensalada'],
        ['falta una categoría', ['ensalada', 'pizza']],
        ['sobra un plato', ['ensalada', 'pizza', 'agua', 'tarta']],
        ['repite categoría', ['ensalada', 'ensalada', 'agua']],
        ['incluye un plato excluido', ['ensalada', 'pizza', 'cerveza']],
        ['incluye un plato no disponible', ['sopa', 'pizza', 'agua']],
        ['incluye un plato de otro restaurante', ['ensalada', 'pizza-ajena', 'agua']],
        ['incluye un plato inexistente', ['ensalada', 'pizza', 'vino']],
        ['incluye un plato de una categoría fuera del pack', ['ensalada', 'tarta', 'agua']]
    ])('rechaza la selección si %s', (_caso, dishIds) => {
        expect(() => resolvePackSelection(pack, dishIds, carta)).toThrow(InvalidOrderError)
    })
})
