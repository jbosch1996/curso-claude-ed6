import { randomUUID } from 'crypto'
import type { Ingredient } from '@models/ingredient.model.js'
import { normalizeIngredientUnit } from '@models/ingredient.model.js'
import { assertNonNegativeNumber } from '@models/validation.js'
import type { IngredientRepository } from '@repositories/ingredient.repository.js'
import { IngredientNameRequiredError, InvalidNumberError, NegativeStockError, RestaurantIdRequiredError, IngredientNotFoundError } from '@errors/DomainErrors.js'

export interface CreateIngredientDTO {
    name: string
    unit: string
    currentStock: number
    restaurantId: string
}

export interface UpdateIngredientDTO {
    name: string
    unit: string
    currentStock: number
}

export class IngredientService {
    constructor(private readonly ingredientRepository: IngredientRepository) {}

    async create(dto: CreateIngredientDTO): Promise<Ingredient> {
        const now = new Date().toISOString()
        const ingredient = this.buildIngredient({
            id: randomUUID(),
            name: dto.name,
            unit: dto.unit,
            currentStock: dto.currentStock,
            restaurantId: dto.restaurantId,
            createdAt: now,
            updatedAt: now
        })

        await this.ingredientRepository.save(ingredient)
        return ingredient
    }

    async update(restaurantId: string, id: string, dto: UpdateIngredientDTO): Promise<Ingredient> {
        const existing = await this.findById(restaurantId, id)
        if (!existing) {
            throw new IngredientNotFoundError()
        }

        const updated = this.buildIngredient({
            id: existing.id,
            name: dto.name,
            unit: dto.unit,
            currentStock: dto.currentStock,
            restaurantId: existing.restaurantId,
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString()
        })

        await this.ingredientRepository.save(updated)
        return updated
    }

    async delete(restaurantId: string, id: string): Promise<void> {
        const existing = await this.findById(restaurantId, id)
        if (!existing) {
            throw new IngredientNotFoundError()
        }
        await this.ingredientRepository.delete(id)
    }

    async findById(restaurantId: string, id: string): Promise<Ingredient | null> {
        const ingredient = await this.ingredientRepository.findById(id)
        if (!ingredient || ingredient.restaurantId !== restaurantId) {
            return null
        }
        return ingredient
    }

    async findByRestaurantId(restaurantId: string): Promise<Ingredient[]> {
        return this.ingredientRepository.findByRestaurantId(restaurantId)
    }

    private buildIngredient(props: {
        id: string
        name: string
        unit: string
        currentStock: number
        restaurantId: string
        createdAt: string
        updatedAt: string
    }): Ingredient {
        if (!props.name || props.name.trim() === '') {
            throw new IngredientNameRequiredError()
        }
        const stockError = typeof props.currentStock === 'number' && props.currentStock < 0
            ? new NegativeStockError()
            : new InvalidNumberError('Stock must be a finite number')
        assertNonNegativeNumber(props.currentStock, stockError)
        if (!props.restaurantId || props.restaurantId.trim() === '') {
            throw new RestaurantIdRequiredError()
        }

        return {
            id: props.id,
            name: props.name,
            unit: normalizeIngredientUnit(props.unit),
            currentStock: props.currentStock,
            restaurantId: props.restaurantId,
            createdAt: props.createdAt,
            updatedAt: props.updatedAt
        }
    }
}
