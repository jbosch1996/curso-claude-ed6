import type { PackRepository } from '@repositories/pack.repository.js'
import type { Pack } from '@models/pack.model.js'

export class MockPackRepository implements PackRepository {
    private packs: Map<string, Pack> = new Map()

    async findById(id: string): Promise<Pack | null> {
        return this.packs.get(id) ?? null
    }

    async findByRestaurantId(restaurantId: string): Promise<Pack[]> {
        return Array.from(this.packs.values())
            .filter(p => p.restaurantId === restaurantId)
            .sort((a, b) => a.name.localeCompare(b.name))
    }

    async save(pack: Pack): Promise<void> {
        this.packs.set(pack.id, pack)
    }

    async delete(id: string): Promise<void> {
        this.packs.delete(id)
    }
}
