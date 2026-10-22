import { Database } from '@config/database.js'
import type { Table } from '@models/table.model.js'
import { normalizeTableStatus } from '@models/table.model.js'

interface TableRow {
    id: string
    restaurantId: string
    number: number
    description: string | null
    capacity: number
    status: string
    createdAt: string
    updatedAt: string
}

const SELECT = 'SELECT id, restaurant_id as restaurantId, number, description, capacity, status, created_at as createdAt, updated_at as updatedAt FROM restaurant_tables'

export interface TableRepository {
    findById(id: string): Promise<Table | null>
    findByRestaurantId(restaurantId: string): Promise<Table[]>
    findAvailable(restaurantId: string, guests: number): Promise<Table[]>
    occupyIfAvailable(id: string, restaurantId: string, guests: number, now: string): Promise<boolean>
    save(table: Table): Promise<void>
    delete(id: string): Promise<void>
}

export class SqliteTableRepository implements TableRepository {
    constructor(private readonly db: Database) {}

    async findById(id: string): Promise<Table | null> {
        const row = await this.db.get<TableRow>(`${SELECT} WHERE id = ?`, [id])
        return row ? this.map(row) : null
    }

    async findByRestaurantId(restaurantId: string): Promise<Table[]> {
        const rows = await this.db.all<TableRow>(`${SELECT} WHERE restaurant_id = ? ORDER BY number ASC`, [restaurantId])
        return rows.map(row => this.map(row))
    }

    async findAvailable(restaurantId: string, guests: number): Promise<Table[]> {
        const rows = await this.db.all<TableRow>(
            `${SELECT} WHERE restaurant_id = ? AND status = 'libre' AND capacity >= ? ORDER BY capacity ASC, number ASC`,
            [restaurantId, guests]
        )
        return rows.map(row => this.map(row))
    }

    // Una sola sentencia condicional: atómica aunque la conexión SQLite sea compartida,
    // así dos clientes que piden la misma mesa a la vez no pueden ocuparla ambos.
    async occupyIfAvailable(id: string, restaurantId: string, guests: number, now: string): Promise<boolean> {
        const result = await this.db.run(
            `UPDATE restaurant_tables SET status = 'ocupada', updated_at = ?
             WHERE id = ? AND restaurant_id = ? AND status = 'libre' AND capacity >= ?`,
            [now, id, restaurantId, guests]
        )
        return result.changes === 1
    }

    async save(table: Table): Promise<void> {
        const existing = await this.findById(table.id)
        if (existing) {
            await this.db.run(
                'UPDATE restaurant_tables SET number = ?, description = ?, capacity = ?, status = ?, updated_at = ? WHERE id = ?',
                [table.number, table.description, table.capacity, table.status, table.updatedAt, table.id]
            )
        } else {
            await this.db.run(
                'INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [table.id, table.restaurantId, table.number, table.description, table.capacity, table.status, table.createdAt, table.updatedAt]
            )
        }
    }

    async delete(id: string): Promise<void> {
        await this.db.run('DELETE FROM restaurant_tables WHERE id = ?', [id])
    }

    private map(row: TableRow): Table {
        return { ...row, status: normalizeTableStatus(row.status) }
    }
}
