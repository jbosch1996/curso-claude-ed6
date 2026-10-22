import { randomUUID } from 'crypto'
import type { Pack, PackInput } from '@models/pack.model.js'
import { validatePackFields, eligibleDishes } from '@models/pack.model.js'
import type { PackRepository } from '@repositories/pack.repository.js'
import type { DishRepository } from '@repositories/dish.repository.js'
import type { DishCategoryType } from '@models/dish.model.js'
import { InvalidPackError, PackNotFoundError } from '@errors/DomainErrors.js'

export interface PublicPack {
    id: string
    name: string
    description: string | null
    price: number
    slots: { category: DishCategoryType; dishes: { id: string; name: string; description: string | null; price: number }[] }[]
}

export class PackService {
    constructor(
        private readonly packRepository: PackRepository,
        private readonly dishRepository: DishRepository
    ) {}

    async create(restaurantId: string, input: PackInput): Promise<Pack> {
        const fields = validatePackFields(input)
        await this.assertDishesBelongToRestaurant(restaurantId, fields.excludedDishIds)

        const now = new Date().toISOString()
        const pack: Pack = {
            id: randomUUID(),
            restaurantId,
            ...fields,
            available: fields.available ?? true,
            createdAt: now,
            updatedAt: now
        }
        await this.packRepository.save(pack)
        return pack
    }

    async list(restaurantId: string): Promise<Pack[]> {
        return this.packRepository.findByRestaurantId(restaurantId)
    }

    async findById(restaurantId: string, id: string): Promise<Pack> {
        const pack = await this.packRepository.findById(id)
        if (!pack || pack.restaurantId !== restaurantId) throw new PackNotFoundError()
        return pack
    }

    async update(restaurantId: string, id: string, input: PackInput): Promise<Pack> {
        const existing = await this.findById(restaurantId, id)
        const fields = validatePackFields(input)
        await this.assertDishesBelongToRestaurant(restaurantId, fields.excludedDishIds)

        const updated: Pack = {
            ...existing,
            ...fields,
            available: fields.available ?? existing.available,
            updatedAt: new Date().toISOString()
        }
        await this.packRepository.save(updated)
        return updated
    }

    async delete(restaurantId: string, id: string): Promise<void> {
        await this.findById(restaurantId, id)
        await this.packRepository.delete(id)
    }

    // Packs que el cliente puede pedir: disponibles y con al menos un plato elegible en cada categoría.
    async listPublic(restaurantId: string): Promise<PublicPack[]> {
        const packs = (await this.packRepository.findByRestaurantId(restaurantId)).filter(p => p.available)
        const dishes = await this.dishRepository.findByRestaurantId(restaurantId)

        return packs
            .map(pack => ({
                id: pack.id,
                name: pack.name,
                description: pack.description,
                price: pack.price,
                slots: pack.categories.map(category => ({
                    category,
                    dishes: eligibleDishes(pack, dishes, category)
                        .map(d => ({ id: d.id, name: d.name, description: d.description, price: d.price }))
                }))
            }))
            .filter(pack => pack.slots.every(slot => slot.dishes.length > 0))
    }

    private async assertDishesBelongToRestaurant(restaurantId: string, dishIds: string[]): Promise<void> {
        for (const dishId of dishIds) {
            const dish = await this.dishRepository.findById(dishId)
            if (!dish || dish.restaurantId !== restaurantId) {
                throw new InvalidPackError('Excluded dishes must belong to the restaurant')
            }
        }
    }
}
