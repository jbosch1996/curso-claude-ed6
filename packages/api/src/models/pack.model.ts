import type { Dish, DishCategoryType } from '@models/dish.model.js'
import { normalizeDishCategory } from '@models/dish.model.js'
import { assertPositiveNumber } from '@models/validation.js'
import { InvalidPackError, InvalidOrderError } from '@errors/DomainErrors.js'

const MAX_NAME_LENGTH = 100
const MAX_DESCRIPTION_LENGTH = 300
const MAX_CATEGORIES = 4
const MAX_EXCLUDED_DISHES = 100

export interface Pack {
    id: string
    restaurantId: string
    name: string
    description: string | null
    price: number
    available: boolean
    categories: DishCategoryType[]
    excludedDishIds: string[]
    createdAt: string
    updatedAt: string
}

export interface PackInput {
    name?: unknown
    description?: unknown
    price?: unknown
    available?: unknown
    categories?: unknown
    excludedDishIds?: unknown
}

export interface PackFields {
    name: string
    description: string | null
    price: number
    available: boolean | undefined
    categories: DishCategoryType[]
    excludedDishIds: string[]
}

export function validatePackFields(input: PackInput): PackFields {
    if (typeof input.name !== 'string' || input.name.trim() === '' || input.name.trim().length > MAX_NAME_LENGTH) {
        throw new InvalidPackError(`Name is required and must have at most ${MAX_NAME_LENGTH} characters`)
    }

    let description: string | null = null
    if (input.description !== undefined && input.description !== null) {
        if (typeof input.description !== 'string' || input.description.length > MAX_DESCRIPTION_LENGTH) {
            throw new InvalidPackError(`Description must be a string of at most ${MAX_DESCRIPTION_LENGTH} characters`)
        }
        description = input.description.trim() === '' ? null : input.description.trim()
    }

    assertPositiveNumber(input.price, new InvalidPackError('Price must be a positive number'))

    if (input.available !== undefined && typeof input.available !== 'boolean') {
        throw new InvalidPackError('available must be a boolean')
    }

    return {
        name: input.name.trim(),
        description,
        price: input.price as number,
        available: input.available as boolean | undefined,
        categories: normalizeCategories(input.categories),
        excludedDishIds: normalizeExcludedDishIds(input.excludedDishIds)
    }
}

function normalizeCategories(value: unknown): DishCategoryType[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CATEGORIES) {
        throw new InvalidPackError(`categories must be an array with 1 to ${MAX_CATEGORIES} categories`)
    }
    const categories = value.map(category => {
        try {
            return normalizeDishCategory(String(category))
        } catch (error) {
            throw new InvalidPackError((error as Error).message)
        }
    })
    if (new Set(categories).size !== categories.length) {
        throw new InvalidPackError('categories cannot be repeated')
    }
    return categories
}

function normalizeExcludedDishIds(value: unknown): string[] {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value) || value.length > MAX_EXCLUDED_DISHES
        || value.some(id => typeof id !== 'string' || id.trim() === '')) {
        throw new InvalidPackError(`excludedDishIds must be an array of at most ${MAX_EXCLUDED_DISHES} dish ids`)
    }
    if (new Set(value).size !== value.length) {
        throw new InvalidPackError('excludedDishIds cannot be repeated')
    }
    return value as string[]
}

export function eligibleDishes(pack: Pack, dishes: Dish[], category: DishCategoryType): Dish[] {
    return dishes.filter(dish => dish.restaurantId === pack.restaurantId && dish.available
        && dish.category === category && !pack.excludedDishIds.includes(dish.id))
}

// Un plato por categoría del pack (el orden de dishIds no importa); devuelve los platos en el orden del pack.
export function resolvePackSelection(pack: Pack, dishIds: unknown, dishes: Dish[]): Dish[] {
    if (!Array.isArray(dishIds) || dishIds.length !== pack.categories.length) {
        throw new InvalidOrderError(`Pack ${pack.id} needs exactly one dish per category: ${pack.categories.join(', ')}`)
    }
    const selected = new Map<DishCategoryType, Dish>()
    for (const dishId of dishIds) {
        const dish = dishes.find(d => d.id === dishId)
        if (!dish || !eligibleDishes(pack, [dish], dish.category).length || !pack.categories.includes(dish.category)) {
            throw new InvalidOrderError(`Dish ${String(dishId)} cannot be chosen in pack ${pack.id}`)
        }
        if (selected.has(dish.category)) {
            throw new InvalidOrderError(`Pack ${pack.id} needs exactly one dish per category: ${pack.categories.join(', ')}`)
        }
        selected.set(dish.category, dish)
    }
    return pack.categories.map(category => selected.get(category) as Dish)
}
