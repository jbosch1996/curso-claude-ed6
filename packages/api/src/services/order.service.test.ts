import { describe, it, expect, beforeEach } from 'vitest'
import { OrderService, type OrderActor } from './order.service.js'
import { MockOrderRepository } from '@repositories/mocks/MockOrderRepository.js'
import { MockDishRepository } from '@repositories/mocks/MockDishRepository.js'
import type { Order } from '@models/order.model.js'
import type { Dish } from '@models/dish.model.js'
import {
    OrderNotFoundError,
    InvalidOrderStatusError,
    InvalidOrderError,
    ForbiddenTransitionError
} from '@errors/DomainErrors.js'

const actor = (role: string, restaurantId: string | null, id = 'u1'): OrderActor => ({ id, role, restaurantId })

const plato = (id: string, restaurantId: string, overrides: Partial<Dish> = {}): Dish => ({
    id,
    name: 'Plato',
    description: null,
    price: 10,
    category: 'principal',
    available: true,
    restaurantId,
    ingredients: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
})

describe('OrderService.updateItemStatus', () => {
    let repo: MockOrderRepository
    let dishRepo: MockDishRepository
    let service: OrderService
    let testOrder: Order

    beforeEach(async () => {
        repo = new MockOrderRepository()
        dishRepo = new MockDishRepository()
        service = new OrderService(repo, dishRepo)

        testOrder = {
            id: 'order-1',
            restaurantId: 'rest-1',
            tableId: null,
            clientId: null,
            createdAt: new Date(),
            items: [
                { id: 'item-1', dishId: 'dish-1', quantity: 1, notes: null, status: 'pendiente' }
            ]
        }
        await repo.create(testOrder)
    })

    it('should update the status of an item successfully', async () => {
        await service.updateItemStatus('order-1', 'item-1', 'preparando', actor('manager', 'rest-1'))
        const updatedItem = testOrder.items[0]!
        expect(updatedItem.status).toBe('preparando')
    })

    it('should throw an error if the order does not exist', async () => {
        await expect(service.updateItemStatus('order-bad', 'item-1', 'preparando', actor('manager', 'rest-1')))
            .rejects.toThrow(OrderNotFoundError)
    })

    it('should throw an error if the item does not exist inside the order', async () => {
        await expect(service.updateItemStatus('order-1', 'item-bad', 'preparando', actor('manager', 'rest-1')))
            .rejects.toThrow(OrderNotFoundError)
    })

    it('should throw DomainError if status is invalid', async () => {
        await expect(service.updateItemStatus('order-1', 'item-1', 'invalid-status', actor('manager', 'rest-1')))
            .rejects.toThrow(InvalidOrderStatusError)
    })

    it('should hide the order from an employee of another restaurant and leave it untouched', async () => {
        await expect(service.updateItemStatus('order-1', 'item-1', 'preparando', actor('manager', 'rest-2')))
            .rejects.toThrow(OrderNotFoundError)
        expect(testOrder.items[0]!.status).toBe('pendiente')
    })

    it('should let an admin update an order of any restaurant', async () => {
        await service.updateItemStatus('order-1', 'item-1', 'preparando', actor('admin', null))
        expect(testOrder.items[0]!.status).toBe('preparando')
    })

    it('should reject a cocinero delivering an item', async () => {
        testOrder.items[0]!.status = 'listo'
        await expect(service.updateItemStatus('order-1', 'item-1', 'entregado', actor('cocinero', 'rest-1')))
            .rejects.toThrow(ForbiddenTransitionError)
        expect(testOrder.items[0]!.status).toBe('listo')
    })

    it('should reject a camarero moving an item to preparando', async () => {
        await expect(service.updateItemStatus('order-1', 'item-1', 'preparando', actor('camarero', 'rest-1')))
            .rejects.toThrow(ForbiddenTransitionError)
    })

    it('should reject a cliente changing the status', async () => {
        await expect(service.updateItemStatus('order-1', 'item-1', 'preparando', actor('cliente', null)))
            .rejects.toThrow(OrderNotFoundError)
    })
})

describe('OrderService.create', () => {
    let repo: MockOrderRepository
    let dishRepo: MockDishRepository
    let service: OrderService

    const pedido = (items: unknown, extra: Record<string, unknown> = {}) => ({
        restaurantId: 'rest-1',
        tableId: null,
        clientId: 'cliente-1',
        items: items as { dishId: string; quantity: number; notes: string | null }[],
        ...extra
    })

    beforeEach(async () => {
        repo = new MockOrderRepository()
        dishRepo = new MockDishRepository()
        service = new OrderService(repo, dishRepo)

        await dishRepo.save(plato('dish-1', 'rest-1'))
        await dishRepo.save(plato('dish-agotado', 'rest-1', { available: false }))
        await dishRepo.save(plato('dish-otro', 'rest-2'))
    })

    it('crea un pedido válido con una fila por unidad', async () => {
        const order = await service.create(pedido([{ dishId: 'dish-1', quantity: 3, notes: 'sin sal' }]))
        expect(order.items).toHaveLength(3)
        expect(order.items.every(i => i.status === 'pendiente')).toBe(true)
        expect(repo.orders).toHaveLength(1)
    })

    it.each([
        ['cero', 0],
        ['negativa', -1],
        ['decimal', 1.5],
        ['NaN', Number.NaN],
        ['texto', '3'],
        ['demasiado grande', 21],
        ['enorme', 1_000_000_000]
    ])('rechaza una cantidad %s', async (_nombre, quantity) => {
        await expect(service.create(pedido([{ dishId: 'dish-1', quantity, notes: null }])))
            .rejects.toThrow(InvalidOrderError)
        expect(repo.orders).toHaveLength(0)
    })

    it('acepta la cantidad máxima de 20', async () => {
        const order = await service.create(pedido([{ dishId: 'dish-1', quantity: 20, notes: null }]))
        expect(order.items).toHaveLength(20)
    })

    it('rechaza items vacío o que no es un array', async () => {
        await expect(service.create(pedido([]))).rejects.toThrow(InvalidOrderError)
        await expect(service.create(pedido('hola'))).rejects.toThrow(InvalidOrderError)
        await expect(service.create(pedido(undefined))).rejects.toThrow(InvalidOrderError)
    })

    it('rechaza más de 50 líneas', async () => {
        const lineas = Array.from({ length: 51 }, () => ({ dishId: 'dish-1', quantity: 1, notes: null }))
        await expect(service.create(pedido(lineas))).rejects.toThrow(InvalidOrderError)
    })

    it('rechaza más de 100 unidades en total', async () => {
        const lineas = Array.from({ length: 6 }, () => ({ dishId: 'dish-1', quantity: 20, notes: null }))
        await expect(service.create(pedido(lineas))).rejects.toThrow(InvalidOrderError)
    })

    it('rechaza notas demasiado largas o que no son texto', async () => {
        await expect(service.create(pedido([{ dishId: 'dish-1', quantity: 1, notes: 'x'.repeat(201) }])))
            .rejects.toThrow(InvalidOrderError)
        await expect(service.create(pedido([{ dishId: 'dish-1', quantity: 1, notes: 5 }])))
            .rejects.toThrow(InvalidOrderError)
    })

    it('rechaza un tableId demasiado largo', async () => {
        await expect(service.create(pedido([{ dishId: 'dish-1', quantity: 1, notes: null }], { tableId: 'm'.repeat(51) })))
            .rejects.toThrow(InvalidOrderError)
    })

    it('rechaza un plato de otro restaurante', async () => {
        await expect(service.create(pedido([{ dishId: 'dish-otro', quantity: 1, notes: null }])))
            .rejects.toThrow(InvalidOrderError)
    })

    it('rechaza un plato inexistente', async () => {
        await expect(service.create(pedido([{ dishId: 'no-existe', quantity: 1, notes: null }])))
            .rejects.toThrow(InvalidOrderError)
    })

    it('rechaza un plato no disponible', async () => {
        await expect(service.create(pedido([{ dishId: 'dish-agotado', quantity: 1, notes: null }])))
            .rejects.toThrow(InvalidOrderError)
    })
})

describe('OrderService.getById', () => {
    let repo: MockOrderRepository
    let service: OrderService

    beforeEach(async () => {
        repo = new MockOrderRepository()
        service = new OrderService(repo, new MockDishRepository())
        await repo.create({
            id: 'order-1',
            restaurantId: 'rest-1',
            tableId: null,
            clientId: 'cliente-1',
            createdAt: new Date(),
            items: []
        })
    })

    it('devuelve el pedido a su cliente propietario', async () => {
        const order = await service.getById('order-1', actor('cliente', null, 'cliente-1'))
        expect(order.id).toBe('order-1')
    })

    it('devuelve el pedido a un empleado del restaurante', async () => {
        const order = await service.getById('order-1', actor('camarero', 'rest-1'))
        expect(order.id).toBe('order-1')
    })

    it('devuelve el pedido a un admin', async () => {
        const order = await service.getById('order-1', actor('admin', null))
        expect(order.id).toBe('order-1')
    })

    it('oculta el pedido a otro cliente', async () => {
        await expect(service.getById('order-1', actor('cliente', null, 'cliente-2')))
            .rejects.toThrow(OrderNotFoundError)
    })

    it('oculta el pedido a un empleado de otro restaurante', async () => {
        await expect(service.getById('order-1', actor('manager', 'rest-2')))
            .rejects.toThrow(OrderNotFoundError)
    })

    it('lanza OrderNotFoundError si no existe', async () => {
        await expect(service.getById('no-existe', actor('admin', null)))
            .rejects.toThrow(OrderNotFoundError)
    })
})
