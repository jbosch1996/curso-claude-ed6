import type { Request, Response, NextFunction } from 'express'
import type { PointsRuleService } from '@services/points-rule.service.js'

export class PointsRuleController {
    constructor(private readonly service: PointsRuleService) {}

    create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const rule = await this.service.create({ ...this.fields(req), restaurantId: req.params.restaurantId as string })
            res.status(201).json(rule)
        } catch (error) {
            next(error)
        }
    }

    getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            res.status(200).json(await this.service.findByRestaurantId(req.params.restaurantId as string))
        } catch (error) {
            next(error)
        }
    }

    update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const rule = await this.service.update(req.params.restaurantId as string, req.params.id as string, this.fields(req))
            res.status(200).json(rule)
        } catch (error) {
            next(error)
        }
    }

    delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.service.delete(req.params.restaurantId as string, req.params.id as string)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }

    private fields(req: Request) {
        const body = req.body ?? {}
        return { points: body.points, discount: body.discount }
    }
}
