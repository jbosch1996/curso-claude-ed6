import { describe, it, expect, beforeEach } from 'vitest'
import { IngredientService } from './ingredient.service.js'
import { normalizeIngredientUnit } from '@models/ingredient.model.js'
import { InvalidNumberError, NegativeStockError } from '@errors/DomainErrors.js'
import { MockIngredientRepository } from '@repositories/mocks/MockIngredientRepository.js'

describe('normalizeIngredientUnit', () => {
    it('should accept a valid unit', () => {
        expect(normalizeIngredientUnit('kg')).toBe('kg')
    })

    it('should normalize to lowercase', () => {
        expect(normalizeIngredientUnit('ML')).toBe('ml')
    })

    it('should throw InvalidUnitError for invalid unit', () => {
        expect(() => normalizeIngredientUnit('invalid')).toThrow('Invalid unit')
    })

    it('should throw InvalidUnitError for empty unit', () => {
        expect(() => normalizeIngredientUnit('')).toThrow('Unit must be provided')
    })

    it('should accept all valid units', () => {
        const validUnits = ['kg', 'g', 'l', 'ml', 'unidad']
        for (const u of validUnits) {
            expect(normalizeIngredientUnit(u)).toBe(u)
        }
    })
})

describe('IngredientService', () => {
    let repo: MockIngredientRepository
    let service: IngredientService

    const validInput = {
        name: 'Tomate',
        unit: 'kg',
        currentStock: 10,
        restaurantId: 'r1'
    }

    beforeEach(() => {
        repo = new MockIngredientRepository()
        service = new IngredientService(repo)
    })

    describe('create', () => {
        it('should create and save an ingredient', async () => {
            const result = await service.create(validInput)

            expect(result.id).toBeDefined()
            expect(result.name).toBe('Tomate')
            expect(result.unit).toBe('kg')
            expect(result.currentStock).toBe(10)
        })

        it('should throw IngredientNameRequiredError for empty name', async () => {
            await expect(service.create({ ...validInput, name: '' }))
                .rejects.toThrow('Ingredient name is required')
        })

        it('should throw NegativeStockError for negative stock', async () => {
            await expect(service.create({ ...validInput, currentStock: -1 }))
                .rejects.toThrow('Stock cannot be negative')
        })

        it('should throw InvalidUnitError for invalid unit', async () => {
            await expect(service.create({ ...validInput, unit: 'invalid' }))
                .rejects.toThrow('Invalid unit')
        })

        it('should throw RestaurantIdRequiredError for empty restaurantId', async () => {
            await expect(service.create({ ...validInput, restaurantId: '' }))
                .rejects.toThrow('Restaurant ID is required')
        })

        it('should allow zero stock', async () => {
            const result = await service.create({ ...validInput, currentStock: 0 })
            expect(result.currentStock).toBe(0)
        })
    })

    describe('update', () => {
        it('should update an existing ingredient', async () => {
            const created = await service.create(validInput)

            const updated = await service.update('r1', created.id, {
                name: 'Tomate Cherry',
                unit: 'kg',
                currentStock: 15
            })

            expect(updated.name).toBe('Tomate Cherry')
            expect(updated.currentStock).toBe(15)
        })

        it('should throw IngredientNotFoundError for non-existent id', async () => {
            await expect(service.update('r1', 'non-existent', {
                name: 'X',
                unit: 'kg',
                currentStock: 0
            })).rejects.toThrow('Ingredient not found')
        })

        it('should throw IngredientNotFoundError when the ingredient belongs to another restaurant', async () => {
            const created = await service.create(validInput)

            await expect(service.update('otro-restaurante', created.id, {
                name: 'Hackeado',
                unit: 'kg',
                currentStock: 999
            })).rejects.toThrow('Ingredient not found')

            const intacto = await repo.findById(created.id)
            expect(intacto?.name).toBe('Tomate')
        })
    })

    describe('findById', () => {
        it('should return the ingredient of the same restaurant', async () => {
            const created = await service.create(validInput)
            const found = await service.findById('r1', created.id)
            expect(found?.id).toBe(created.id)
        })

        it('should return null when the ingredient belongs to another restaurant', async () => {
            const created = await service.create(validInput)
            const found = await service.findById('otro-restaurante', created.id)
            expect(found).toBeNull()
        })
    })

    describe('delete', () => {
        it('should delete an existing ingredient', async () => {
            const created = await service.create(validInput)

            await service.delete('r1', created.id)

            const found = await repo.findById(created.id)
            expect(found).toBeNull()
        })

        it('should throw IngredientNotFoundError for non-existent id', async () => {
            await expect(service.delete('r1', 'non-existent'))
                .rejects.toThrow('Ingredient not found')
        })

        it('should not delete an ingredient of another restaurant', async () => {
            const created = await service.create(validInput)

            await expect(service.delete('otro-restaurante', created.id))
                .rejects.toThrow('Ingredient not found')

            const sigueExistiendo = await repo.findById(created.id)
            expect(sigueExistiendo).not.toBeNull()
        })
    })

    describe('validación de currentStock', () => {
        it.each(['10', NaN, Infinity, null, undefined])('should reject stock %s on create', async (stock) => {
            await expect(service.create({ ...validInput, currentStock: stock as number }))
                .rejects.toThrow(InvalidNumberError)
        })

        it('should reject a string stock on update', async () => {
            const created = await service.create(validInput)
            await expect(service.update(validInput.restaurantId, created.id, { name: 'Tomate', unit: 'kg', currentStock: '10' as unknown as number }))
                .rejects.toThrow(InvalidNumberError)
        })

        it('should keep rejecting negative stock with NegativeStockError', async () => {
            await expect(service.create({ ...validInput, currentStock: -0.5 }))
                .rejects.toThrow(NegativeStockError)
        })
    })
})
