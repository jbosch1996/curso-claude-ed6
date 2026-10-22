import type { ClientPointsRepository } from '@repositories/client-points.repository.js'

export class MockClientPointsRepository implements ClientPointsRepository {
    private balances: Map<string, number> = new Map()

    private key(clientId: string, restaurantId: string): string {
        return `${clientId}:${restaurantId}`
    }

    async getBalance(clientId: string, restaurantId: string): Promise<number> {
        return this.balances.get(this.key(clientId, restaurantId)) ?? 0
    }

    async add(clientId: string, restaurantId: string, points: number): Promise<void> {
        const key = this.key(clientId, restaurantId)
        this.balances.set(key, (this.balances.get(key) ?? 0) + points)
    }

    async tryDeduct(clientId: string, restaurantId: string, points: number): Promise<boolean> {
        const key = this.key(clientId, restaurantId)
        const balance = this.balances.get(key) ?? 0
        if (balance < points) return false
        this.balances.set(key, balance - points)
        return true
    }
}
