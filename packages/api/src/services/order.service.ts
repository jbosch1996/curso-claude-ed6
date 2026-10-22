import { randomUUID } from 'crypto'
import type { Order, OrderItem } from '@models/order.model.js'
import { normalizeOrderStatus, assertTransitionAllowed } from '@models/order.model.js'
import type { OrderRepository } from '@repositories/order.repository.js'
import type { DishRepository } from '@repositories/dish.repository.js'
import { RestaurantIdRequiredError, OrderNotFoundError, InvalidOrderError } from '@errors/DomainErrors.js'

const MAX_LINES = 50
const MAX_QUANTITY_PER_LINE = 20
const MAX_UNITS_PER_ORDER = 100
const MAX_NOTES_LENGTH = 200
const MAX_TABLE_ID_LENGTH = 50
const EMPLOYEE_ROLES = ['manager', 'camarero', 'cocinero']

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
}

export class OrderService {
    constructor(
        private readonly orderRepository: OrderRepository,
        private readonly dishRepository: DishRepository
    ) {}

    async create(request: CreateOrderRequest): Promise<Order> {
        if (!request.restaurantId || request.restaurantId.trim() === '') {
            throw new RestaurantIdRequiredError()
        }

        this.validateTableId(request.tableId)
        this.validateItems(request.items)
        await this.assertDishesOrderable(request.restaurantId, request.items)

        const items: OrderItem[] = []
        for (const item of request.items) {
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

    private validateItems(items: unknown): void {
        if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINES) {
            throw new InvalidOrderError(`items must be an array with 1 to ${MAX_LINES} lines`)
        }

        let totalUnits = 0
        for (const item of items) {
            if (!item || typeof item.dishId !== 'string' || item.dishId.trim() === '') {
                throw new InvalidOrderError('Every item needs a dishId')
            }
            if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY_PER_LINE) {
                throw new InvalidOrderError(`quantity must be an integer between 1 and ${MAX_QUANTITY_PER_LINE}`)
            }
            if (item.notes !== null && item.notes !== undefined
                && (typeof item.notes !== 'string' || item.notes.length > MAX_NOTES_LENGTH)) {
                throw new InvalidOrderError(`notes must be a string of at most ${MAX_NOTES_LENGTH} characters`)
            }
            totalUnits += item.quantity
        }

        if (totalUnits > MAX_UNITS_PER_ORDER) {
            throw new InvalidOrderError(`An order cannot exceed ${MAX_UNITS_PER_ORDER} units`)
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
