import type { TableRepository } from '@repositories/table.repository.js'
import type { Table } from '@models/table.model.js'

export class MockTableRepository implements TableRepository {
    private tables: Map<string, Table> = new Map()

    async findById(id: string): Promise<Table | null> {
        return this.tables.get(id) ?? null
    }

    async findByRestaurantId(restaurantId: string): Promise<Table[]> {
        return Array.from(this.tables.values())
            .filter(t => t.restaurantId === restaurantId)
            .sort((a, b) => a.number - b.number)
    }

    async findAvailable(restaurantId: string, guests: number): Promise<Table[]> {
        return Array.from(this.tables.values())
            .filter(t => t.restaurantId === restaurantId && t.status === 'libre' && t.capacity >= guests)
            .sort((a, b) => a.capacity - b.capacity || a.number - b.number)
    }

    async occupyIfAvailable(id: string, restaurantId: string, guests: number, now: string): Promise<boolean> {
        const table = this.tables.get(id)
        if (!table || table.restaurantId !== restaurantId || table.status !== 'libre' || table.capacity < guests) {
            return false
        }
        this.tables.set(id, { ...table, status: 'ocupada', updatedAt: now })
        return true
    }

    async save(table: Table): Promise<void> {
        this.tables.set(table.id, table)
    }

    async delete(id: string): Promise<void> {
        this.tables.delete(id)
    }
}
