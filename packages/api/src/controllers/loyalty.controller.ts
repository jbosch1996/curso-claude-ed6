import type { Request, Response, NextFunction } from 'express'
import type { LoyaltyService } from '@services/loyalty.service.js'
import type { AuthUser } from '@shared/infrastructure/http/middlewares.js'

export class LoyaltyController {
    constructor(private readonly service: LoyaltyService) {}

    getSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const user = (req as any).user as AuthUser
            res.status(200).json(await this.service.getSummary(user.id, req.params.restaurantId as string))
        } catch (error) {
            next(error)
        }
    }
}
