import { Database } from '@config/database.js'
import type { Pack } from '@models/pack.model.js'
import { normalizeDishCategory } from '@models/dish.model.js'

interface PackRow {
    id: string
    restaurantId: string
    name: string
    description: string | null
    price: number
    available: number
    createdAt: string
    updatedAt: string
}

const SELECT = 'SELECT id, restaurant_id as restaurantId, name, description, price, available, created_at as createdAt, updated_at as updatedAt FROM packs'

export interface PackRepository {
    findById(id: string): Promise<Pack | null>
    findByRestaurantId(restaurantId: string): Promise<Pack[]>
    save(pack: Pack): Promise<void>
    delete(id: string): Promise<void>
}

export class SqlitePackRepository implements PackRepository {
    constructor(private readonly db: Database) {}

    async findById(id: string): Promise<Pack | null> {
        const row = await this.db.get<PackRow>(`${SELECT} WHERE id = ?`, [id])
        return row ? this.map(row) : null
    }

    async findByRestaurantId(restaurantId: string): Promise<Pack[]> {
        const rows = await this.db.all<PackRow>(`${SELECT} WHERE restaurant_id = ? ORDER BY name ASC`, [restaurantId])
        const packs: Pack[] = []
        for (const row of rows) {
            packs.push(await this.map(row))
        }
        return packs
    }

    async save(pack: Pack): Promise<void> {
        const existing = await this.db.get<{ id: string }>('SELECT id FROM packs WHERE id = ?', [pack.id])
        if (existing) {
            await this.db.run(
                'UPDATE packs SET name = ?, description = ?, price = ?, available = ?, updated_at = ? WHERE id = ?',
                [pack.name, pack.description, pack.price, pack.available ? 1 : 0, pack.updatedAt, pack.id]
            )
        } else {
            await this.db.run(
                'INSERT INTO packs (id, restaurant_id, name, description, price, available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [pack.id, pack.restaurantId, pack.name, pack.description, pack.price, pack.available ? 1 : 0, pack.createdAt, pack.updatedAt]
            )
        }

        await this.db.run('DELETE FROM pack_categories WHERE pack_id = ?', [pack.id])
        for (const [position, category] of pack.categories.entries()) {
            await this.db.run('INSERT INTO pack_categories (pack_id, category, position) VALUES (?, ?, ?)', [pack.id, category, position])
        }

        await this.db.run('DELETE FROM pack_excluded_dishes WHERE pack_id = ?', [pack.id])
        for (const dishId of pack.excludedDishIds) {
            await this.db.run('INSERT INTO pack_excluded_dishes (pack_id, dish_id) VALUES (?, ?)', [pack.id, dishId])
        }
    }

    async delete(id: string): Promise<void> {
        // Categorías y excluidos se borran por ON DELETE CASCADE.
        await this.db.run('DELETE FROM packs WHERE id = ?', [id])
    }

    private async map(row: PackRow): Promise<Pack> {
        const categories = await this.db.all<{ category: string }>(
            'SELECT category FROM pack_categories WHERE pack_id = ? ORDER BY position ASC', [row.id]
        )
        const excluded = await this.db.all<{ dishId: string }>(
            'SELECT dish_id as dishId FROM pack_excluded_dishes WHERE pack_id = ? ORDER BY rowid ASC', [row.id]
        )
        return {
            ...row,
            available: row.available === 1,
            categories: categories.map(c => normalizeDishCategory(c.category)),
            excludedDishIds: excluded.map(e => e.dishId)
        }
    }
}
