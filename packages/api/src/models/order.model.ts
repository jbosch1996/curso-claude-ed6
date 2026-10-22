import { InvalidOrderStatusError, ForbiddenTransitionError } from '@errors/DomainErrors.js'

const VALID_ORDER_STATUSES = ['pendiente', 'preparando', 'listo', 'entregado'] as const

export type OrderStatusType = typeof VALID_ORDER_STATUSES[number]

export interface OrderItem {
    id: string
    dishId: string
    quantity: number
    notes: string | null
    status: OrderStatusType
    dishName?: string
    dishPrice?: number
    dishCategory?: string
    packId?: string
    packName?: string
    packInstanceId?: string
}

export interface Order {
    id: string
    restaurantId: string
    tableId: string | null
    clientId: string | null
    createdAt: Date
    items: OrderItem[]
    restaurantName?: string
    restaurantLogoUrl?: string | null
}

export function normalizeOrderStatus(value: string): OrderStatusType {
    const normalized = value.toLowerCase().trim()
    if (!VALID_ORDER_STATUSES.includes(normalized as OrderStatusType)) {
        throw new InvalidOrderStatusError(`Estado inválido: ${value}. Debe ser uno de: ${VALID_ORDER_STATUSES.join(', ')}`)
    }
    return normalized as OrderStatusType
}

export function isOrderFullyDelivered(order: Order): boolean {
    return order.items.length > 0 && order.items.every(item => item.status === 'entregado')
}

const STATUS_ORDER: readonly OrderStatusType[] = VALID_ORDER_STATUSES

export function assertTransitionAllowed(role: string, item: OrderItem, next: OrderStatusType): void {
    const current = item.status
    const isDrink = item.dishCategory?.toLowerCase() === 'bebida'
    const isForward = STATUS_ORDER.indexOf(next) > STATUS_ORDER.indexOf(current)

    let allowed = false
    if (role === 'manager' || role === 'admin') {
        allowed = isForward
    } else if (role === 'cocinero') {
        allowed = (current === 'pendiente' && next === 'preparando')
            || (current === 'preparando' && next === 'listo')
    } else if (role === 'camarero') {
        allowed = (current === 'pendiente' && next === 'listo' && isDrink)
            || (current === 'listo' && next === 'entregado')
    }

    if (!allowed) {
        throw new ForbiddenTransitionError(`Role ${role} cannot move an item from ${current} to ${next}`)
    }
}
