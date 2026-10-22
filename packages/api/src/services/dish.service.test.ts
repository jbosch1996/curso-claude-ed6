import { describe, it, expect, beforeEach } from 'vitest'
import { DishService } from './dish.service.js'
import { IngredientService } from './ingredient.service.js'
import { MockDishRepository } from '@repositories/mocks/MockDishRepository.js'
import { MockIngredientRepository } from '@repositories/mocks/MockIngredientRepository.js'
import { DishNotFoundError, InvalidDishIngredientError, InvalidPriceError } from '@errors/DomainErrors.js'

describe('DishService', () => {
    let dishRepo: MockDishRepository
    let ingredientRepo: MockIngredientRepository
    let service: DishService
    let ingredienteR1: string
    let ingredienteR2: string

    const crearPlato = (restaurantId: string, ingredients: { ingredientId: string; quantity: number }[] = []) =>
        service.create({
            name: 'Pizza',
            description: null,
            price: 10,
            category: 'principal',
            available: true,
            restaurantId,
            ingredients
        })

    beforeEach(async () => {
        dishRepo = new MockDishRepository()
        ingredientRepo = new MockIngredientRepository()
        service = new DishService(dishRepo, ingredientRepo)

        const ingredientService = new IngredientService(ingredientRepo)
        ingredienteR1 = (await ingredientService.create({ name: 'Tomate', unit: 'kg', currentStock: 5, restaurantId: 'r1' })).id
        ingredienteR2 = (await ingredientService.create({ name: 'Harina', unit: 'kg', currentStock: 5, restaurantId: 'r2' })).id
    })

    describe('create', () => {
        it('crea un plato con ingredientes del mismo restaurante', async () => {
            const plato = await crearPlato('r1', [{ ingredientId: ingredienteR1, quantity: 0.5 }])
            expect(plato.ingredients).toHaveLength(1)
        })

        it('rechaza un ingrediente de otro restaurante', async () => {
            await expect(crearPlato('r1', [{ ingredientId: ingredienteR2, quantity: 1 }]))
                .rejects.toThrow(InvalidDishIngredientError)
        })

        it('rechaza un ingrediente inexistente', async () => {
            await expect(crearPlato('r1', [{ ingredientId: 'no-existe', quantity: 1 }]))
                .rejects.toThrow(InvalidDishIngredientError)
        })
    })

    describe('ámbito por restaurante', () => {
        it('findById devuelve null si el plato es de otro restaurante', async () => {
            const plato = await crearPlato('r1')
            expect(await service.findById('r1', plato.id)).not.toBeNull()
            expect(await service.findById('r2', plato.id)).toBeNull()
        })

        it('update lanza DishNotFoundError si el plato es de otro restaurante y no lo modifica', async () => {
            const plato = await crearPlato('r1')

            await expect(service.update('r2', plato.id, {
                name: 'Hackeado',
                description: null,
                price: 0.01,
                category: 'principal',
                available: true,
                ingredients: []
            })).rejects.toThrow(DishNotFoundError)

            const intacto = await dishRepo.findById(plato.id)
            expect(intacto?.price).toBe(10)
            expect(intacto?.name).toBe('Pizza')
        })

        it('update actualiza el plato del propio restaurante', async () => {
            const plato = await crearPlato('r1')
            const actualizado = await service.update('r1', plato.id, {
                name: 'Pizza grande',
                description: null,
                price: 12,
                category: 'principal',
                available: true,
                ingredients: [{ ingredientId: ingredienteR1, quantity: 1 }]
            })
            expect(actualizado.price).toBe(12)
        })

        it('update rechaza un ingrediente de otro restaurante', async () => {
            const plato = await crearPlato('r1')
            await expect(service.update('r1', plato.id, {
                name: 'Pizza',
                description: null,
                price: 10,
                category: 'principal',
                available: true,
                ingredients: [{ ingredientId: ingredienteR2, quantity: 1 }]
            })).rejects.toThrow(InvalidDishIngredientError)
        })

        it('delete lanza DishNotFoundError si el plato es de otro restaurante y no lo borra', async () => {
            const plato = await crearPlato('r1')
            await expect(service.delete('r2', plato.id)).rejects.toThrow(DishNotFoundError)
            expect(await dishRepo.findById(plato.id)).not.toBeNull()
        })

        it('delete borra el plato del propio restaurante', async () => {
            const plato = await crearPlato('r1')
            await service.delete('r1', plato.id)
            expect(await dishRepo.findById(plato.id)).toBeNull()
        })
    })

    describe('validación de entrada', () => {
        const entrada = (price: unknown, ingredients: { ingredientId: string; quantity: unknown }[] = []) => ({
            name: 'Pizza',
            description: null,
            price: price as number,
            category: 'principal',
            available: true,
            restaurantId: 'r1',
            ingredients: ingredients as { ingredientId: string; quantity: number }[]
        })

        it.each(['abc', '10', NaN, Infinity, -5, 0])('create rechaza el precio %s', async (precio) => {
            await expect(service.create(entrada(precio))).rejects.toThrow(InvalidPriceError)
        })

        it.each(['abc', NaN, -5])('update rechaza el precio %s', async (precio) => {
            const plato = await crearPlato('r1')
            await expect(service.update('r1', plato.id, {
                name: 'Pizza',
                description: null,
                price: precio as number,
                category: 'principal',
                available: true,
                ingredients: []
            })).rejects.toThrow(InvalidPriceError)
        })

        it.each(['1', NaN, Infinity, 0, -1])('rechaza la cantidad %s de un ingrediente', async (cantidad) => {
            await expect(service.create(entrada(10, [{ ingredientId: ingredienteR1, quantity: cantidad }])))
                .rejects.toThrow('Ingredient quantity must be positive')
        })

        it('update sin available conserva el valor existente', async () => {
            const plato = await service.create({ ...entrada(10), available: false })
            const actualizado = await service.update('r1', plato.id, {
                name: 'Pizza',
                description: null,
                price: 10,
                category: 'principal',
                ingredients: []
            })
            expect(actualizado.available).toBe(false)
            expect((await dishRepo.findById(plato.id))?.available).toBe(false)
        })

        it('update con available lo cambia', async () => {
            const plato = await service.create({ ...entrada(10), available: false })
            const actualizado = await service.update('r1', plato.id, {
                name: 'Pizza',
                description: null,
                price: 10,
                category: 'principal',
                available: true,
                ingredients: []
            })
            expect(actualizado.available).toBe(true)
        })
    })
})
