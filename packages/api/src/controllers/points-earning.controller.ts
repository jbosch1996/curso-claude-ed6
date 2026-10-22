import type { Request, Response, NextFunction } from 'express'
import type { PointsEarningService } from '@services/points-earning.service.js'

export class PointsEarningController {
    constructor(private readonly service: PointsEarningService) {}

    get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            res.status(200).json(await this.service.get(req.params.restaurantId as string))
        } catch (error) {
            next(error)
        }
    }

    update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const body = req.body ?? {}
            const rate = await this.service.update(req.params.restaurantId as string, { amount: body.amount, points: body.points })
            res.status(200).json(rate)
        } catch (error) {
            next(error)
        }
    }
}
