import type { Database } from '@config/database.js'

/**
 * Vacía todas las tablas de la base de datos (el esquema no se toca) y devuelve las filas
 * eliminadas por tabla. Las tablas se leen de `sqlite_master`, sin lista fija, para que cualquier
 * tabla futura quede cubierta. Las claves foráneas se desactivan solo mientras se borra (así no
 * hay que mantener un orden de borrado) y se vuelven a activar al terminar.
 *
 * Pensado para scripts que usan su propia conexión: `PRAGMA foreign_keys` es por conexión.
 */
export async function resetDatabase(db: Database): Promise<Record<string, number>> {
    const tables = await db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    const deleted: Record<string, number> = {}

    await db.run('PRAGMA foreign_keys = OFF')
    try {
        for (const { name } of tables) {
            // El nombre sale de la propia base de datos; se entrecomilla por si contiene caracteres especiales.
            const quoted = `"${name.replace(/"/g, '""')}"`
            const result = await db.run(`DELETE FROM ${quoted}`)
            deleted[name] = result.changes
        }
    } finally {
        await db.run('PRAGMA foreign_keys = ON')
    }

    return deleted
}
