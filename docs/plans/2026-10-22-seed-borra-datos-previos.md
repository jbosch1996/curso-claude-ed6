<!-- plan-feature -->
# Plan: Que `npm run seed` borre primero los datos previos y luego rellene la base de datos

- **Tipo:** bugfix
- **Fecha:** 2026-10-22
- **Estado:** Implementado (T1-T9) en la rama `feature/seed-borra-datos-previos`

**Desviaciones de la implementación:**

- **T2/T3:** la protección y `seedDatabase` se probaron en un único `seed.test.ts`, escrito entero antes del código (rojo: las funciones no existían).
- **T4:** como `seedDatabase` vacía siempre primero, las comprobaciones `findByEmail` del código original ya nunca se cumplen; se dejaron tal cual para no cambiar el cuerpo del seed (los datos sembrados son los mismos).
- **T6:** el guard de producción no llega a ejecutarse si falta `JWT_SECRET`: `env.ts` (que importa el servicio de bcrypt) lanza "JWT_SECRET es obligatorio en producción" al cargar el módulo. En ambos casos el comando se niega y no borra nada; se verificó el mensaje propio con `JWT_SECRET` definido.
- **T7:** verificación con el script real sobre una copia de la BD de desarrollo (con datos duplicados): 14 platos y 16 ingredientes pasaron a 7 y 8 y la segunda ejecución dejó los mismos conteos; base nueva sin error de FK; producción se niega (BD idéntica byte a byte); la API arrancó sobre la base sembrada y el login de admin y cliente dio 200. `sqlite3` no está instalado: los conteos se leyeron con el módulo `sqlite3` de Node.

## 1. Contexto

- **Issue:** #4 — Seed no borra datos previos (https://github.com/jbosch1996/curso-claude-ed6/issues/4)

La issue (menciona `api/src/scripts/seed.py`, que en realidad es `packages/api/src/scripts/seed.ts`) dice que el script no resetea la base de datos: lo que se haya añadido o modificado a mano permanece. Debe **eliminar primero todos los datos de las tablas** y después rellenarlas como ya hace.

**Comportamiento actual (comprobado en `seed.ts`):**

1. Solo usa `INSERT OR IGNORE` y, para los empleados, `findByEmail` antes de insertar; nunca borra nada. Los datos que el usuario creó o modificó (restaurantes, platos, códigos, mesas, packs, pedidos, cuentas, saldos, clientes registrados) sobreviven.
2. Los ingredientes, platos, pedidos e ítems usan `randomUUID()` como id, así que `INSERT OR IGNORE` nunca "ignora" nada: **cada ejecución duplica** ingredientes, platos y el pedido de ejemplo (el propio `CLAUDE.md` y el `README.md` los describen como idempotentes, y no lo son).
3. Además, en una base **nueva** falla con `FOREIGN KEY constraint failed` porque inserta los empleados con `restaurantId` antes de crear los restaurantes (gotcha documentado en `CLAUDE.md`).

**Comportamiento esperado:** tras `npm run seed`, la base contiene exactamente los datos de ejemplo del script (sin duplicados, sin restos), tanto en una base ya usada como en una nueva.

## 2. Objetivo y alcance

**Incluye:**

- Vaciar **todas** las tablas de la base de datos (también las que se añadan en el futuro) antes de sembrar.
- Que `seed` funcione igual sobre una base nueva, ya usada con datos propios, o ejecutado varias veces (resultado idéntico siempre).
- Protección: negarse a ejecutarse con `NODE_ENV=production`.
- Hacer `seed.ts` testeable (extraer la lógica a funciones exportadas; el script solo se ejecuta cuando se lanza directamente) y cubrirlo con tests.
- Actualizar la documentación que lo describe como "idempotente con `INSERT OR IGNORE`" y quitar el gotcha de la base nueva.

**No incluye:**

- Cambiar los datos de ejemplo que se siembran (mismos usuarios, restaurantes, platos, códigos, puntos, mesas y pack).
- Hacer los ids del seed deterministas (no hace falta: tras vaciar, siempre se parte de cero).
- Un script de reseteo independiente, copias de seguridad o un flag `--keep`/`--force`.
- Tocar el esquema ni las migraciones de `Database.initialize()`.

## 3. Análisis del código actual

Paquete `api`, scripts (no pertenece a ningún contexto hexagonal ni a las capas). Referencias comprobadas:

- `packages/api/src/scripts/seed.ts`: función `seed()` que se ejecuta al importar el módulo (`seed()` al final) y usa el singleton `dbConfig`; imprime las credenciales al terminar.
- `packages/api/src/config/database.ts`: clase `Database` (`run`, `all`, `get`, `initialize`, `close`); el constructor usa `:memory:` si `NODE_ENV=test`, así que se puede instanciar una por test (patrón de los tests de repositorio); `PRAGMA foreign_keys = ON` en `initialize()`; 19 tablas con FK (`restaurants` es la raíz; `ON DELETE CASCADE` solo en algunas).
- `packages/api/src/contexts/employee/infrastructure/SqliteEmployeeRepository.ts` y `BcryptAuthService.ts` (10 rondas de bcrypt): se usan para crear los 9 usuarios.
- `packages/api/package.json`: `"seed": "tsx src/scripts/seed.ts"`; `package.json` raíz delega con `-w @resttek/api`.
- Documentación afectada: `CLAUDE.md` (línea 12 del comando `seed` y gotcha de la base nueva), `README.md` (líneas 43-46 y 113: "idempotente / `INSERT OR IGNORE`"), `docs/arquitectura/arquitectura-general.md` (tabla de comandos).

| Paquete / capa | Archivo | Cambio previsto |
|----------------|---------|-----------------|
| api / scripts | `packages/api/src/scripts/reset-database.ts` (nuevo) | `resetDatabase(db)`: vacía todas las tablas |
| api / scripts | `packages/api/src/scripts/seed.ts` | Extraer `seedDatabase(db)`, vaciar primero, empleados después de los restaurantes, protección de producción, ejecutar solo si se lanza directamente |
| docs | `CLAUDE.md`, `README.md`, `docs/arquitectura/arquitectura-general.md` | Describir el nuevo comportamiento |

## 4. Diseño de la solución

### Vaciado (`resetDatabase(db: Database): Promise<Record<string, number>>`)

- Lee los nombres de las tablas de `sqlite_master` (`type = 'table'` y `name NOT LIKE 'sqlite_%'`), **sin lista fija**: así cualquier tabla futura queda cubierta (la causa de que la issue duela es precisamente que el esquema crece).
- Desactiva `PRAGMA foreign_keys` mientras borra (el script usa su propia conexión, no la de la API), ejecuta `DELETE FROM <tabla>` en todas, cuenta las filas borradas por tabla y **vuelve a activar** `PRAGMA foreign_keys = ON`. Evita depender de un orden de borrado por FK que habría que mantener a mano.
- Devuelve las filas borradas por tabla para que el script lo muestre. Los nombres de tabla salen de la propia base (no de entrada del usuario); se entrecomillan al construir la sentencia.

### Protección

`assertSeedAllowed(env: string | undefined)`: si `env === 'production'` lanza un error (`Seed would delete all data; refusing to run with NODE_ENV=production`). Error de script, no `AppError`: no es de dominio HTTP.

### `seed.ts`

- `seedDatabase(db: Database)` (exportada): llama a `resetDatabase(db)` y registra el resumen, y después ejecuta el cuerpo actual sin cambiar los datos, pero usando `db` en lugar del singleton y con **restaurantes antes que empleados** (corrige el fallo en bases nuevas).
- `runSeed()`: `assertSeedAllowed(process.env.NODE_ENV)`, `dbConfig.initialize()`, `seedDatabase(dbConfig)`, imprime credenciales, `dbConfig.close()`, y `process.exit(1)` con el error si falla (igual que ahora).
- Solo se invoca cuando el fichero se ejecuta directamente (`import.meta.url === pathToFileURL(process.argv[1]).href`), para poder importar `seedDatabase` en los tests sin lanzar el script.

### Tests (Vitest, junto al código)

`reset-database.test.ts` y `seed.test.ts` con `new Database()` en memoria (`NODE_ENV=test`): vaciado de todas las tablas con FK, ids de ejemplo coherentes, **seed sobre base nueva** (hoy falla), seed sobre base con datos propios (se pierden), seed dos veces (conteos idénticos, sin duplicados) y protección de producción. bcrypt de los 9 usuarios hace que el test de seed tarde ~1 s: se fija un timeout holgado.

## 5. Lista de tareas

> Cada tarea debe poder completarse en 5-10 minutos. Las que cambian comportamiento incluyen su test (`*.test.ts` junto al código).

- [x] **T1** (10 min) — `resetDatabase(db)`: vaciar todas las tablas leídas de `sqlite_master` con las FK desactivadas durante el borrado, devolver las filas borradas por tabla y reactivar las FK; tests: vacía tablas con FK, no toca el esquema ni `sqlite_*`, deja `foreign_keys = 1`, cubre una tabla creada ad hoc · `packages/api/src/scripts/reset-database.ts` (+ `reset-database.test.ts`)
- [x] **T2** (5 min) — `assertSeedAllowed(env)` que rechaza `production`; tests con `production`, `development`, `test` y `undefined` · `packages/api/src/scripts/seed.ts` (+ `seed.test.ts`)
- [x] **T3** (10 min) — Extraer `seedDatabase(db)` (exportada) del cuerpo de `seed()` usando la conexión recibida, sin cambiar los datos, creando los restaurantes antes que los empleados; test: sembrar una base **nueva** funciona y deja 2 restaurantes, 9 empleados, platos, 1 pedido con ítems, 2 códigos, 4 equivalencias de puntos, 7 mesas y 1 pack · `packages/api/src/scripts/seed.ts` (+ `seed.test.ts`)
- [x] **T4** (10 min) — Vaciar la base al principio de `seedDatabase` y mostrar el resumen de lo eliminado; tests: los datos añadidos a mano (restaurante, empleado, plato, pedido, código, cuenta, saldo de puntos, pack, mesa) desaparecen y los conteos coinciden con los de una base nueva · `packages/api/src/scripts/seed.ts` (+ test)
- [x] **T5** (5 min) — Test de idempotencia real: sembrar dos veces deja los mismos conteos por tabla (sin ingredientes ni platos duplicados) · `packages/api/src/scripts/seed.test.ts`
- [x] **T6** (5 min) — `runSeed()` con `assertSeedAllowed`, inicialización, impresión de credenciales y cierre; ejecutar solo si el fichero se lanza directamente · `packages/api/src/scripts/seed.ts`
- [x] **T7** (10 min) — Verificación manual del script real (ver sección 6) · `packages/api/src/scripts/seed.ts`
- [x] **T8** (5 min) — Ejecutar `npm test` completo y comprobar que no hay regresiones
- [x] **T9** (10 min) — Documentar el nuevo comportamiento y retirar el gotcha de la base nueva · `CLAUDE.md`, `README.md`, `docs/arquitectura/arquitectura-general.md`

**Total: 9 tareas, 70 minutos (≈ 1 h 10 min).**

## 6. Verificación

**Tests automáticos (Vitest):** `resetDatabase` (todas las tablas, esquema intacto, FK reactivadas), protección de producción, seed sobre base nueva, sobre base con datos propios y repetido (conteos idénticos).

**Manual** (sobre una **copia** de `packages/api/resttek.db`, nunca sobre la original sin avisar):

1. Copia de la base de desarrollo con datos propios y duplicados antiguos; `npm run seed` → imprime lo eliminado; consulta con `sqlite3`/`curl`: solo 2 restaurantes (`rest-1`, `rest-2`), 9 usuarios, los platos de ejemplo sin duplicar.
2. Repetir `npm run seed` → mismos conteos.
3. Base inexistente (borrar la copia) → `npm run seed` ya no falla con `FOREIGN KEY constraint failed`.
4. `NODE_ENV=production npm run seed` → se niega y no borra nada.
5. Arrancar la API y entrar con `admin@resttek.com` / `admin@resttek.com` y un cliente de ejemplo.

**Regresiones a vigilar:** `npm run seed` imprime las credenciales de siempre, la API arranca sobre la base sembrada, y no se altera el esquema de las tablas.

## 7. Riesgos y dudas abiertas

- **Borrado total e irreversible:** `seed` ahora elimina todo, incluidos los clientes registrados, pedidos y cuentas reales de la base de desarrollo. Es lo que pide la issue; se mitiga con la negativa en producción, pero no hay copia de seguridad ni confirmación interactiva (se deja fuera de alcance; se podría añadir `--yes` más adelante).
- **Sesiones abiertas:** los ids de usuario cambian tras sembrar (siguen siendo UUID aleatorios), así que los tokens JWT de sesiones anteriores apuntan a usuarios que ya no existen: hay que volver a iniciar sesión en las apps.
- **API en marcha:** el script usa su propia conexión SQLite; si la API está escribiendo a la vez puede aparecer `SQLITE_BUSY`. Conviene parar la API o repetir el comando; no se añade reintento.
- **Ids no deterministas:** se mantienen los `randomUUID()` actuales (los restaurantes, códigos, equivalencias, mesas y el pack ya tienen ids fijos). Cambiarlo no aporta nada tras el vaciado.
- **Mismo mecanismo en producción:** la protección se basa en `NODE_ENV`; si alguien ejecuta el script contra una base real sin esa variable, borrará los datos. Se asume que `seed` solo se usa en desarrollo (así lo documenta el README).
- **Nombre del fichero en la issue:** dice `seed.py`; se trata de `seed.ts`.
- **Tiempo del test:** bcrypt con 10 rondas para 9 usuarios hace que cada `seedDatabase` tarde ~1 s; con 3-4 llamadas en los tests la suite crece unos segundos. Se acepta; si molesta se podría inyectar un servicio de hash más rápido.

