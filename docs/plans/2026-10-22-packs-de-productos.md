<!-- plan-feature -->
# Plan: Packs de productos (precio fijo y un plato a elegir por categoría)

- **Tipo:** feature
- **Fecha:** 2026-10-22
- **Estado:** Implementado (T1-T53) en la rama `feature/packs-de-productos`

**Desviaciones de la implementación:**

- **T1, T25, T31, T33:** para reducir conflictos con la PR de la issue #7, los tests nuevos van en ficheros propios en vez de añadirse a los existentes: `config/database.packs.test.ts`, `services/bill.packs.test.ts`, `routes/order.packs.routes.test.ts` y `app.packs.test.ts`. Además se añadió `contexts/shared/infrastructure/http/errorHandler.packs.test.ts` para hacer TDD de T3-T4 (errores y 404).
- **T25:** el test de la cuenta usa pedidos solo con packs: con `MockOrderRepository` los platos sueltos no llevan `dishPrice` (lo pone el JOIN del repositorio SQLite). El pedido mixto (pack + platos sueltos) está cubierto en `order.repository.test.ts` y en la verificación con `curl` (subtotal 22,50 = pack 20 + refresco 2,50).
- **T15/T21:** algunos casos se añadieron con el código ya escrito y nacieron en verde (rollback de `order_item_packs` y validación de la forma de `dishIds`); son tests de regresión.
- **Esquema sobre BD existente:** las tablas nuevas se crean con `CREATE TABLE IF NOT EXISTS` y no se toca ninguna tabla existente; se comprobó arrancando la API sobre una copia de la BD de desarrollo (sin test unitario específico).
- **T50:** la verificación con `curl` se hizo sobre una copia de la BD (`PORT=3997`). La copia tenía platos duplicados por ejecuciones repetidas del seed (comportamiento previo: los platos usan `randomUUID()` con `INSERT OR IGNORE`), así que el pack de ejemplo del seed solo excluye el primer "Refresco de Cola".
- **Frontends:** solo verificados con el build (`web-admin`, `web-clientes` y `web-empleados`), no en el navegador.
- `tsc --noEmit` de la API solo da los errores previos de `seed.ts` (ya presentes en `main`).

## 1. Contexto

- **Issue:** #9 — Packs de productos (https://github.com/jbosch1996/curso-claude-ed6/issues/9)

La issue pide que, además de los platos sueltos (entrantes, principales, postres, bebidas), los administradores puedan crear **packs** con un **precio fijo** compuesto por un plato a elegir de cada una de varias categorías (p. ej. entrante + principal + bebida por 20 €). El cliente, al elegir un pack, decide qué plato de cada categoría quiere. El administrador puede además **limitar los productos elegibles** dentro de un pack (p. ej. bloquear la cerveza en la selección de bebidas).

Afecta a `api`, `web-admin` y `web-clientes` (etiquetas de la issue). La issue no tiene comentarios ni aclaraciones previas; donde es ambigua se aplica la opción más conservadora y se anota en la sección 7.

Ya existen y están fusionados los códigos de descuento, los puntos y la cuenta (`BillService`, que calcula el subtotal sumando `dishPrice × quantity` de los ítems del pedido) y las mesas (`orders.table_id`, que debe estar ocupada). El diseño debe mantener correctos esos cálculos: un pedido con un pack debe dar un subtotal igual al precio del pack, no a la suma de los platos.

## 2. Objetivo y alcance

**Incluye:**

- Recurso `packs` en la API (estilo por capas): tablas nuevas, CRUD protegido en `/api/v1/restaurants/:restaurantId/packs` (roles `admin` y `manager` con `requireRestaurantAccess`) y listado público de packs disponibles con los platos elegibles por categoría en `/api/v1/public/restaurants/:restaurantId/packs`.
- Restricción de platos elegibles mediante una **lista de platos excluidos** por pack.
- Pedidos con packs: `POST /api/v1/orders` acepta un nuevo campo opcional `packs` con la elección del cliente; cada pack se guarda como ítems normales (uno por plato elegido, para que cocina y barra sigan trabajando igual) marcados con el pack al que pertenecen y con el precio del pack guardado en el momento del pedido.
- Subtotal correcto en la cuenta sin tocar `BillService`: el `dishPrice` de los ítems de pack sale del precio guardado (el primer ítem del pack lleva el precio completo y el resto 0).
- `web-admin`: listado y formulario de packs (nombre, descripción, precio, disponible, categorías y platos elegibles por categoría) y acceso desde el panel del restaurante.
- `web-clientes`: sección "Packs" en la carta con selección de un plato por categoría, packs en el carrito y envío en el pedido; el detalle del pedido agrupa los platos de cada pack.
- Datos seed (un pack de ejemplo), tests Vitest (modelo, repositorio, servicio y rutas) y documentación.

**No incluye:**

- Varias unidades de la misma categoría dentro de un pack (p. ej. "2 principales"): cada categoría aparece una sola vez por pack.
- Lista blanca de platos ("solo estos platos"): se usa lista negra (excluidos), así los platos nuevos de la categoría entran automáticamente.
- Suplementos de precio por plato elegido dentro de un pack.
- Cambios en `web-empleados`: los platos de un pack llegan a cocina y barra como ítems normales; mostrar el nombre del pack en las vistas de empleados queda fuera.
- Cambios en `BillService`, descuentos o puntos (siguen funcionando sobre el subtotal).
- Paginación (los packs por restaurante son pocos).

## 3. Análisis del código actual

La API del recurso nuevo sigue el estilo **por capas** (`routes → controllers → services → repositories`, `models`), igual que `dish`, `discount-code` y `table`. No toca el contexto hexagonal `employee`.

Referencias comprobadas:

- `packages/api/src/config/database.ts`: `runInitialMigrations()` crea las tablas con `CREATE TABLE IF NOT EXISTS` (no hay mecanismo de `ALTER TABLE`). `order_items` tiene `id, order_id, dish_id, quantity, notes, status`; los platos se borran con `DELETE` y `PRAGMA foreign_keys = ON` está activo.
- `packages/api/src/models/dish.model.ts`: categorías válidas `entrante | principal | postre | bebida` y `normalizeDishCategory()`.
- `packages/api/src/models/order.model.ts`: `OrderItem` con `dishName`, `dishPrice`, `dishCategory` opcionales (los rellena el repositorio con un `LEFT JOIN dishes`).
- `packages/api/src/services/order.service.ts`: `create()` valida mesa, `validateItems()` (1-50 líneas, cantidad 1-20, máx. 100 unidades, notas ≤ 200) y `assertDishesOrderable()`; expande cada línea en N ítems de `quantity: 1`. Constructor `(orderRepository, dishRepository, tableRepository?)`.
- `packages/api/src/repositories/order.repository.ts`: `create()` inserta el pedido y los ítems en una sola sentencia y borra el pedido si falla (no usa transacciones por la conexión compartida); `getOrderItems()` hace `LEFT JOIN dishes` y devuelve `d.price as dish_price`.
- `packages/api/src/services/bill.service.ts`: `subtotal = Σ (item.dishPrice ?? 0) × item.quantity`.
- `packages/api/src/routes/order.routes.ts`: factory `createOrderRouter(service)`; el router por defecto se cablea con los repositorios SQLite.
- `packages/api/src/routes/discount-code.routes.ts` y `table.routes.ts`: patrón de factory `create<X>Router(service)` + guard `[authenticate, authorize(roles), requireRestaurantAccess()]` y controlador con `next(error)` hacia `errorHandler`.
- `packages/api/src/routes/dish.public.routes.ts` y `controllers/dish.controller.ts#getPublic`: patrón de ruta pública por restaurante.
- `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts`: `NOT_FOUND_ERRORS` → 404, resto de `AppError` → 400.
- `packages/api/src/controllers/order.controller.ts`: mapea `InvalidOrderError` → 400.
- `packages/web-admin`: features con `models/pages/services/store` (p. ej. `features/tables`), rutas en `app.routes.ts` bajo `restaurants/:restaurantId`, tarjetas en `features/restaurants/pages/restaurant-dashboard/restaurant-dashboard.component.html`, iconos Lucide registrados en `app.config.ts`. `features/dishes/services/dish.service.ts` lista los platos del restaurante.
- `packages/web-clientes`: `core/store/cart.store.ts` (ítems por plato, total, mesa), `features/menu/restaurant-menu.component.ts` (carta por categorías), `features/cart/cart.component.ts` (confirma con `OrderService.createOrder(restaurantId, items, tableId)`), `features/orders/order-detail.component.ts` (`groupedItems` agrupa por `dishId` y muestra `dishPrice × count`), `features/orders/my-orders.component.ts` (total = Σ `dishPrice`).

| Paquete / capa | Archivo | Cambio previsto |
|------|---------|-----------------|
| api / config | `src/config/database.ts` | Añadir al final tablas `packs`, `pack_categories`, `pack_excluded_dishes`, `order_item_packs` |
| api / errors | `src/errors/DomainErrors.ts` | Añadir `PackNotFoundError`, `InvalidPackError` |
| api / shared | `src/contexts/shared/infrastructure/http/errorHandler.ts` | Añadir `PackNotFoundError` a `NOT_FOUND_ERRORS` |
| api / models | `src/models/pack.model.ts` (nuevo) | Tipo `Pack`, `validatePackFields`, `eligibleDishes`, `resolvePackSelection` |
| api / models | `src/models/order.model.ts` | Campos opcionales `packId`, `packName`, `packInstanceId` en `OrderItem` |
| api / repositories | `src/repositories/pack.repository.ts` (nuevo) + `mocks/MockPackRepository.ts` | CRUD de packs con categorías y excluidos |
| api / repositories | `src/repositories/order.repository.ts` | Guardar `order_item_packs` y leer `COALESCE(oip.unit_price, d.price)` y datos del pack |
| api / services | `src/services/pack.service.ts` (nuevo) | CRUD con alcance por restaurante y listado público con platos elegibles |
| api / services | `src/services/order.service.ts` | Aceptar `packs` en `create`, validarlos y expandirlos en ítems |
| api / controllers | `src/controllers/pack.controller.ts` (nuevo), `order.controller.ts` | Endpoints de packs; pasar `packs` del body |
| api / routes | `src/routes/pack.routes.ts`, `src/routes/pack.public.routes.ts` (nuevos), `order.routes.ts` | Factories y cableado de `SqlitePackRepository` |
| api / app | `src/app.ts` | Montar las dos rutas de packs |
| api / seed | `src/scripts/seed.ts` | Pack de ejemplo en `rest-1` |
| web-admin | `features/packs/**` (nuevo), `app.routes.ts`, `app.config.ts`, dashboard del restaurante | CRUD de packs |
| web-clientes | `core/models/pack.model.ts`, `core/services/pack.service.ts` (nuevos), `core/models/order.model.ts`, `core/services/order.service.ts`, `core/store/cart.store.ts`, `features/menu`, `features/cart`, `features/orders/order-detail.component.ts` | Elegir packs, carrito y detalle del pedido |
| docs | `docs/arquitectura/arquitectura-api.md`, `docs/dominio/modelo-datos.md`, `docs/dominio/glosario.md`, `CLAUDE.md` | Documentar packs |

## 4. Diseño de la solución

### Esquema SQLite (solo tablas nuevas, añadidas al final de `runInitialMigrations`)

```sql
CREATE TABLE IF NOT EXISTS packs (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL CHECK (price > 0),
    available INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
);
CREATE TABLE IF NOT EXISTS pack_categories (
    pack_id TEXT NOT NULL,
    category TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY(pack_id, category),
    FOREIGN KEY(pack_id) REFERENCES packs(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS pack_excluded_dishes (
    pack_id TEXT NOT NULL,
    dish_id TEXT NOT NULL,
    PRIMARY KEY(pack_id, dish_id),
    FOREIGN KEY(pack_id) REFERENCES packs(id) ON DELETE CASCADE,
    FOREIGN KEY(dish_id) REFERENCES dishes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS order_item_packs (
    order_item_id TEXT PRIMARY KEY,
    pack_id TEXT NOT NULL,
    pack_name TEXT NOT NULL,
    pack_instance_id TEXT NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY(order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
)
```

- `order_items` **no se modifica** (no hay `ALTER TABLE` en el proyecto y las BD existentes no tendrían la columna). La información de pack de un ítem va en `order_item_packs` (1:0..1).
- `order_item_packs.pack_id` **sin FK** y con `pack_name` y `unit_price` copiados: el histórico de pedidos y la cuenta sobreviven a que el pack se edite o se borre, y el precio cobrado es el del momento del pedido.
- `pack_excluded_dishes.dish_id` con `ON DELETE CASCADE`: borrar un plato no falla por estar excluido en un pack.

### Modelo `Pack` (`src/models/pack.model.ts`)

```ts
interface Pack {
    id: string; restaurantId: string; name: string; description: string | null
    price: number; available: boolean
    categories: DishCategoryType[]   // en orden, sin repetidos, 1..4
    excludedDishIds: string[]
    createdAt: string; updatedAt: string
}
```

- `validatePackFields(input)`: `name` string no vacía ≤ 100; `description` opcional string ≤ 300 (vacía → null); `price` con `assertPositiveNumber` (`InvalidPackError`); `available` boolean opcional (por defecto `true`); `categories` array de 1 a 4 categorías válidas (`normalizeDishCategory`) sin repetir; `excludedDishIds` array opcional de strings (sin repetidos, máx. 100). Errores: `InvalidPackError` (400).
- `eligibleDishes(pack, dishes, category)`: platos de `dishes` del mismo restaurante, `available`, de esa categoría y no excluidos.
- `resolvePackSelection(pack, dishIds, dishesById)`: comprueba que `dishIds` tiene exactamente un plato por categoría del pack (el orden no importa) y que cada uno es elegible; devuelve los platos en el orden de `pack.categories`. Lanza `InvalidOrderError` si no.

### API de gestión (`/api/v1/restaurants/:restaurantId/packs`)

Guard `[authenticate, authorize(['admin', 'manager']), requireRestaurantAccess()]` (los mismos roles que gestionan la carta de platos).

| Método | Ruta | Respuesta |
|---|---|---|
| `POST` | `/` | 201 `Pack` · 400 `InvalidPackError` |
| `GET` | `/` | 200 `Pack[]` del restaurante |
| `GET` | `/:id` | 200 `Pack` · 404 `PackNotFoundError` (también si es de otro restaurante) |
| `PUT` | `/:id` | 200 `Pack` · 400 / 404 |
| `DELETE` | `/:id` | 204 · 404 |

Body: `{ name, description?, price, available?, categories: string[], excludedDishIds?: string[] }`. `PackService` comprueba que todos los `excludedDishIds` son platos del restaurante (si no, `InvalidPackError`).

### API pública (`/api/v1/public/restaurants/:restaurantId/packs`)

`GET` sin autenticación (igual que la carta pública). Devuelve los packs `available` del restaurante con los platos elegibles por categoría; se omite un pack si alguna categoría se queda sin platos elegibles:

```json
[{ "id": "...", "name": "Menú del día", "description": null, "price": 18,
   "slots": [{ "category": "entrante", "dishes": [{ "id": "...", "name": "...", "description": "...", "price": 9 }] }] }]
```

No expone `excludedDishIds` ni fechas.

### Pedidos con packs (`POST /api/v1/orders`)

Body ampliado (retrocompatible): `{ restaurantId, tableId, items?, packs?: [{ packId, dishIds: string[], quantity, notes? }] }`.

- `items` pasa a ser opcional (por defecto `[]`); debe haber entre 1 y 50 líneas sumando `items` y `packs` (con solo `items` se mantiene el mensaje actual). Cada línea de pack: `packId` string no vacía, `dishIds` array de strings, `quantity` entero 1-20, `notes` ≤ 200. Las unidades de un pack cuentan `quantity × nº de categorías` para el límite de 100.
- Por cada línea: el pack existe, es del restaurante y está disponible; los platos se cargan con `DishRepository.findById` y se valida con `resolvePackSelection`. Cualquier fallo → `InvalidOrderError` (400) sin filtrar si el pack existe en otro restaurante.
- Expansión: por cada unidad se genera un `packInstanceId` (UUID) y un ítem `quantity: 1` por plato elegido con `packId`, `packName`, `packInstanceId` y `dishPrice` = precio del pack en el **primer** ítem y `0` en el resto. Así `Σ dishPrice` del pedido = precio del pack y `BillService` no cambia.
- `SqliteOrderRepository.create` inserta las filas de `order_item_packs` tras los ítems (una sola sentencia); si falla, borra el pedido (el `ON DELETE CASCADE` limpia los ítems).
- `getOrderItems()` añade `LEFT JOIN order_item_packs oip` y usa `COALESCE(oip.unit_price, d.price) as dish_price`; añade `packId`, `packName`, `packInstanceId` al ítem **solo si** pertenece a un pack (los ítems normales quedan exactamente como hoy).
- `OrderService` recibe `packRepository?: PackRepository` como 4.º parámetro opcional; si llegan `packs` y no hay repositorio, `InvalidOrderError`.
- Cocina/barra: cada plato de un pack es un ítem normal; las transiciones de estado (`assertTransitionAllowed`) no cambian.

### Errores

- `PackNotFoundError` ('Pack not found') → 404 (añadir a `NOT_FOUND_ERRORS`).
- `InvalidPackError(message?)` ('Invalid pack') → 400.
- Pedidos: `InvalidOrderError` (ya mapeado a 400 en `OrderController`).

### Frontends

- **web-admin** (`features/packs`): `models/pack.model.ts`, `services/pack.service.ts`, `store/pack.store.ts` (signals + `firstValueFrom`), páginas `pack-list` (tabla con nombre, categorías, precio, disponible, editar/borrar) y `pack-form` (campos básicos, checkboxes de categorías y, por cada categoría marcada, la lista de platos del restaurante de esa categoría con checkbox "elegible"; desmarcar = excluir). Usa `DishService` de `features/dishes`. Ruta `restaurants/:restaurantId/packs`, tarjeta "Packs" en el panel del restaurante e icono Lucide `Boxes` registrado en `app.config.ts`.
- **web-clientes**: `PackService.getByRestaurant()` (endpoint público); `CartStore` con señal `packs` (`{ key, pack, dishes, quantity }`), `addPack`, `updatePackQuantity`, `removePack`; `total` e `itemCount` incluyen packs; `clear()` y el cambio de restaurante vacían también los packs. La carta muestra una sección "Packs" encima de las categorías con un `<select>` por categoría y botón "Añadir pack" habilitado cuando todo está elegido. El carrito lista los packs (con los platos elegidos) y `confirmOrder` envía `packs`. `order-detail` agrupa los ítems con `packInstanceId` en una línea "Pack X" con sus platos y el precio del pack; los demás se agrupan como hoy.

## 5. Lista de tareas

> Cada tarea debe poder completarse en 5-10 minutos. Si una tarea es mayor, divídela.

**API: base de datos, errores y modelos**

- [x] **T1** (5 min) — Test: las tablas `packs`, `pack_categories`, `pack_excluded_dishes`, `order_item_packs` existen y borrar un plato excluido borra la exclusión (CASCADE) · `packages/api/src/config/database.test.ts`
- [x] **T2** (5 min) — Añadir las cuatro tablas al final de `runInitialMigrations` · `packages/api/src/config/database.ts`
- [x] **T3** (5 min) — Añadir `PackNotFoundError` e `InvalidPackError` al final · `packages/api/src/errors/DomainErrors.ts`
- [x] **T4** (5 min) — Añadir `PackNotFoundError` a `NOT_FOUND_ERRORS` · `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts`
- [x] **T5** (10 min) — Tests de `validatePackFields` (nombre, descripción, precio, categorías válidas/repetidas/vacías/>4, `available`, `excludedDishIds`) · `packages/api/src/models/pack.model.test.ts`
- [x] **T6** (10 min) — Implementar tipo `Pack` y `validatePackFields` · `packages/api/src/models/pack.model.ts`
- [x] **T7** (5 min) — Tests de `eligibleDishes` (filtra por categoría, disponibilidad, restaurante y excluidos) · `packages/api/src/models/pack.model.test.ts`
- [x] **T8** (5 min) — Implementar `eligibleDishes` · `packages/api/src/models/pack.model.ts`
- [x] **T9** (10 min) — Tests de `resolvePackSelection` (selección válida en cualquier orden, falta categoría, categoría repetida, plato excluido/no disponible/de otro restaurante/inexistente) · `packages/api/src/models/pack.model.test.ts`
- [x] **T10** (5 min) — Implementar `resolvePackSelection` · `packages/api/src/models/pack.model.ts`
- [x] **T11** (5 min) — Añadir `packId?`, `packName?`, `packInstanceId?` a `OrderItem` · `packages/api/src/models/order.model.ts`

**API: repositorios**

- [x] **T12** (10 min) — Tests de `SqlitePackRepository` (`save` crea y actualiza con categorías en orden y excluidos, `findById`, `findByRestaurantId`, `delete` en cascada) · `packages/api/src/repositories/pack.repository.test.ts`
- [x] **T13** (10 min) — Implementar `PackRepository` y `SqlitePackRepository` · `packages/api/src/repositories/pack.repository.ts`
- [x] **T14** (5 min) — Crear `MockPackRepository` · `packages/api/src/repositories/mocks/MockPackRepository.ts`
- [x] **T15** (10 min) — Tests: un pedido con ítems de pack se guarda y se lee con `packId`/`packName`/`packInstanceId`, `dishPrice` = precio guardado (pack en el primero, 0 en el resto) y los ítems normales sin campos de pack · `packages/api/src/repositories/order.repository.test.ts`
- [x] **T16** (10 min) — Insertar `order_item_packs` en `create` (con borrado del pedido si falla) y `LEFT JOIN` + `COALESCE` en `getOrderItems` · `packages/api/src/repositories/order.repository.ts`

**API: servicios**

- [x] **T17** (10 min) — Tests de `PackService.create/update` (validación, excluidos de otro restaurante → `InvalidPackError`, alcance por restaurante → `PackNotFoundError`) · `packages/api/src/services/pack.service.test.ts`
- [x] **T18** (10 min) — Implementar `PackService.create`, `update`, `findById`, `list`, `delete` · `packages/api/src/services/pack.service.ts`
- [x] **T19** (5 min) — Tests de `PackService.listPublic` (solo disponibles, platos elegibles por categoría, omite packs con una categoría vacía) · `packages/api/src/services/pack.service.test.ts`
- [x] **T20** (5 min) — Implementar `PackService.listPublic` · `packages/api/src/services/pack.service.ts`
- [x] **T21** (10 min) — Tests de validación de `packs` en `OrderService.create` (solo packs sin items, líneas totales, cantidad, notas, unidades, sin repositorio) · `packages/api/src/services/order.service.test.ts`
- [x] **T22** (10 min) — Validar la forma de `packs` y hacer `items` opcional en `validateItems` · `packages/api/src/services/order.service.ts`
- [x] **T23** (10 min) — Tests: pack inexistente/de otro restaurante/no disponible y selección inválida → `InvalidOrderError`; pack válido se expande en ítems con precio en el primero · `packages/api/src/services/order.service.test.ts`
- [x] **T24** (10 min) — Implementar la resolución y expansión de packs en `create` (4.º parámetro `packRepository?`) · `packages/api/src/services/order.service.ts`
- [x] **T25** (5 min) — Test: `BillService` calcula el subtotal = precio del pack + platos sueltos en un pedido mixto (con `MockOrderRepository`) · `packages/api/src/services/bill.service.test.ts`

**API: controladores, rutas y montaje**

- [x] **T26** (10 min) — Tests de rutas de gestión (401, 403 por rol y por restaurante, 201, 400, 404, listado, PUT, DELETE 204) · `packages/api/src/routes/pack.routes.test.ts`
- [x] **T27** (10 min) — Implementar `PackController` (create, getAll, getById, update, delete con `next(error)`) · `packages/api/src/controllers/pack.controller.ts`
- [x] **T28** (5 min) — Implementar `createPackRouter(service)` con guard admin/manager · `packages/api/src/routes/pack.routes.ts`
- [x] **T29** (5 min) — Tests de la ruta pública (200 sin token, sin `excludedDishIds`) · `packages/api/src/routes/pack.public.routes.test.ts`
- [x] **T30** (5 min) — Implementar `getPublic` en el controlador y `createPublicPackRouter(service)` · `packages/api/src/routes/pack.public.routes.ts`
- [x] **T31** (5 min) — Test de `POST /orders` con `packs` (201 y 400 con selección inválida) · `packages/api/src/routes/order.routes.test.ts`
- [x] **T32** (5 min) — Pasar `packs` del body en `OrderController.createOrder` y cablear `SqlitePackRepository` en el router por defecto · `packages/api/src/controllers/order.controller.ts`, `packages/api/src/routes/order.routes.ts`
- [x] **T33** (5 min) — Test de montaje (rutas de packs protegidas y pública accesible) · `packages/api/src/app.test.ts`
- [x] **T34** (5 min) — Montar `/api/v1/restaurants/:restaurantId/packs` y `/api/v1/public/restaurants/:restaurantId/packs` · `packages/api/src/app.ts`
- [x] **T35** (5 min) — Añadir pack de ejemplo "Menú del día" (entrante + principal + bebida, 18 €, excluye "Refresco de Cola") en `rest-1` · `packages/api/src/scripts/seed.ts`

**web-admin**

- [x] **T36** (5 min) — Modelo y servicio HTTP de packs · `packages/web-admin/src/app/features/packs/models/pack.model.ts`, `services/pack.service.ts`
- [x] **T37** (5 min) — Store de packs con signals · `packages/web-admin/src/app/features/packs/store/pack.store.ts`
- [x] **T38** (10 min) — Página de listado (tabla, editar, borrar) · `packages/web-admin/src/app/features/packs/pages/pack-list/`
- [x] **T39** (10 min) — Formulario: campos básicos y categorías · `packages/web-admin/src/app/features/packs/pages/pack-form/`
- [x] **T40** (10 min) — Formulario: platos elegibles por categoría (checkbox = elegible) y guardado de `excludedDishIds` · `packages/web-admin/src/app/features/packs/pages/pack-form/`
- [x] **T41** (5 min) — Rutas de la feature, ruta en `app.routes.ts`, tarjeta en el panel e icono `Boxes` · `packages/web-admin/src/app/features/packs/packs.routes.ts`, `app.routes.ts`, `app.config.ts`, `restaurant-dashboard.component.html`
- [x] **T42** (5 min) — Build de `web-admin` · `npm run build -w @resttek/web-admin`

**web-clientes**

- [x] **T43** (5 min) — Modelo `PublicPack` y `PackService` · `packages/web-clientes/src/app/core/models/pack.model.ts`, `core/services/pack.service.ts`
- [x] **T44** (10 min) — Packs en `CartStore` (`addPack`, `updatePackQuantity`, `removePack`, total, contador, vaciado) · `packages/web-clientes/src/app/core/store/cart.store.ts`
- [x] **T45** (10 min) — Sección "Packs" en la carta con un selector por categoría y resumen lateral · `packages/web-clientes/src/app/features/menu/restaurant-menu.component.ts`
- [x] **T46** (10 min) — Packs en el carrito y envío de `packs` al confirmar (`OrderService.createOrder` con parámetro `packs`) · `packages/web-clientes/src/app/features/cart/cart.component.ts`, `core/services/order.service.ts`
- [x] **T47** (10 min) — Campos de pack en `OrderItem` y agrupación por pack en el detalle del pedido · `packages/web-clientes/src/app/core/models/order.model.ts`, `features/orders/order-detail.component.ts`
- [x] **T48** (5 min) — Build de `web-clientes` · `npm run build -w @resttek/web-clientes`

**Verificación y documentación**

- [x] **T49** (5 min) — Suite completa (`npm test`) y build de `web-empleados` (regresión del tipo `OrderItem`) · raíz
- [x] **T50** (10 min) — Verificación con `curl` sobre copia de la BD (`PORT=3997`): crear pack, listado público, pedido con pack y cuenta con subtotal = precio del pack · —
- [x] **T51** (5 min) — Documentar endpoints y diseño de precio en la arquitectura de la API · `docs/arquitectura/arquitectura-api.md`
- [x] **T52** (5 min) — Documentar tablas nuevas y glosario (Pack, categoría de pack, plato excluido) · `docs/dominio/modelo-datos.md`, `docs/dominio/glosario.md`
- [x] **T53** (5 min) — Añadir una línea sobre packs en la sección de pedidos · `CLAUDE.md`

Total: 53 tareas, unas 6 h 50 min.

## 6. Verificación

**Tests (Vitest, junto al código):** `pack.model.test.ts`, `pack.repository.test.ts`, `pack.service.test.ts`, `pack.routes.test.ts`, `pack.public.routes.test.ts` (nuevos) y casos añadidos en `database.test.ts`, `order.repository.test.ts`, `order.service.test.ts`, `order.routes.test.ts`, `bill.service.test.ts` y `app.test.ts`. La suite completa (`npm test`) debe seguir en verde.

**Peticiones de ejemplo** (API en `PORT=3997` sobre una copia de la BD):

```bash
TOKEN=$(curl -s -X POST localhost:3997/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@resttek.com","password":"admin@resttek.com"}' | jq -r .token)

# Crear pack → 201
curl -s -X POST localhost:3997/api/v1/restaurants/rest-1/packs -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Menú","price":20,"categories":["entrante","principal","bebida"],"excludedDishIds":["<id-cola>"]}'

# Listado público → 200, sin el plato excluido en "bebida"
curl -s localhost:3997/api/v1/public/restaurants/rest-1/packs

# Pedido con el pack (cliente con mesa ocupada) → 201; y cuenta → subtotal 20
curl -s -X POST localhost:3997/api/v1/orders -H "Authorization: Bearer $CLIENT" -H 'Content-Type: application/json' \
  -d '{"restaurantId":"rest-1","tableId":"<mesa>","packs":[{"packId":"<pack>","dishIds":["<entrante>","<principal>","<agua>"],"quantity":1}]}'
curl -s -X POST localhost:3997/api/v1/orders/<pedido>/bill -H "Authorization: Bearer $CLIENT" -H 'Content-Type: application/json' -d '{}'
```

**Casos límite:** plato excluido o de otra categoría en la selección → 400; dos platos de la misma categoría → 400; pack de otro restaurante → 400 en pedidos y 404 en gestión; pack no disponible → 400; `manager` de otro restaurante → 403; borrar un plato que está excluido en un pack → 204.

**Regresiones a vigilar:** pedidos sin packs (mismos mensajes y respuesta sin campos nuevos), cálculo de la cuenta, descuentos y puntos, transiciones de estado de cocina/barra.

**Frontends:** `npm run build -w @resttek/web-admin`, `-w @resttek/web-clientes` y `-w @resttek/web-empleados` (no hay tests). La comprobación en navegador no se puede hacer en este entorno (puertos de desarrollo en uso por el usuario).

## 7. Riesgos y dudas abiertas

- **Roles de gestión:** la issue habla de "administradores"; se permite a `admin` y `manager` (con `requireRestaurantAccess`), igual que la carta de platos y los códigos de descuento. Si solo debe ser `admin`, basta con cambiar el guard.
- **Restricción por lista negra:** "bloquear la cerveza" se modela como platos excluidos por pack; los platos nuevos de una categoría quedan elegibles por defecto.
- **Una unidad por categoría:** un pack no puede pedir dos platos de la misma categoría (p. ej. "2 principales"). Ampliable con una cantidad por categoría.
- **Reparto del precio:** el precio del pack se guarda entero en el primer ítem y 0 en el resto. La cuenta, los descuentos y los puntos son correctos, pero quien lea ítems sueltos (p. ej. `my-orders` o `web-empleados`) verá platos a 0 €; `order-detail` agrupa por pack para mostrarlo bien.
- **Precio congelado:** el precio del pack se copia al pedido; los platos sueltos siguen usando el precio actual del plato (comportamiento existente, no se cambia).
- **Sin transacciones:** la inserción de `order_item_packs` sigue el patrón actual (sentencia única + borrado del pedido si falla).
- **Conflictos de merge con la PR de la issue #7 (puntos):** se tocan de forma aditiva `DomainErrors.ts`, `errorHandler.ts`, `database.ts`, `app.ts`, `seed.ts`, `web-admin` (`app.routes.ts`, `app.config.ts`, panel), `CLAUDE.md` y docs; los conflictos deberían ser triviales (líneas añadidas en el mismo punto). `BillService` no se toca.
- **Seed sobre BD nueva:** sigue el gotcha conocido (`FOREIGN KEY constraint failed`); el pack de ejemplo usa `INSERT OR IGNORE` y busca los platos por nombre.
- **Sin verificación en navegador:** las pantallas solo se comprueban con el build.
