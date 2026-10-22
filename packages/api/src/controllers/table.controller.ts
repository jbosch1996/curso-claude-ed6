import type { Request, Response, NextFunction } from 'express'
import type { TableService } from '@services/table.service.js'
import type { Table } from '@models/table.model.js'
import { TableNotFoundError } from '@errors/DomainErrors.js'

export class TableController {
    constructor(private readonly tableService: TableService) {}

    create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.create(req.params.restaurantId as string, this.fields(req))
            res.status(201).json(table)
        } catch (error) {
            next(error)
        }
    }

    getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            res.status(200).json(await this.tableService.list(req.params.restaurantId as string))
        } catch (error) {
            next(error)
        }
    }

    getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.findById(req.params.restaurantId as string, req.params.id as string)
            if (!table) throw new TableNotFoundError()
            res.status(200).json(table)
        } catch (error) {
            next(error)
        }
    }

    update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.update(req.params.restaurantId as string, req.params.id as string, this.fields(req))
            res.status(200).json(table)
        } catch (error) {
            next(error)
        }
    }

    updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.updateStatus(req.params.restaurantId as string, req.params.id as string, req.body?.status)
            res.status(200).json(table)
        } catch (error) {
            next(error)
        }
    }

    delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.tableService.delete(req.params.restaurantId as string, req.params.id as string)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }

    getAvailable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const raw = req.query.guests
            // Number('') es 0 y Number(undefined) es NaN: ambos los rechaza assertValidGuests.
            const guests = typeof raw === 'string' ? Number(raw) : NaN
            const tables = await this.tableService.listAvailable(req.params.restaurantId as string, guests)
            res.status(200).json(tables.map(t => this.toClientJSON(t)))
        } catch (error) {
            next(error)
        }
    }

    occupy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.occupy(req.params.restaurantId as string, req.params.id as string, req.body?.guests)
            res.status(200).json(this.toClientJSON(table))
        } catch (error) {
            next(error)
        }
    }

    private fields(req: Request) {
        const body = req.body ?? {}
        return { number: body.number, capacity: body.capacity, description: body.description, status: body.status }
    }

    // El cliente no necesita ni debe ver el estado ni las fechas internas de la mesa.
    private toClientJSON(table: Table) {
        return { id: table.id, number: table.number, description: table.description, capacity: table.capacity }
    }
}
