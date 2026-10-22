import { describe, it, expect, beforeEach } from 'vitest'
import { OrderService, type OrderActor } from './order.service.js'
import { MockOrderRepository } from '@repositories/mocks/MockOrderRepository.js'
import { MockDishRepository } from '@repositories/mocks/MockDishRepository.js'
import { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import type { Table } from '@models/table.model.js'
import type { Order } from '@models/order.model.js'
import type { Dish } from '@models/dish.model.js'
import type { Pack } from '@models/pack.model.js'
import { MockPackRepository } from '@repositories/mocks/MockPackRepository.js'
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

describe('OrderService.create con mesas', () => {
    let tableRepo: MockTableRepository
    let service: OrderService

    const ahora = new Date().toISOString()
    const mesa = (id: string, restaurantId: string, status: Table['status']): Table => ({
        id, restaurantId, number: 1, description: null, capacity: 4, status, createdAt: ahora, updatedAt: ahora
    })
    const pedido = (tableId: string | null) => ({
        restaurantId: 'rest-1',
        tableId,
        clientId: 'cliente-1',
        items: [{ dishId: 'dish-1', quantity: 1, notes: null }]
    })

    beforeEach(async () => {
        const dishRepo = new MockDishRepository()
        tableRepo = new MockTableRepository()
        service = new OrderService(new MockOrderRepository(), dishRepo, tableRepo)
        await dishRepo.save(plato('dish-1', 'rest-1'))
        await tableRepo.save(mesa('mesa-ocupada', 'rest-1', 'ocupada'))
        await tableRepo.save(mesa('mesa-libre', 'rest-1', 'libre'))
        await tableRepo.save(mesa('mesa-reservada', 'rest-1', 'reservada'))
        await tableRepo.save(mesa('mesa-otro', 'rest-2', 'ocupada'))
    })

    it('acepta un pedido en una mesa ocupada del restaurante', async () => {
        const order = await service.create(pedido('mesa-ocupada'))
        expect(order.tableId).toBe('mesa-ocupada')
    })

    it('sigue aceptando un pedido sin mesa', async () => {
        await expect(service.create(pedido(null))).resolves.toBeDefined()
    })

    it.each(['mesa-libre', 'mesa-reservada', 'mesa-otro', 'no-existe'])('rechaza la mesa %s', async (tableId) => {
        await expect(service.create(pedido(tableId))).rejects.toThrow(InvalidOrderError)
        await expect(service.create(pedido(tableId))).rejects.toThrow('Table is not occupied in this restaurant')
    })

    it('sin repositorio de mesas no valida el tableId (compatibilidad)', async () => {
        const sinMesas = new OrderService(new MockOrderRepository(), (() => {
            const dishRepo = new MockDishRepository()
            void dishRepo.save(plato('dish-1', 'rest-1'))
            return dishRepo
        })())
        await expect(sinMesas.create(pedido('cualquier-texto'))).resolves.toBeDefined()
    })
})

describe('OrderService.create con packs', () => {
    let repo: MockOrderRepository
    let dishRepo: MockDishRepository
    let packRepo: MockPackRepository
    let service: OrderService

    const lineaPack = (extra: Record<string, unknown> = {}) => ({
        packId: 'pack-1', dishIds: ['ensalada', 'pizza', 'agua'], quantity: 1, notes: null, ...extra
    })

    const pedido = (packs: unknown, items: unknown = undefined) => ({
        restaurantId: 'rest-1',
        tableId: null,
        clientId: 'cliente-1',
        items: items as { dishId: string; quantity: number; notes: string | null }[],
        packs: packs as any
    })

    const pack = (overrides: Partial<Pack> = {}): Pack => ({
        id: 'pack-1', restaurantId: 'rest-1', name: 'Menú del día', description: null, price: 18, available: true,
        categories: ['entrante', 'principal', 'bebida'], excludedDishIds: ['cerveza'], createdAt: '', updatedAt: '',
        ...overrides
    })

    beforeEach(async () => {
        repo = new MockOrderRepository()
        dishRepo = new MockDishRepository()
        packRepo = new MockPackRepository()
        service = new OrderService(repo, dishRepo, undefined, packRepo)

        await dishRepo.save(plato('ensalada', 'rest-1', { name: 'Ensalada', price: 9, category: 'entrante' }))
        await dishRepo.save(plato('pizza', 'rest-1', { name: 'Pizza', price: 12.5, category: 'principal' }))
        await dishRepo.save(plato('agua', 'rest-1', { name: 'Agua', price: 2, category: 'bebida' }))
        await dishRepo.save(plato('cerveza', 'rest-1', { name: 'Cerveza', price: 3, category: 'bebida' }))
        await packRepo.save(pack())
        await packRepo.save(pack({ id: 'pack-ajeno', restaurantId: 'rest-2' }))
        await packRepo.save(pack({ id: 'pack-oculto', available: false }))
    })

    describe('validación de la forma', () => {
        it('rechaza packs que no es un array', async () => {
            await expect(service.create(pedido('hola'))).rejects.toThrow('packs must be an array')
        })

        it('rechaza un pedido sin items ni packs', async () => {
            await expect(service.create(pedido([], []))).rejects.toThrow('An order must have 1 to 50 lines')
        })

        it('rechaza más de 50 líneas sumando items y packs', async () => {
            const items = Array.from({ length: 50 }, () => ({ dishId: 'pizza', quantity: 1, notes: null }))
            await expect(service.create(pedido([lineaPack()], items))).rejects.toThrow('An order must have 1 to 50 lines')
        })

        it.each([
            ['sin packId', { packId: '' }, 'Every pack line needs a packId'],
            ['con packId no texto', { packId: 5 }, 'Every pack line needs a packId'],
            ['con cantidad 0', { quantity: 0 }, 'quantity must be an integer between 1 and 20'],
            ['con cantidad 21', { quantity: 21 }, 'quantity must be an integer between 1 and 20'],
            ['con cantidad decimal', { quantity: 1.5 }, 'quantity must be an integer between 1 and 20'],
            ['con notas demasiado largas', { notes: 'x'.repeat(201) }, 'notes must be a string of at most 200 characters'],
            ['con notas no texto', { notes: 5 }, 'notes must be a string of at most 200 characters'],
            ['sin dishIds', { dishIds: 'ensalada' }, 'dishIds must be an array of 1 to 4 dish ids'],
            ['con más de 4 platos', { dishIds: ['a', 'b', 'c', 'd', 'e'] }, 'dishIds must be an array of 1 to 4 dish ids']
        ])('rechaza una línea de pack %s', async (_caso, extra, mensaje) => {
            await expect(service.create(pedido([lineaPack(extra)]))).rejects.toThrow(mensaje)
            expect(repo.orders).toHaveLength(0)
        })

        it('cuenta como unidades los platos de cada pack (máximo 100)', async () => {
            // 2 líneas × 20 packs × 3 platos = 120 unidades
            await expect(service.create(pedido([lineaPack({ quantity: 20 }), lineaPack({ quantity: 20 })])))
                .rejects.toThrow('An order cannot exceed 100 units')
        })

        it('rechaza packs si el servicio no tiene repositorio de packs', async () => {
            const sinPacks = new OrderService(repo, dishRepo)
            await expect(sinPacks.create(pedido([lineaPack()]))).rejects.toThrow('Packs are not supported')
        })
    })

    describe('resolución y expansión', () => {
        it.each([
            ['inexistente', 'pack-nope'],
            ['de otro restaurante', 'pack-ajeno'],
            ['no disponible', 'pack-oculto']
        ])('rechaza un pack %s', async (_caso, packId) => {
            await expect(service.create(pedido([lineaPack({ packId })]))).rejects.toThrow(`Pack ${packId} is not available in this restaurant`)
            expect(repo.orders).toHaveLength(0)
        })

        it('rechaza una selección con un plato excluido', async () => {
            await expect(service.create(pedido([lineaPack({ dishIds: ['ensalada', 'pizza', 'cerveza'] })])))
                .rejects.toThrow('Dish cerveza cannot be chosen in pack pack-1')
            expect(repo.orders).toHaveLength(0)
        })

        it('rechaza una selección que no cubre todas las categorías', async () => {
            await expect(service.create(pedido([lineaPack({ dishIds: ['ensalada', 'pizza'] })])))
                .rejects.toThrow('Pack pack-1 needs exactly one dish per category: entrante, principal, bebida')
        })

        it('expande cada pack en un ítem por plato con el precio del pack en el primero', async () => {
            const order = await service.create(pedido([lineaPack({ dishIds: ['agua', 'pizza', 'ensalada'], quantity: 2, notes: 'sin hielo' })]))

            expect(order.items).toHaveLength(6)
            const instancias = [...new Set(order.items.map(i => i.packInstanceId))]
            expect(instancias).toHaveLength(2)
            for (const instancia of instancias) {
                const items = order.items.filter(i => i.packInstanceId === instancia)
                expect(items.map(i => i.dishId)).toEqual(['ensalada', 'pizza', 'agua'])
                expect(items.map(i => i.dishPrice)).toEqual([18, 0, 0])
                expect(items.every(i => i.packId === 'pack-1' && i.packName === 'Menú del día')).toBe(true)
                expect(items.every(i => i.quantity === 1 && i.status === 'pendiente' && i.notes === 'sin hielo')).toBe(true)
            }
            expect(repo.orders).toHaveLength(1)
        })

        it('combina platos sueltos y packs en el mismo pedido', async () => {
            const order = await service.create(pedido([lineaPack()], [{ dishId: 'cerveza', quantity: 2, notes: null }]))
            expect(order.items).toHaveLength(5)
            expect(order.items.filter(i => i.packInstanceId === undefined).map(i => i.dishId)).toEqual(['cerveza', 'cerveza'])
        })
    })
})
