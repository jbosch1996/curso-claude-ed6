import { randomUUID } from 'crypto'
import type { Dish, DishIngredient } from '@models/dish.model.js'
import { normalizeDishCategory, validateDishIngredient } from '@models/dish.model.js'
import { assertPositiveNumber } from '@models/validation.js'
import type { DishRepository } from '@repositories/dish.repository.js'
import type { IngredientRepository } from '@repositories/ingredient.repository.js'
import { DishNameRequiredError, InvalidPriceError, RestaurantIdRequiredError, DishNotFoundError, InvalidDishIngredientError } from '@errors/DomainErrors.js'

interface CreateDishInput {
    name: string
    description: string | null
    price: number
    category: string
    available: boolean
    restaurantId: string
    ingredients: DishIngredient[]
}

interface UpdateDishInput {
    name: string
    description: string | null
    price: number
    category: string
    available?: boolean
    ingredients: DishIngredient[]
}

export class DishService {
    constructor(
        private readonly dishRepository: DishRepository,
        private readonly ingredientRepository: IngredientRepository
    ) {}

    async create(input: CreateDishInput): Promise<Dish> {
        const now = new Date().toISOString()
        const dish = this.buildDish({
            id: randomUUID(),
            name: input.name,
            description: input.description,
            price: input.price,
            category: input.category,
            available: input.available ?? true,
            restaurantId: input.restaurantId,
            ingredients: input.ingredients ?? [],
            createdAt: now,
            updatedAt: now
        })

        await this.assertIngredientsBelongToRestaurant(dish.restaurantId, dish.ingredients)
        await this.dishRepository.save(dish)
        return dish
    }

    async update(restaurantId: string, id: string, input: UpdateDishInput): Promise<Dish> {
        const existing = await this.findById(restaurantId, id)
        if (!existing) {
            throw new DishNotFoundError()
        }

        const now = new Date().toISOString()
        const updated = this.buildDish({
            id: existing.id,
            name: input.name,
            description: input.description,
            price: input.price,
            category: input.category,
            available: input.available ?? existing.available,
            restaurantId: existing.restaurantId,
            ingredients: input.ingredients ?? [],
            createdAt: existing.createdAt,
            updatedAt: now
        })

        await this.assertIngredientsBelongToRestaurant(updated.restaurantId, updated.ingredients)
        await this.dishRepository.save(updated)
        return updated
    }

    async delete(restaurantId: string, id: string): Promise<void> {
        const dish = await this.findById(restaurantId, id)
        if (!dish) {
            throw new DishNotFoundError()
        }
        await this.dishRepository.delete(id)
    }

    async findById(restaurantId: string, id: string): Promise<Dish | null> {
        const dish = await this.dishRepository.findById(id)
        if (!dish || dish.restaurantId !== restaurantId) {
            return null
        }
        return dish
    }

    async findByRestaurantId(restaurantId: string): Promise<Dish[]> {
        return this.dishRepository.findByRestaurantId(restaurantId)
    }

    private async assertIngredientsBelongToRestaurant(restaurantId: string, ingredients: DishIngredient[]): Promise<void> {
        for (const { ingredientId } of ingredients) {
            const ingredient = await this.ingredientRepository.findById(ingredientId)
            if (!ingredient || ingredient.restaurantId !== restaurantId) {
                throw new InvalidDishIngredientError(`Ingredient ${ingredientId} does not belong to this restaurant`)
            }
        }
    }

    private buildDish(props: {
        id: string
        name: string
        description: string | null
        price: number
        category: string
        available: boolean
        restaurantId: string
        ingredients: DishIngredient[]
        createdAt: string
        updatedAt: string
    }): Dish {
        if (!props.name || props.name.trim() === '') {
            throw new DishNameRequiredError()
        }
        assertPositiveNumber(props.price, new InvalidPriceError())
        if (!props.restaurantId || props.restaurantId.trim() === '') {
            throw new RestaurantIdRequiredError()
        }

        return {
            id: props.id,
            name: props.name,
            description: props.description ?? null,
            price: props.price,
            category: normalizeDishCategory(props.category),
            available: props.available,
            restaurantId: props.restaurantId,
            ingredients: props.ingredients.map(i => validateDishIngredient(i)),
            createdAt: props.createdAt,
            updatedAt: props.updatedAt
        }
    }
}
