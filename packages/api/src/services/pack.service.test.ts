import { describe, it, expect, beforeEach } from 'vitest'
import { PackService } from './pack.service.js'
import { MockPackRepository } from '@repositories/mocks/MockPackRepository.js'
import { MockDishRepository } from '@repositories/mocks/MockDishRepository.js'
import type { Dish, DishCategoryType } from '@models/dish.model.js'
import { InvalidPackError, PackNotFoundError } from '@errors/DomainErrors.js'

const plato = (id: string, category: DishCategoryType, extra: Partial<Dish> = {}): Dish => ({
    id, name: id, description: `desc ${id}`, price: 5, category, available: true, restaurantId: 'r1',
    ingredients: [], createdAt: '', updatedAt: '', ...extra
})

describe('PackService', () => {
    let packs: MockPackRepository
    let dishes: MockDishRepository
    let service: PackService

    const entrada = { name: 'Menú del día', price: 20, categories: ['entrante', 'principal', 'bebida'], excludedDishIds: ['cerveza'] }

    beforeEach(async () => {
        packs = new MockPackRepository()
        dishes = new MockDishRepository()
        service = new PackService(packs, dishes)
        for (const dish of [
            plato('ensalada', 'entrante'),
            plato('sopa', 'entrante', { available: false }),
            plato('pizza', 'principal'),
            plato('agua', 'bebida'),
            plato('cerveza', 'bebida'),
            plato('ajeno', 'bebida', { restaurantId: 'r2' })
        ]) {
            await dishes.save(dish)
        }
    })

    describe('create', () => {
        it('crea un pack disponible por defecto en el restaurante', async () => {
            const pack = await service.create('r1', entrada)
            expect(pack).toMatchObject({
                restaurantId: 'r1', name: 'Menú del día', description: null, price: 20, available: true,
                categories: ['entrante', 'principal', 'bebida'], excludedDishIds: ['cerveza']
            })
            expect(pack.id).toBeTruthy()
            expect(await packs.findById(pack.id)).toEqual(pack)
        })

        it('rechaza datos inválidos', async () => {
            await expect(service.create('r1', { ...entrada, price: 0 })).rejects.toThrow(InvalidPackError)
        })

        it.each(['ajeno', 'inexistente'])('rechaza excluir el plato %s, que no es del restaurante', async (dishId) => {
            await expect(service.create('r1', { ...entrada, excludedDishIds: [dishId] }))
                .rejects.toThrow('Excluded dishes must belong to the restaurant')
        })
    })

    describe('findById, list, update y delete', () => {
        it('devuelve el pack de su restaurante y PackNotFoundError si es de otro', async () => {
            const pack = await service.create('r1', entrada)
            expect(await service.findById('r1', pack.id)).toEqual(pack)
            await expect(service.findById('r2', pack.id)).rejects.toThrow(PackNotFoundError)
            await expect(service.findById('r1', 'nope')).rejects.toThrow(PackNotFoundError)
        })

        it('lista solo los packs del restaurante', async () => {
            await service.create('r1', entrada)
            await service.create('r2', { ...entrada, excludedDishIds: [] })
            expect(await service.list('r1')).toHaveLength(1)
        })

        it('actualiza un pack manteniendo id, restaurante y disponibilidad si no se indica', async () => {
            const pack = await service.create('r1', { ...entrada, available: false })
            const actualizado = await service.update('r1', pack.id, { name: 'Menú noche', price: 25, categories: ['principal'] })
            expect(actualizado).toMatchObject({
                id: pack.id, restaurantId: 'r1', name: 'Menú noche', price: 25, available: false,
                categories: ['principal'], excludedDishIds: [], createdAt: pack.createdAt
            })
            expect(await packs.findById(pack.id)).toEqual(actualizado)
        })

        it('no actualiza ni borra packs de otro restaurante', async () => {
            const pack = await service.create('r1', entrada)
            await expect(service.update('r2', pack.id, entrada)).rejects.toThrow(PackNotFoundError)
            await expect(service.delete('r2', pack.id)).rejects.toThrow(PackNotFoundError)
            expect(await packs.findById(pack.id)).not.toBeNull()
        })

        it('valida los excluidos también al actualizar', async () => {
            const pack = await service.create('r1', entrada)
            await expect(service.update('r1', pack.id, { ...entrada, excludedDishIds: ['ajeno'] })).rejects.toThrow(InvalidPackError)
        })

        it('borra un pack', async () => {
            const pack = await service.create('r1', entrada)
            await service.delete('r1', pack.id)
            expect(await packs.findById(pack.id)).toBeNull()
        })
    })

    describe('listPublic', () => {
        it('devuelve los packs disponibles con los platos elegibles por categoría, sin datos internos', async () => {
            const pack = await service.create('r1', entrada)
            await service.create('r1', { ...entrada, name: 'Oculto', available: false })
            await service.create('r2', { ...entrada, excludedDishIds: [] })

            expect(await service.listPublic('r1')).toEqual([{
                id: pack.id,
                name: 'Menú del día',
                description: null,
                price: 20,
                slots: [
                    { category: 'entrante', dishes: [{ id: 'ensalada', name: 'ensalada', description: 'desc ensalada', price: 5 }] },
                    { category: 'principal', dishes: [{ id: 'pizza', name: 'pizza', description: 'desc pizza', price: 5 }] },
                    { category: 'bebida', dishes: [{ id: 'agua', name: 'agua', description: 'desc agua', price: 5 }] }
                ]
            }])
        })

        it('omite los packs con alguna categoría sin platos elegibles', async () => {
            await service.create('r1', { ...entrada, categories: ['entrante', 'postre'] })
            expect(await service.listPublic('r1')).toEqual([])
        })
    })
})
