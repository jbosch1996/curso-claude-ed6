import { Database } from '@config/database.js'

export interface ClientPointsRepository {
    getBalance(clientId: string, restaurantId: string): Promise<number>
    add(clientId: string, restaurantId: string, points: number): Promise<void>
    tryDeduct(clientId: string, restaurantId: string, points: number): Promise<boolean>
}

export class SqliteClientPointsRepository implements ClientPointsRepository {
    constructor(private readonly db: Database) {}

    async getBalance(clientId: string, restaurantId: string): Promise<number> {
        const row = await this.db.get<{ balance: number }>(
            'SELECT balance FROM client_points WHERE client_id = ? AND restaurant_id = ?',
            [clientId, restaurantId]
        )
        return row?.balance ?? 0
    }

    async add(clientId: string, restaurantId: string, points: number): Promise<void> {
        await this.db.run(
            `INSERT INTO client_points (client_id, restaurant_id, balance) VALUES (?, ?, ?)
             ON CONFLICT(client_id, restaurant_id) DO UPDATE SET balance = balance + excluded.balance`,
            [clientId, restaurantId, points]
        )
    }

    // Una sola sentencia condicional: atómica aunque la conexión SQLite sea compartida.
    async tryDeduct(clientId: string, restaurantId: string, points: number): Promise<boolean> {
        const result = await this.db.run(
            'UPDATE client_points SET balance = balance - ? WHERE client_id = ? AND restaurant_id = ? AND balance >= ?',
            [points, clientId, restaurantId, points]
        )
        return result.changes > 0
    }
}
