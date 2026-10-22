import { randomUUID } from 'crypto'
import type { Table } from '@models/table.model.js'
import { normalizeTableStatus, validateTableFields, assertValidGuests } from '@models/table.model.js'
import type { TableRepository } from '@repositories/table.repository.js'
import { TableNotFoundError, DuplicatedTableNumberError, TableNotAvailableError, TableOccupiedError } from '@errors/DomainErrors.js'

export interface TableInput {
    number: unknown
    capacity: unknown
    description?: unknown
    status?: unknown
}

export class TableService {
    constructor(private readonly repository: TableRepository) {}

    async create(restaurantId: string, input: TableInput): Promise<Table> {
        const fields = validateTableFields(input)
        const status = input.status === undefined ? 'libre' : normalizeTableStatus(input.status)
        await this.assertNumberAvailable(restaurantId, fields.number)

        const now = new Date().toISOString()
        const table: Table = { id: randomUUID(), restaurantId, ...fields, status, createdAt: now, updatedAt: now }
        await this.repository.save(table)
        return table
    }

    async findById(restaurantId: string, id: string): Promise<Table | null> {
        const table = await this.repository.findById(id)
        return table && table.restaurantId === restaurantId ? table : null
    }

    async list(restaurantId: string): Promise<Table[]> {
        return this.repository.findByRestaurantId(restaurantId)
    }

    async update(restaurantId: string, id: string, input: TableInput): Promise<Table> {
        const existing = await this.getOrThrow(restaurantId, id)
        const fields = validateTableFields(input)
        const status = input.status === undefined ? existing.status : normalizeTableStatus(input.status)
        await this.assertNumberAvailable(restaurantId, fields.number, id)

        const updated: Table = { ...existing, ...fields, status, updatedAt: new Date().toISOString() }
        await this.repository.save(updated)
        return updated
    }

    async updateStatus(restaurantId: string, id: string, status: unknown): Promise<Table> {
        const existing = await this.getOrThrow(restaurantId, id)
        const updated: Table = { ...existing, status: normalizeTableStatus(status), updatedAt: new Date().toISOString() }
        await this.repository.save(updated)
        return updated
    }

    async delete(restaurantId: string, id: string): Promise<void> {
        const existing = await this.getOrThrow(restaurantId, id)
        if (existing.status === 'ocupada') throw new TableOccupiedError()
        await this.repository.delete(id)
    }

    async listAvailable(restaurantId: string, guests: unknown): Promise<Table[]> {
        assertValidGuests(guests)
        return this.repository.findAvailable(restaurantId, guests as number)
    }

    async occupy(restaurantId: string, id: string, guests: unknown): Promise<Table> {
        assertValidGuests(guests)
        const occupied = await this.repository.occupyIfAvailable(id, restaurantId, guests as number, new Date().toISOString())
        const table = occupied ? await this.repository.findById(id) : null
        // Mismo error si no existe, es de otro restaurante, está ocupada o es pequeña: no filtra información.
        if (!table) throw new TableNotAvailableError()
        return table
    }

    private async getOrThrow(restaurantId: string, id: string): Promise<Table> {
        const table = await this.findById(restaurantId, id)
        if (!table) throw new TableNotFoundError()
        return table
    }

    private async assertNumberAvailable(restaurantId: string, number: number, ownId?: string): Promise<void> {
        const tables = await this.repository.findByRestaurantId(restaurantId)
        if (tables.some(t => t.number === number && t.id !== ownId)) throw new DuplicatedTableNumberError()
    }
}
