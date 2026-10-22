import type { Request, Response, NextFunction } from 'express'
import type { PackService } from '@services/pack.service.js'

export class PackController {
    constructor(private readonly service: PackService) {}

    create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            res.status(201).json(await this.service.create(req.params.restaurantId as string, this.fields(req)))
        } catch (error) {
            next(error)
        }
    }

    getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            res.status(200).json(await this.service.list(req.params.restaurantId as string))
        } catch (error) {
            next(error)
        }
    }

    getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            res.status(200).json(await this.service.findById(req.params.restaurantId as string, req.params.id as string))
        } catch (error) {
            next(error)
        }
    }

    update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const pack = await this.service.update(req.params.restaurantId as string, req.params.id as string, this.fields(req))
            res.status(200).json(pack)
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

    getPublic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            res.status(200).json(await this.service.listPublic(req.params.restaurantId as string))
        } catch (error) {
            next(error)
        }
    }

    private fields(req: Request) {
        const body = req.body ?? {}
        return {
            name: body.name,
            description: body.description,
            price: body.price,
            available: body.available,
            categories: body.categories,
            excludedDishIds: body.excludedDishIds
        }
    }
}
