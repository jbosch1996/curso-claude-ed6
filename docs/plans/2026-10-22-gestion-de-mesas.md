<!-- plan-feature -->
# Plan: Gestión de mesas (CRUD, selección por el cliente y estados para empleados)

- **Tipo:** feature
- **Fecha:** 2026-10-22
- **Estado:** Implementado (T1-T46) en la rama `feature/gestion-de-mesas`

**Desviaciones de la implementación:**

- **T2:** el DDL no tiene test propio: lo cubren los tests de `table.repository.test.ts` (UNIQUE, CHECK de estado y capacidad), como preveía la sección 7.
- **T13:** el cableado por defecto de `OrderService` con `SqliteTableRepository` no tiene test unitario; se verificó con `curl` (pedido con mesa ocupada, libre y de otro restaurante).
- **T14-T15:** los tests del controlador son los de rutas (`table.routes.test.ts`), sin fichero de test propio.
- **T18:** se añadió `app.test.ts` (rutas de mesas montadas y protegidas) para poder hacer TDD del montaje.
- **T35:** `CartStore.clear()` **no** borra la mesa (el plan decía que sí): tras confirmar un pedido el cliente sigue sentado, y borrarla le obligaría a ocupar una segunda mesa dejando la primera ocupada. La mesa solo se limpia (`clearTable()`) al cambiar de restaurante.
- **T31/T30:** no se cambió la vista de Salón para mostrar el número de mesa en lugar del identificador (era opcional en el plan).
- **T44:** además se corrigió en `arquitectura-api.md` la afirmación obsoleta de que ninguna ruta de pedidos aplica `authorize()`.
- **T43:** verificación con `curl` hecha sobre una copia de la BD de desarrollo; los tres frontends solo se verificaron con el build, no en el navegador.
- **Solapamiento con la PR #11 (issue #8):** ambas ramas parten de `main` y tocan los mismos ficheros (`DomainErrors.ts`, `errorHandler.ts`, `database.ts`, `app.ts`, `seed.ts`, `web-admin` (`app.routes.ts`, `app.config.ts`, dashboard), docs y `CLAUDE.md`); los cambios son aditivos y los conflictos de merge, triviales.

## 1. Contexto

- **Issue:** #5 — Gestión de mesas (https://github.com/jbosch1996/curso-claude-ed6/issues/5)

La issue pide tres cosas:

1. **Cliente (`web-clientes`):** al elegir un restaurante, indica el número de personas; se le muestran las mesas disponibles con capacidad suficiente; elige una, pulsa "Continuar", la mesa pasa a **ocupada** y va a la carta para enviar su pedido a cocina y barra.
2. **Administrador (`web-admin`):** CRUD de las mesas del restaurante. Cada mesa tiene `id`, número, descripción, capacidad y estado (`libre`, `ocupada`, `reservada`).
3. **Empleados (`web-empleados`):** ven el estado de las mesas y lo cambian, y ven el estado de los pedidos de las mesas ocupadas.

Hoy no existe el concepto de mesa: `orders.table_id` es un `TEXT` libre y opcional (sin FK), `OrderService.validateTableId` solo comprueba que sea una cadena de 50 caracteres como máximo, y `web-clientes` envía siempre `tableId: null` (`core/services/order.service.ts`). `web-empleados` ya muestra `Mesa {{ order.tableId }}` en la vista de salón si el pedido la trae.

La issue no tiene comentarios ni aclaraciones previas. Donde es ambigua se aplica la opción más conservadora y se deja anotado en la sección 7.

## 2. Objetivo y alcance

**Incluye:**

- Tabla `restaurant_tables` y recurso REST `/api/v1/restaurants/:restaurantId/tables` (estilo por capas).
- CRUD de mesas para `admin` (API + `web-admin`).
- Listado y cambio de estado de mesas para el personal del restaurante (API + `web-empleados`), y vista que cruza las mesas ocupadas con los pedidos activos (`GET /orders/active`, ya existente).
- Flujo del cliente: número de personas → mesas libres con capacidad suficiente → ocupar mesa (operación atómica) → carta; el pedido se envía con el `tableId` de la mesa ocupada.
- Validación en `OrderService.create` de que el `tableId`, si llega, es una mesa ocupada del mismo restaurante.
- Datos seed de mesas y tests (Vitest) de modelo, repositorio, servicio y rutas.
- Documentación (`docs/arquitectura`, `docs/dominio`, `CLAUDE.md`).

**No incluye:**

- Reservas con fecha/hora (el estado `reservada` solo se fija a mano por admin o empleados).
- Liberación automática de la mesa (al entregar todo o al pedir la cuenta de la issue #8): la liberan los empleados cambiando el estado a `libre`.
- Registrar qué cliente ocupa la mesa ni impedir que un cliente ocupe varias.
- Cambios en `order-detail.component.ts` de `web-clientes` (lo modifica la issue #8; se evita el conflicto).
- Paginación (las mesas por restaurante son pocas; la única convención existente es `?limit/offset` en `GET /employees`).
- Notificaciones en tiempo real: `web-empleados` sigue usando polling.

## 3. Análisis del código actual

La API del recurso nuevo sigue el estilo **por capas** (`routes → controllers → services → repositories`, `models`), igual que `ingredient`, `dish` y `order`. No toca el contexto hexagonal `employee`.

Referencias comprobadas:

- `packages/api/src/config/database.ts`: DDL en `runInitialMigrations()` con `CREATE TABLE IF NOT EXISTS` y `PRAGMA foreign_keys = ON`; `run()` devuelve el `RunResult` de sqlite3 (con `changes`), útil para la ocupación atómica.
- `packages/api/src/routes/ingredient.routes.ts`: patrón `authenticate, authorize([...]), requireRestaurantAccess()` con `Router({ mergeParams: true })`.
- `packages/api/src/services/ingredient.service.ts`: `findById(restaurantId, id)` trata un recurso de otro restaurante como inexistente.
- `packages/api/src/controllers/ingredient.controller.ts`: errores con `next(error)` hacia `errorHandler`.
- `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts`: `NOT_FOUND_ERRORS` → 404, `UNAUTHORIZED_ERRORS` → 401, resto de `AppError` → 400.
- `packages/api/src/contexts/shared/infrastructure/http/middlewares.ts`: `requireRestaurantAccess` rechaza (403) a usuarios con `restaurantId` nulo salvo `admin`, por lo que **un cliente no puede pasar por él**: las rutas del cliente no lo llevan.
- `packages/api/src/routes/order.routes.ts`: factory `createOrderRouter(service)` + instancia por defecto; los tests (`order.routes.test.ts`) montan la app con mocks y firman JWT con `JWT_SECRET`.
- `packages/api/src/services/order.service.ts`: constructor `(orderRepository, dishRepository)`, `validateTableId`, `assertDishesOrderable`.
- `packages/api/src/repositories/mocks/`: mocks en memoria para los tests de servicio.
- `packages/api/src/scripts/seed.ts`: `INSERT OR IGNORE`, restaurantes `rest-1` y `rest-2`.
- `web-admin`: features por carpeta (`features/ingredients/{models,services,store,pages}` + `ingredients.routes.ts`), colgadas de `restaurants/:restaurantId` en `app.routes.ts`; tarjetas en `restaurant-dashboard.component.html`.
- `web-empleados`: `features/orders/{models,services,store,pages}`; `OrderStore` con polling cada 30 s; navegación por rol en `core/layout/shell.component.{ts,html}` (`canSeeSalon` = camarero o manager).
- `web-clientes`: `core/{models,services,store}`; `CartStore` (signals, `restaurantId`); `RestaurantListComponent` enlaza a `/restaurants/:id`; `CartComponent.confirmOrder()` llama a `OrderService.createOrder(restaurantId, items)` con `tableId: null`.

| Paquete / capa | Archivo | Cambio previsto |
|------|---------|-----------------|
| api / errors | `packages/api/src/errors/DomainErrors.ts` | Errores de mesa nuevos |
| api / shared | `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts` | `TableNotFoundError` en `NOT_FOUND_ERRORS` |
| api / config | `packages/api/src/config/database.ts` | Tabla `restaurant_tables` |
| api / models | `packages/api/src/models/table.model.ts` (nuevo) | Tipos, estados y validación |
| api / repositories | `packages/api/src/repositories/table.repository.ts` (nuevo) + `mocks/MockTableRepository.ts` | Persistencia y ocupación atómica |
| api / services | `packages/api/src/services/table.service.ts` (nuevo) | Reglas de negocio |
| api / services | `packages/api/src/services/order.service.ts` | Validar `tableId` contra mesas |
| api / controllers y routes | `controllers/table.controller.ts`, `routes/table.routes.ts` (nuevos); `routes/order.routes.ts`; `app.ts` | Endpoints y montaje |
| api / scripts | `packages/api/src/scripts/seed.ts` | Mesas de ejemplo |
| web-admin | `features/tables/{models,services,store,pages}`, `tables.routes.ts`, `app.routes.ts`, `restaurant-dashboard.component.html` | CRUD de mesas |
| web-empleados | `features/tables/{models,services,store,pages}`, `app.routes.ts`, `core/layout/shell.component.{ts,html}` | Vista "Mesas" con estados y pedidos |
| web-clientes | `core/models/table.model.ts`, `core/services/table.service.ts`, `core/store/cart.store.ts`, `core/services/order.service.ts`, `features/tables/table-selection.component.ts` (nuevo), `features/restaurants/restaurant-list.component.ts`, `features/menu/restaurant-menu.component.ts`, `features/cart/cart.component.ts`, `app.routes.ts` | Selección de mesa antes de la carta |
| docs | `docs/arquitectura/arquitectura-api.md`, `docs/arquitectura/arquitectura-frontend.md`, `docs/dominio/modelo-datos.md`, `docs/dominio/glosario.md`, `CLAUDE.md` | Documentar |

## 4. Diseño de la solución

### Datos (SQLite)

Nueva tabla (se llama `restaurant_tables` para no confundirla con el concepto genérico de "tabla"):

```sql
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    description TEXT,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'libre' CHECK (status IN ('libre', 'ocupada', 'reservada')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(restaurant_id, number),
    FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
)
```

Al ser una tabla nueva, `CREATE TABLE IF NOT EXISTS` la crea también en bases ya existentes (no hace falta borrar `resttek.db`). `orders.table_id` no cambia: guardará el `id` (UUID) de la mesa; no se añade FK para no romper pedidos existentes con valores libres.

### Modelo y validación (`models/table.model.ts`)

- `TableStatusType = 'libre' | 'ocupada' | 'reservada'`; `normalizeTableStatus(value)` (trim + minúsculas; `InvalidTableStatusError` si no es válido), análogo a `normalizeOrderStatus`.
- `number`: entero ≥ 1. `capacity`: entero entre 1 y 50 (`MAX_TABLE_CAPACITY`). `description`: opcional, cadena de 200 caracteres como máximo. Errores: `InvalidTableError` con mensaje en inglés.
- `assertValidGuests(guests)`: entero entre 1 y `MAX_TABLE_CAPACITY` (`InvalidTableError('guests must be an integer between 1 and 50')`).

### Errores (`DomainErrors.ts`, mensajes en inglés)

`TableNotFoundError` (404, se añade a `NOT_FOUND_ERRORS`), `InvalidTableError` (400), `InvalidTableStatusError` (400), `DuplicatedTableNumberError` (400, como `DuplicatedEmailError`), `TableNotAvailableError` (400, "Table is not available") y `TableOccupiedError` (400, al borrar una mesa ocupada).

### Repositorio (`SqliteTableRepository`)

`findById`, `findByRestaurantId` (orden por `number`), `save` (insert/update como `ingredient.repository.ts`), `delete`, `findAvailable(restaurantId, guests)` (`status = 'libre' AND capacity >= ?`, orden por `capacity, number`) y `occupyIfAvailable(id, restaurantId, guests, now): Promise<boolean>`:

```sql
UPDATE restaurant_tables SET status = 'ocupada', updated_at = ?
WHERE id = ? AND restaurant_id = ? AND status = 'libre' AND capacity >= ?
```

Devuelve `changes === 1`. Es una sola sentencia, así que dos clientes que piden la misma mesa a la vez no pueden ocuparla ambos (sin `BEGIN/COMMIT`, coherente con `order.repository.ts`).

### Servicio (`TableService`)

- `create(restaurantId, dto)` / `update(restaurantId, id, dto)`: validan, rechazan número repetido en el restaurante (`DuplicatedTableNumberError`, comprobado antes de guardar y respaldado por el `UNIQUE`), y en `update` aceptan también `status`.
- `findById(restaurantId, id)`: `null` si la mesa es de otro restaurante. `list(restaurantId)`.
- `delete(restaurantId, id)`: 404 si no existe en el restaurante; `TableOccupiedError` si está `ocupada`.
- `updateStatus(restaurantId, id, status)`: cambio libre entre los tres estados (los empleados corrigen a mano).
- `listAvailable(restaurantId, guests)` y `occupy(restaurantId, id, guests)`: validan `guests`; si `occupyIfAvailable` devuelve `false`, `TableNotAvailableError` (mismo mensaje tanto si no existe como si está ocupada o es pequeña, para no filtrar información).

### Pedidos (`OrderService`)

Se añade un tercer parámetro **opcional** `tableRepository?: TableRepository` al constructor (los tests actuales siguen compilando). En `create`, si `tableId` no es nulo y hay repositorio: la mesa debe existir, ser del `restaurantId` del pedido y estar `ocupada`; si no, `InvalidOrderError('Table is not occupied in this restaurant')`. `validateTableId` se mantiene. `routes/order.routes.ts` pasa `new SqliteTableRepository(dbConfig)` en la instancia por defecto.

### Endpoints (bajo `/api/v1/restaurants/:restaurantId/tables`, router factory `createTableRouter(service)`)

| Método y ruta | Acceso | Descripción |
|---------------|--------|-------------|
| `GET /available?guests=N` | autenticado, rol `cliente` | Mesas libres con capacidad ≥ N. Devuelve `[{ id, number, description, capacity }]` |
| `POST /:id/occupy` | autenticado, rol `cliente` | Body `{ guests }`. Ocupa la mesa (200 con la mesa) o 400 `TableNotAvailableError` |
| `GET /` | admin, manager, camarero, cocinero + `requireRestaurantAccess()` | Listado completo con estado |
| `GET /:id` | ídem | Detalle (404 si es de otro restaurante) |
| `PATCH /:id/status` | admin, manager, camarero, cocinero + `requireRestaurantAccess()` | Body `{ status }`; devuelve la mesa |
| `POST /` | admin + `requireRestaurantAccess()` | Crear (201). Body `{ number, description?, capacity, status? }` |
| `PUT /:id` | admin + `requireRestaurantAccess()` | Actualizar |
| `DELETE /:id` | admin + `requireRestaurantAccess()` | Borrar (204) |

`/available` se declara antes de `/:id`. Las rutas del cliente no usan `requireRestaurantAccess` (el cliente tiene `restaurantId` nulo); el `restaurantId` de la URL acota la consulta. La respuesta al cliente no incluye el estado ni datos internos.

### Frontends

- **web-admin:** feature `tables` (modelo, servicio HTTP, store con signals y `firstValueFrom`, listado con estado y borrado, formulario de alta/edición con número, descripción, capacidad y estado), ruta `restaurants/:restaurantId/tables` y tarjeta "Mesas" en el panel del restaurante.
- **web-empleados:** feature `tables` con página "Mesas" (`/mesas`): rejilla de mesas con su estado y un selector para cambiarlo; en las mesas ocupadas se listan los pedidos activos de esa mesa (filtrando `OrderStore.orders()` por `tableId`) con el estado de cada ítem. Polling de mesas y pedidos cada 30 s como `OrderStore`. Entrada de menú visible para `camarero` y `manager` (como Salón). La vista de salón muestra el número de mesa en lugar del UUID si se cruza con las mesas cargadas (opcional, en la misma tarea de la página).
- **web-clientes:** nueva página `restaurants/:id/table` (`TableSelectionComponent`): campo "Número de personas", botón "Buscar mesas", lista de mesas libres, selección y "Continuar" → `POST /occupy` → guarda la mesa en `CartStore` (`tableId`, `tableNumber`) y navega a `/restaurants/:id`. Si la mesa ya no está libre, muestra el error y recarga la lista. `RestaurantListComponent` enlaza a la nueva página; `RestaurantMenuComponent` redirige a ella si `CartStore` no tiene mesa para ese restaurante y muestra "Mesa N" en la cabecera; `CartComponent` envía `tableId` al crear el pedido. Componentes standalone con signals y `.subscribe()` directo, como el resto de la app.

## 5. Lista de tareas

> Cada tarea debe poder completarse en 5-10 minutos. Las que cambian comportamiento incluyen su test (`*.test.ts` junto al código).

**API — base**

- [x] **T1** (5 min) — Añadir `TableNotFoundError`, `InvalidTableError`, `InvalidTableStatusError`, `DuplicatedTableNumberError`, `TableNotAvailableError` y `TableOccupiedError`, y registrar `TableNotFoundError` en `NOT_FOUND_ERRORS` · `packages/api/src/errors/DomainErrors.ts`, `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts`
- [x] **T2** (5 min) — Añadir el DDL de `restaurant_tables` (con `CHECK` de capacidad y estado y `UNIQUE(restaurant_id, number)`) a `runInitialMigrations()` · `packages/api/src/config/database.ts`
- [x] **T3** (10 min) — Modelo `Table`, `TableStatusType`, `normalizeTableStatus` y validación de número, capacidad y descripción, con tests · `packages/api/src/models/table.model.ts` (+ `table.model.test.ts`)
- [x] **T4** (5 min) — `assertValidGuests` con tests (no entero, 0, > 50) · `packages/api/src/models/table.model.ts` (+ test)

**API — repositorio**

- [x] **T5** (10 min) — `SqliteTableRepository` con `findById`, `findByRestaurantId`, `save` y `delete`; test de integración en memoria que incluye el `UNIQUE(restaurant_id, number)` y el `CHECK` de estado · `packages/api/src/repositories/table.repository.ts` (+ `table.repository.test.ts`)
- [x] **T6** (10 min) — `findAvailable(restaurantId, guests)` y `occupyIfAvailable(...)` atómico; tests: solo libres con capacidad suficiente, segunda ocupación devuelve `false`, mesa de otro restaurante devuelve `false` · `packages/api/src/repositories/table.repository.ts` (+ test)
- [x] **T7** (5 min) — Mock en memoria del repositorio de mesas · `packages/api/src/repositories/mocks/MockTableRepository.ts`

**API — servicios**

- [x] **T8** (10 min) — `TableService.create` y `update` (validación, número duplicado por restaurante, `status` opcional, 404 si es de otro restaurante) con tests · `packages/api/src/services/table.service.ts` (+ `table.service.test.ts`)
- [x] **T9** (5 min) — `TableService.findById`, `list` y `delete` (404 entre restaurantes, `TableOccupiedError` si está ocupada) con tests · `packages/api/src/services/table.service.ts` (+ test)
- [x] **T10** (5 min) — `TableService.updateStatus` (normaliza y rechaza estados inválidos) con tests · `packages/api/src/services/table.service.ts` (+ test)
- [x] **T11** (10 min) — `TableService.listAvailable` y `occupy` (validan `guests`, `TableNotAvailableError` si no se puede ocupar) con tests · `packages/api/src/services/table.service.ts` (+ test)
- [x] **T12** (10 min) — `OrderService`: tercer parámetro opcional `tableRepository` y validación de que el `tableId` es una mesa ocupada del restaurante; tests (mesa libre, de otro restaurante, inexistente, válida, `null`) · `packages/api/src/services/order.service.ts` (+ `order.service.test.ts`)
- [x] **T13** (5 min) — Pasar `SqliteTableRepository` a la instancia por defecto de `OrderService` · `packages/api/src/routes/order.routes.ts`

**API — controlador y rutas**

- [x] **T14** (10 min) — `TableController` para CRUD y cambio de estado (`toJSON`, `next(error)`) · `packages/api/src/controllers/table.controller.ts`
- [x] **T15** (5 min) — Métodos `getAvailable` (lee `?guests`) y `occupy` del controlador, con proyección sin estado para el cliente · `packages/api/src/controllers/table.controller.ts`
- [x] **T16** (10 min) — Router factory `createTableRouter(service)` con `mergeParams`, roles y `requireRestaurantAccess`, `/available` antes de `/:id`; tests de CRUD: 401, 403 por rol, 403 otro restaurante, 201, 400 duplicado, 404, 204 · `packages/api/src/routes/table.routes.ts` (+ `table.routes.test.ts`)
- [x] **T17** (10 min) — Tests de ruta de `PATCH /:id/status` (camarero 200, cliente 403) y de `/available` y `/:id/occupy` (cliente 200, empleado 403, `guests` inválido 400, segunda ocupación 400) · `packages/api/src/routes/table.routes.test.ts`
- [x] **T18** (5 min) — Montar `app.use('/api/v1/restaurants/:restaurantId/tables', tableRoutes)` · `packages/api/src/app.ts`
- [x] **T19** (5 min) — Mesas seed idempotentes (`INSERT OR IGNORE`, ids fijos): 4 en `rest-1` y 3 en `rest-2` con capacidades 2, 4 y 6 · `packages/api/src/scripts/seed.ts`

**web-admin**

- [x] **T20** (5 min) — Modelos `RestaurantTable`, `TableStatus`, `CreateTableDto`, `UpdateTableDto` · `packages/web-admin/src/app/features/tables/models/table.model.ts`
- [x] **T21** (5 min) — Servicio HTTP (`getAll`, `create`, `update`, `delete`) · `packages/web-admin/src/app/features/tables/services/table.service.ts`
- [x] **T22** (10 min) — `TableStore` con signals (carga por restaurante, alta, edición, borrado), siguiendo `IngredientStore` · `packages/web-admin/src/app/features/tables/store/table.store.ts`
- [x] **T23** (10 min) — Página de listado (número, descripción, capacidad, estado; editar y borrar con confirmación y mensaje si está ocupada) · `packages/web-admin/src/app/features/tables/pages/table-list/`
- [x] **T24** (10 min) — Formulario de alta y edición (número, descripción, capacidad, estado) · `packages/web-admin/src/app/features/tables/pages/table-form/`
- [x] **T25** (5 min) — `TABLE_ROUTES` (`''`, `new`, `:id/edit`) y entrada `tables` en `restaurants/:restaurantId` · `packages/web-admin/src/app/features/tables/tables.routes.ts`, `packages/web-admin/src/app/app.routes.ts`
- [x] **T26** (5 min) — Tarjeta "Mesas" en el panel del restaurante · `packages/web-admin/src/app/features/restaurants/pages/restaurant-dashboard/restaurant-dashboard.component.html`
- [x] **T27** (5 min) — Compilar `npm run build -w @resttek/web-admin` y corregir errores

**web-empleados**

- [x] **T28** (5 min) — Modelo `RestaurantTable` y servicio HTTP (`getAll`, `updateStatus`) · `packages/web-empleados/src/app/features/tables/models/table.model.ts`, `packages/web-empleados/src/app/features/tables/services/table.service.ts`
- [x] **T29** (10 min) — `TableStore` con signals, `firstValueFrom`, actualización optimista del estado y polling de 30 s · `packages/web-empleados/src/app/features/tables/store/table.store.ts`
- [x] **T30** (10 min) — Página "Mesas": rejilla con número, capacidad, estado (badge) y selector para cambiarlo · `packages/web-empleados/src/app/features/tables/pages/mesas/`
- [x] **T31** (10 min) — En las mesas ocupadas, listar los pedidos activos de la mesa (`OrderStore.orders()` filtrado por `tableId`) con el estado de cada ítem; arrancar y parar el polling de pedidos en la página · `packages/web-empleados/src/app/features/tables/pages/mesas/`
- [x] **T32** (5 min) — Ruta `mesas` y entrada de menú "Mesas" (`canSeeMesas`: camarero y manager) · `packages/web-empleados/src/app/app.routes.ts`, `packages/web-empleados/src/app/core/layout/shell.component.ts`, `packages/web-empleados/src/app/core/layout/shell.component.html`
- [x] **T33** (5 min) — Compilar `npm run build -w @resttek/web-empleados` y corregir errores

**web-clientes**

- [x] **T34** (5 min) — Modelo `AvailableTable` y `TableService` (`getAvailable(restaurantId, guests)`, `occupy(restaurantId, tableId, guests)`) · `packages/web-clientes/src/app/core/models/table.model.ts`, `packages/web-clientes/src/app/core/services/table.service.ts`
- [x] **T35** (5 min) — `CartStore`: signals `tableId` y `tableNumber`, `setTable(restaurantId, table)`, limpiar la mesa al cambiar de restaurante y en `clear()` · `packages/web-clientes/src/app/core/store/cart.store.ts`
- [x] **T36** (10 min) — `TableSelectionComponent`: número de personas (1-50), búsqueda de mesas libres, lista seleccionable y estados de carga, vacío y error · `packages/web-clientes/src/app/features/tables/table-selection.component.ts`
- [x] **T37** (5 min) — Botón "Continuar": ocupar la mesa, guardarla en `CartStore` y navegar a la carta; si falla, mensaje y recarga de la lista · `packages/web-clientes/src/app/features/tables/table-selection.component.ts`
- [x] **T38** (5 min) — Ruta `restaurants/:id/table` y enlace de `RestaurantListComponent` a ella · `packages/web-clientes/src/app/app.routes.ts`, `packages/web-clientes/src/app/features/restaurants/restaurant-list.component.ts`
- [x] **T39** (5 min) — `RestaurantMenuComponent`: redirigir a la selección de mesa si no hay mesa para ese restaurante y mostrar "Mesa N" en la cabecera · `packages/web-clientes/src/app/features/menu/restaurant-menu.component.ts`
- [x] **T40** (5 min) — `OrderService.createOrder` recibe `tableId` y `CartComponent.confirmOrder` lo envía desde `CartStore` · `packages/web-clientes/src/app/core/services/order.service.ts`, `packages/web-clientes/src/app/features/cart/cart.component.ts`
- [x] **T41** (5 min) — Compilar `npm run build -w @resttek/web-clientes` y corregir errores

**Verificación y documentación**

- [x] **T42** (5 min) — Ejecutar `npm test` completo y comprobar que no hay regresiones (en especial `order.service.test.ts` y `order.routes.test.ts`)
- [x] **T43** (10 min) — Verificación manual con `curl` y en los tres frontends (ver sección 6)
- [x] **T44** (10 min) — Documentar endpoints de mesas y la validación de `tableId` en pedidos · `docs/arquitectura/arquitectura-api.md`
- [x] **T45** (5 min) — Documentar la tabla `restaurant_tables` (diagrama ER, tabla y relación) y el término "Mesa" con sus estados · `docs/dominio/modelo-datos.md`, `docs/dominio/glosario.md`
- [x] **T46** (5 min) — Documentar las rutas nuevas de los frontends y añadir a `CLAUDE.md` una nota sobre mesas (ocupación atómica, rutas de cliente sin `requireRestaurantAccess`, `tableId` = id de mesa) · `docs/arquitectura/arquitectura-frontend.md`, `CLAUDE.md`

**Total: 46 tareas, 320 minutos (≈ 5 h 20 min).**

## 6. Verificación

**Tests automáticos (Vitest, API):** modelo (estados, número, capacidad, descripción, `guests`), repositorio en memoria (`UNIQUE`, `CHECK`, `findAvailable`, ocupación atómica que falla la segunda vez), servicio (ámbito por restaurante, duplicados, borrado de mesa ocupada, cambio de estado, ocupación), `OrderService` (validación de `tableId`) y rutas con JWT firmados (401/403/404/400/201/200/204). Los frontends no tienen tests: se comprueban con `npm run build -w @resttek/<app>` y a mano.

**Manual con `curl`** (`npm run dev:api`; contraseña de cada usuario seed = su email; `$ADMIN`, `$CAM`, `$CLI` son los tokens de `admin@resttek.com`, `camarero1@resttek.com` y un cliente registrado con `POST /api/v1/auth/register`):

1. `POST /api/v1/restaurants/rest-1/tables` con `$ADMIN` y `{ "number": 10, "capacity": 4, "description": "Terraza" }` → `201` con `status: "libre"`. Repetirlo → `400` (`DuplicatedTableNumberError`).
2. Lo mismo con `$CAM` → `403`. `GET /api/v1/restaurants/rest-2/tables` con `$CAM` (de `rest-1`) → `403`.
3. `GET /api/v1/restaurants/rest-1/tables/available?guests=3` con `$CLI` → solo mesas libres con capacidad ≥ 3; `?guests=0` → `400`.
4. `POST /api/v1/restaurants/rest-1/tables/<id>/occupy` con `$CLI` y `{ "guests": 3 }` → `200`; repetirlo → `400` (`TableNotAvailableError`); ya no aparece en `/available`.
5. `POST /api/v1/orders` con `$CLI`, `restaurantId: "rest-1"`, `tableId: "<id>"` y un plato → `201`; con el id de una mesa libre o de `rest-2` → `400`.
6. `GET /api/v1/restaurants/rest-1/tables` con `$CAM` → la mesa aparece `ocupada`; `PATCH .../tables/<id>/status` `{ "status": "libre" }` → `200`; `{ "status": "rota" }` → `400`.
7. `DELETE .../tables/<id>` con `$ADMIN` estando ocupada → `400`; libre → `204`.
8. Frontends: en `web-admin` (:4200) crear, editar y borrar una mesa; en `web-clientes` (:4202) elegir restaurante → personas → mesa → carta → pedido; en `web-empleados` (:4201, camarero) ver la mesa ocupada con su pedido y liberarla.

**Regresiones a vigilar:** creación de pedidos sin `tableId` (sigue permitido), `GET /orders/active` y transiciones de estado, la vista de salón, que la API arranque sobre una `resttek.db` existente creando la tabla nueva, y que `npm run seed` siga siendo idempotente.

## 7. Riesgos y dudas abiertas

- **Solapamiento con la issue #8 (códigos de descuento y puntos, en implementación en otro worktree):** ambos planes tocan `packages/api/src/errors/DomainErrors.ts`, `contexts/shared/infrastructure/http/errorHandler.ts` (`NOT_FOUND_ERRORS`), `config/database.ts` (DDL), `app.ts`, `scripts/seed.ts`, `web-admin/src/app/app.routes.ts`, `restaurant-dashboard.component.html`, `docs/dominio/*`, `docs/arquitectura/arquitectura-api.md` y `CLAUDE.md`. Los cambios son aditivos, pero habrá conflictos de merge triviales. Recomendación: implementar esta issue **después de integrar la #8** en `main` (o rebasar sobre ella). Este plan evita a propósito `order-detail.component.ts` de `web-clientes` y crear `config/database.test.ts` (los dos los crea o modifica la #8); los tests del DDL van en `table.repository.test.ts`.
- **Liberar la mesa:** la issue no dice cuándo vuelve a `libre`. Opción conservadora: solo a mano por empleados/admin. Encajaría liberarla automáticamente al pedir la cuenta (`POST /orders/:orderId/bill` de la #8), pero eso crea una dependencia entre issues y se deja para una tarea posterior.
- **Roles del CRUD:** la issue dice "el administrador"; se limita a `admin` (como ingredientes). Si `manager` también debe gestionar mesas (como platos), basta con cambiar el `authorize` de `POST/PUT/DELETE` en T16.
- **Qué empleados cambian estados:** la issue dice "los empleados"; la API lo permite a `manager`, `camarero` y `cocinero` (y `admin`), pero el menú de `web-empleados` solo muestra "Mesas" a `camarero` y `manager`, como Salón. Confirmar si el cocinero debe verla.
- **Abuso por clientes:** cualquier cliente autenticado puede ocupar mesas libres de cualquier restaurante y varias a la vez, y no se registra quién ocupa cada mesa (los pedidos tampoco comprueban que el cliente sea quien ocupó la mesa). Queda fuera del alcance; mitigarlo requeriría una columna `occupied_by` o una sesión de mesa.
- **Mesa ocupada sin pedido:** si el cliente ocupa la mesa y abandona la app sin pedir, la mesa queda ocupada hasta que un empleado la libere.
- **Estado `reservada`:** sin fecha ni titular; un cliente no puede ocupar una mesa reservada (solo se ofrecen las `libre`).
- **Pedidos de mesas ocupadas:** se muestran los pedidos de `GET /orders/active`, que solo incluye pedidos con algún ítem no entregado; los pedidos ya entregados por completo no aparecen. Si se quiere el histórico de la mesa, haría falta un endpoint nuevo.
- **`orders.table_id` sin FK:** se mantiene como `TEXT` libre para no romper datos existentes; la integridad la garantiza `OrderService`. Borrar una mesa deja pedidos antiguos con un `tableId` que ya no existe (la vista de empleados mostrará el UUID truncado).
- **Mesa en `CartStore` solo en memoria:** si el cliente recarga la página pierde la mesa seleccionada (la mesa sigue ocupada en la API) y se le redirige a elegir mesa otra vez. Persistirla (p. ej. `sessionStorage`) queda como mejora.
- **Documentación desactualizada detectada:** `docs/arquitectura/arquitectura-api.md` dice que ninguna ruta de pedidos aplica `authorize()`, pero `routes/order.routes.ts` sí lo aplica en `/active` y en `PATCH .../status`. T44 debe corregirlo de paso o anotarlo en `docs/revisiones/`.
- **Seed en base nueva:** `npm run seed` ya falla en bases nuevas (ver `CLAUDE.md`); T19 solo se verifica sobre una base con restaurantes.

