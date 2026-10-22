import { randomUUID } from 'crypto'
import type { Order, OrderItem } from '@models/order.model.js'
import { normalizeOrderStatus, assertTransitionAllowed } from '@models/order.model.js'
import type { OrderRepository } from '@repositories/order.repository.js'
import type { DishRepository } from '@repositories/dish.repository.js'
import type { TableRepository } from '@repositories/table.repository.js'
import type { PackRepository } from '@repositories/pack.repository.js'
import type { Dish } from '@models/dish.model.js'
import { resolvePackSelection } from '@models/pack.model.js'
import { RestaurantIdRequiredError, OrderNotFoundError, InvalidOrderError } from '@errors/DomainErrors.js'

const MAX_LINES = 50
const MAX_QUANTITY_PER_LINE = 20
const MAX_UNITS_PER_ORDER = 100
const MAX_NOTES_LENGTH = 200
const MAX_TABLE_ID_LENGTH = 50
const EMPLOYEE_ROLES = ['manager', 'camarero', 'cocinero']
const MAX_DISHES_PER_PACK = 4

export interface OrderActor {
    id: string
    role: string
    restaurantId: string | null
}

export interface CreateOrderRequest {
    restaurantId: string
    tableId: string | null
    clientId: string | null
    items: {
        dishId: string
        quantity: number
        notes: string | null
    }[]
    packs?: OrderPackLine[]
}

export interface OrderPackLine {
    packId: string
    dishIds: string[]
    quantity: number
    notes?: string | null
}

export class OrderService {
    constructor(
        private readonly orderRepository: OrderRepository,
        private readonly dishRepository: DishRepository,
        private readonly tableRepository?: TableRepository,
        private readonly packRepository?: PackRepository
    ) {}

    async create(request: CreateOrderRequest): Promise<Order> {
        if (!request.restaurantId || request.restaurantId.trim() === '') {
            throw new RestaurantIdRequiredError()
        }

        this.validateTableId(request.tableId)
        await this.assertTableOccupied(request.restaurantId, request.tableId)
        const hasPacks = request.packs !== undefined && request.packs !== null
        const requestItems = hasPacks && (request.items === undefined || request.items === null) ? [] : request.items
        this.validateItems(requestItems, hasPacks ? request.packs : undefined)
        await this.assertDishesOrderable(request.restaurantId, requestItems)
        const packItems = await this.expandPacks(request.restaurantId, request.packs ?? [])

        const items: OrderItem[] = []
        for (const item of requestItems) {
            for (let i = 0; i < item.quantity; i++) {
                items.push({
                    id: randomUUID(),
                    dishId: item.dishId,
                    quantity: 1,
                    notes: item.notes,
                    status: 'pendiente'
                })
            }
        }
        items.push(...packItems)

        const order: Order = {
            id: randomUUID(),
            restaurantId: request.restaurantId,
            tableId: request.tableId,
            clientId: request.clientId,
            createdAt: new Date(),
            items
        }

        await this.orderRepository.create(order)

        return order
    }

    async listActive(restaurantId: string): Promise<Order[]> {
        return this.orderRepository.findActiveByRestaurant(restaurantId)
    }

    async getById(orderId: string, actor: OrderActor): Promise<Order> {
        const order = await this.orderRepository.findById(orderId)
        if (!order) {
            throw new OrderNotFoundError()
        }

        const isOwner = order.clientId !== null && order.clientId === actor.id
        if (!isOwner && !this.canManageRestaurant(actor, order.restaurantId)) {
            throw new OrderNotFoundError()
        }
        return order
    }

    async getByClientId(clientId: string): Promise<Order[]> {
        return this.orderRepository.findByClientId(clientId)
    }

    async updateItemStatus(orderId: string, itemId: string, status: string, actor: OrderActor): Promise<void> {
        const order = await this.orderRepository.findById(orderId)
        if (!order || !this.canManageRestaurant(actor, order.restaurantId)) {
            throw new OrderNotFoundError()
        }

        const item = order.items.find(i => i.id === itemId)
        if (!item) {
            throw new OrderNotFoundError() // Or ItemNotFoundError
        }

        const normalizedStatus = normalizeOrderStatus(status)
        assertTransitionAllowed(actor.role, item, normalizedStatus)
        item.status = normalizedStatus

        await this.orderRepository.updateItemStatus(orderId, itemId, normalizedStatus)
    }

    private canManageRestaurant(actor: OrderActor, restaurantId: string): boolean {
        if (actor.role === 'admin') return true
        return EMPLOYEE_ROLES.includes(actor.role) && actor.restaurantId === restaurantId
    }

    private validateTableId(tableId: unknown): void {
        if (tableId === null || tableId === undefined) return
        if (typeof tableId !== 'string' || tableId.length > MAX_TABLE_ID_LENGTH) {
            throw new InvalidOrderError(`tableId must be a string of at most ${MAX_TABLE_ID_LENGTH} characters`)
        }
    }

    private async assertTableOccupied(restaurantId: string, tableId: string | null): Promise<void> {
        if (tableId === null || tableId === undefined || !this.tableRepository) return
        const table = await this.tableRepository.findById(tableId)
        if (!table || table.restaurantId !== restaurantId || table.status !== 'ocupada') {
            throw new InvalidOrderError('Table is not occupied in this restaurant')
        }
    }

    // Sin packs se mantiene la validación original (items obligatorio); con packs, items puede ir vacío.
    private validateItems(items: unknown, packs?: unknown): void {
        if (packs === undefined) {
            if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINES) {
                throw new InvalidOrderError(`items must be an array with 1 to ${MAX_LINES} lines`)
            }
        } else {
            if (!this.packRepository) {
                throw new InvalidOrderError('Packs are not supported')
            }
            if (!Array.isArray(packs)) {
                throw new InvalidOrderError('packs must be an array')
            }
            if (!Array.isArray(items)) {
                throw new InvalidOrderError('items must be an array')
            }
            if (items.length + packs.length === 0 || items.length + packs.length > MAX_LINES) {
                throw new InvalidOrderError(`An order must have 1 to ${MAX_LINES} lines`)
            }
        }

        let totalUnits = 0
        for (const item of items as any[]) {
            if (!item || typeof item.dishId !== 'string' || item.dishId.trim() === '') {
                throw new InvalidOrderError('Every item needs a dishId')
            }
            this.validateQuantityAndNotes(item)
            totalUnits += item.quantity
        }

        for (const line of (packs ?? []) as any[]) {
            if (!line || typeof line.packId !== 'string' || line.packId.trim() === '') {
                throw new InvalidOrderError('Every pack line needs a packId')
            }
            if (!Array.isArray(line.dishIds) || line.dishIds.length === 0 || line.dishIds.length > MAX_DISHES_PER_PACK
                || line.dishIds.some((id: unknown) => typeof id !== 'string')) {
                throw new InvalidOrderError(`dishIds must be an array of 1 to ${MAX_DISHES_PER_PACK} dish ids`)
            }
            this.validateQuantityAndNotes(line)
            totalUnits += line.quantity * line.dishIds.length
        }

        if (totalUnits > MAX_UNITS_PER_ORDER) {
            throw new InvalidOrderError(`An order cannot exceed ${MAX_UNITS_PER_ORDER} units`)
        }
    }

    // Cada unidad de pack se convierte en un ítem por plato elegido. El precio del pack va entero
    // en el primer ítem y 0 en el resto, así la suma de dishPrice del pedido (la cuenta) es correcta.
    private async expandPacks(restaurantId: string, lines: OrderPackLine[]): Promise<OrderItem[]> {
        const items: OrderItem[] = []
        for (const line of lines) {
            const pack = await this.packRepository!.findById(line.packId)
            if (!pack || pack.restaurantId !== restaurantId || !pack.available) {
                throw new InvalidOrderError(`Pack ${line.packId} is not available in this restaurant`)
            }

            const dishes: Dish[] = []
            for (const dishId of new Set(line.dishIds)) {
                const dish = await this.dishRepository.findById(dishId)
                if (dish) dishes.push(dish)
            }
            const selection = resolvePackSelection(pack, line.dishIds, dishes)

            for (let unit = 0; unit < line.quantity; unit++) {
                const packInstanceId = randomUUID()
                selection.forEach((dish, index) => items.push({
                    id: randomUUID(),
                    dishId: dish.id,
                    quantity: 1,
                    notes: line.notes ?? null,
                    status: 'pendiente',
                    dishPrice: index === 0 ? pack.price : 0,
                    packId: pack.id,
                    packName: pack.name,
                    packInstanceId
                }))
            }
        }
        return items
    }

    private validateQuantityAndNotes(line: { quantity: unknown; notes?: unknown }): void {
        if (!Number.isInteger(line.quantity) || (line.quantity as number) < 1 || (line.quantity as number) > MAX_QUANTITY_PER_LINE) {
            throw new InvalidOrderError(`quantity must be an integer between 1 and ${MAX_QUANTITY_PER_LINE}`)
        }
        if (line.notes !== null && line.notes !== undefined
            && (typeof line.notes !== 'string' || line.notes.length > MAX_NOTES_LENGTH)) {
            throw new InvalidOrderError(`notes must be a string of at most ${MAX_NOTES_LENGTH} characters`)
        }
    }

    private async assertDishesOrderable(restaurantId: string, items: CreateOrderRequest['items']): Promise<void> {
        const dishIds = new Set(items.map(item => item.dishId))
        for (const dishId of dishIds) {
            const dish = await this.dishRepository.findById(dishId)
            if (!dish || dish.restaurantId !== restaurantId || !dish.available) {
                throw new InvalidOrderError(`Dish ${dishId} is not available in this restaurant`)
            }
        }
    }
}
