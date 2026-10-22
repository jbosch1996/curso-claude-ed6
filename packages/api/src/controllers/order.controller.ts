import type { Request, Response } from 'express'
import type { OrderService, OrderActor } from '@services/order.service.js'
import type { AuthUser } from '@shared/infrastructure/http/middlewares.js'
import { AppError } from '@errors/AppError.js'

const STATUS_BY_ERROR: Record<string, number> = {
    OrderNotFoundError: 404,
    InvalidOrderStatusError: 400,
    InvalidOrderError: 400,
    ForbiddenTransitionError: 403
}

export class OrderController {
    constructor(private readonly orderService: OrderService) {}

    async createOrder(req: Request, res: Response): Promise<void> {
        try {
            const { restaurantId, tableId, items } = req.body
            const user = (req as any).user
            const clientId = user?.id ?? null
            const order = await this.orderService.create({
                restaurantId,
                tableId: tableId ?? null,
                clientId,
                items
            })
            res.status(201).json(order)
        } catch (error) {
            this.handleError(res, error)
        }
    }

    async getActiveOrders(req: Request, res: Response): Promise<void> {
        try {
            const actor = this.getActor(req)
            let restaurantId: string | null | undefined

            if (actor.role === 'admin') {
                const queryRestaurantId = req.query.restaurantId
                restaurantId = typeof queryRestaurantId === 'string' ? queryRestaurantId : undefined
            } else {
                restaurantId = actor.restaurantId
            }

            if (!restaurantId) {
                res.status(400).json({ error: 'restaurantId is required' })
                return
            }

            const orders = await this.orderService.listActive(restaurantId)
            res.status(200).json(orders)
        } catch (error) {
            this.handleError(res, error)
        }
    }

    async getMyOrders(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user
            if (!user?.id) {
                res.status(401).json({ error: 'Unauthorized' })
                return
            }
            const orders = await this.orderService.getByClientId(user.id)
            res.status(200).json(orders)
        } catch (error) {
            this.handleError(res, error)
        }
    }

    async getById(req: Request, res: Response): Promise<void> {
        try {
            const order = await this.orderService.getById(req.params.id as string, this.getActor(req))
            res.status(200).json(order)
        } catch (error) {
            this.handleError(res, error)
        }
    }

    async updateItemStatus(req: Request, res: Response): Promise<void> {
        try {
            const orderId = req.params.orderId as string
            const itemId = req.params.itemId as string
            const { status } = req.body ?? {}

            if (typeof status !== 'string') {
                res.status(400).json({ error: 'status is required' })
                return
            }

            await this.orderService.updateItemStatus(orderId, itemId, status, this.getActor(req))
            res.status(204).send()
        } catch (error) {
            this.handleError(res, error)
        }
    }

    private getActor(req: Request): OrderActor {
        const user = (req as any).user as AuthUser | undefined
        return {
            id: user?.id ?? '',
            role: user?.role ?? '',
            restaurantId: user?.restaurantId ?? null
        }
    }

    private handleError(res: Response, error: unknown): void {
        if (error instanceof AppError) {
            res.status(STATUS_BY_ERROR[error.name] ?? 400).json({ error: error.message })
            return
        }
        res.status(500).json({ error: 'Internal Server Error' })
    }
}
