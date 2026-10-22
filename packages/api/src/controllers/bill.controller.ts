import type { Request, Response, NextFunction } from 'express'
import type { BillService } from '@services/bill.service.js'
import type { OrderActor } from '@services/order.service.js'
import type { AuthUser } from '@shared/infrastructure/http/middlewares.js'

export class BillController {
    constructor(private readonly service: BillService) {}

    create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { discountCode, pointsRuleId } = req.body ?? {}
            const bill = await this.service.create(req.params.orderId as string, this.getActor(req), { discountCode, pointsRuleId })
            res.status(201).json(bill)
        } catch (error) {
            next(error)
        }
    }

    getByOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            res.status(200).json(await this.service.getByOrderId(req.params.orderId as string, this.getActor(req)))
        } catch (error) {
            next(error)
        }
    }

    private getActor(req: Request): OrderActor {
        const user = (req as any).user as AuthUser | undefined
        return { id: user?.id ?? '', role: user?.role ?? '', restaurantId: user?.restaurantId ?? null }
    }
}
