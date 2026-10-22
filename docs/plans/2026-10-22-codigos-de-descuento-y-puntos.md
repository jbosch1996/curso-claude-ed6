<!-- plan-feature -->
# Plan: Códigos de descuento y canje de puntos al pedir la cuenta

- **Tipo:** feature
- **Fecha:** 2026-10-22
- **Estado:** Implementado (T1-T44) en la rama `feature/codigos-de-descuento-y-puntos`

**Desviaciones de la implementación:**

- **T1:** se añadió también `OrderNotFoundError` a `NOT_FOUND_ERRORS` del `errorHandler` (las rutas de cuenta delegan en él y, si no, un pedido ajeno daba 400).
- **T2:** no se añadió el test sobre una base con "tabla antigua" porque `CREATE TABLE IF NOT EXISTS` crea las tablas nuevas en una base existente; se comprobó a mano sobre una copia de la BD de desarrollo.
- **T25:** se añadió `app.test.ts` (rutas montadas y protegidas) para poder hacer TDD del montaje.
- **T41:** verificación con `curl` hecha (códigos, equivalencias, cuenta con código y con puntos, 400/403/404/401). La UI de `web-admin` y `web-clientes` solo se verificó con el build, no en el navegador.

## 1. Contexto

- **Issue:** #8 — Códigos de descuentos (https://github.com/jbosch1996/curso-claude-ed6/issues/8)

La issue pide: (1) un CRUD para que el administrador de un restaurante genere códigos de descuento; (2) que los clientes puedan añadir un código al pedir la cuenta; (3) que los clientes con puntos puedan canjearlos como descuento al pedir la cuenta, con una tabla de equivalencias creada por el administrador (10 puntos = 1 €, 100 puntos = 10 €…).

Hoy no existe nada de esto: no hay concepto de "cuenta" (el cliente solo ve un ticket calculado en `order-detail.component.ts`), no hay saldo de puntos y no hay descuentos. Los clientes son filas de `employees` con rol `cliente` y los pedidos guardan `client_id` (sin FK).

**Decisiones tomadas con el usuario:**

- "Pedir la cuenta" es un endpoint por pedido (`POST /orders/:orderId/bill`) que calcula y **guarda** la cuenta (subtotal, descuentos, total). Solo una vez por pedido.
- Los puntos se ganan a razón de **1 punto por cada euro del total pagado** (parte entera), al pedir la cuenta.
- Códigos y puntos son **por restaurante**.
- Un código tiene: código, tipo (`percent` o `fixed`), valor, caducidad opcional y activo. Sin límite de usos.

**Supuestos propios (a confirmar en la PR):** los usuarios `admin` y `manager` gestionan códigos y equivalencias (igual que los platos); un código y un canje de puntos se pueden combinar en la misma cuenta; se puede pedir la cuenta aunque haya platos sin entregar.

## 2. Objetivo y alcance

**Incluye:**

- CRUD de códigos de descuento por restaurante (API + `web-admin`).
- CRUD de equivalencias puntos → euros por restaurante (API + `web-admin`).
- Saldo de puntos por cliente y restaurante, que se acumula al pedir la cuenta.
- Endpoint para pedir la cuenta con código y/o canje de puntos, y para consultarla (API + `web-clientes`).
- Endpoint para que el cliente vea su saldo y las equivalencias del restaurante.
- Tests (Vitest) de modelos, repositorios, servicios y rutas.

**No incluye:**

- Límite de usos de un código o de un uso por cliente.
- Endpoint de "previsualizar" el descuento sin pedir la cuenta.
- Pago real ni integración con pasarela.
- Historial de movimientos de puntos ni pantalla de saldo fuera del detalle del pedido.
- Cambios en `web-empleados` y `web-shared`.
- Transacciones SQL (la conexión SQLite es compartida; se usan sentencias atómicas condicionales, como ya hace `order.repository.ts`).

## 3. Análisis del código actual

La API pertenece al estilo **por capas** (`routes → controllers → services → repositories`, `models`), igual que `dish`/`order`. Los frontends son `web-admin` (por feature: `models/pages/services/store`) y `web-clientes` (modelos y servicios en `core/`).

Referencias comprobadas: `packages/api/src/config/database.ts` (DDL en `runInitialMigrations`, `PRAGMA foreign_keys = ON`), `routes/dish.routes.ts` (patrón de rutas con `authorize` + `requireRestaurantAccess`), `controllers/dish.controller.ts` (errores con `next(error)`), `contexts/shared/infrastructure/http/errorHandler.ts` (lista `NOT_FOUND_ERRORS`; el resto de `AppError` es 400), `routes/order.routes.ts` (factory `createOrderRouter`), `services/order.service.ts` (`OrderActor`, propietario del pedido por `clientId`), `repositories/mocks/` (mocks para los tests de servicio), `models/validation.ts`.

| Paquete / capa | Archivo | Cambio previsto |
|----------------|---------|-----------------|
| api / errors | `packages/api/src/errors/DomainErrors.ts` | Errores nuevos de códigos, equivalencias y cuenta |
| api / shared | `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts` | Añadir los `*NotFoundError` nuevos a `NOT_FOUND_ERRORS` |
| api / config | `packages/api/src/config/database.ts` | Tablas `discount_codes`, `points_rules`, `client_points`, `bills` |
| api / models | `models/discount-code.model.ts`, `points-rule.model.ts`, `bill.model.ts` (nuevos) | Validación y cálculo puro |
| api / repositories | `repositories/discount-code…`, `points-rule…`, `client-points…`, `bill…` + mocks (nuevos) | Persistencia SQLite |
| api / services | `services/discount-code…`, `points-rule…`, `bill…`, `loyalty…` (nuevos) | Reglas de negocio |
| api / controllers y routes | `controllers/*` y `routes/*` nuevos; `app.ts` | Montaje de rutas |
| api / scripts | `scripts/seed.ts` | Datos de ejemplo (idempotente) |
| web-admin | `features/discounts/{models,services,store,pages}`, `app.routes.ts`, dashboard del restaurante | Gestión de códigos y equivalencias |
| web-clientes | `core/models`, `core/services`, `features/orders/order-detail.component.ts` | Pedir la cuenta, canjear puntos, ver la cuenta |
| docs | `docs/arquitectura/arquitectura-api.md`, `docs/dominio/modelo-datos.md`, `docs/dominio/glosario.md`, `CLAUDE.md` | Documentar |

## 4. Diseño de la solución

### Datos (SQLite)

- `discount_codes(id, restaurant_id FK, code, type, value REAL, expires_at TEXT NULL, active INTEGER DEFAULT 1, created_at, updated_at, UNIQUE(restaurant_id, code))`
- `points_rules(id, restaurant_id FK, points INTEGER, discount REAL, created_at, UNIQUE(restaurant_id, points))` — cada fila es un escalón canjeable ("100 puntos = 10 €").
- `client_points(client_id, restaurant_id FK, balance INTEGER DEFAULT 0, PRIMARY KEY(client_id, restaurant_id))`, `CHECK(balance >= 0)`.
- `bills(id, order_id UNIQUE FK ON DELETE CASCADE, restaurant_id, client_id, subtotal, discount_code_id NULL, code_discount, points_used, points_discount, total, points_earned, created_at)`.

### Validación (modelos)

- Código: se normaliza (`trim` + mayúsculas), 3-30 caracteres `[A-Z0-9_-]`. `type` ∈ `percent | fixed`. `percent`: 0 < valor ≤ 100. `fixed`: valor > 0 (`assertPositiveNumber`). `expiresAt`: opcional, fecha ISO válida.
- Equivalencia: `points` entero > 0 y `discount` > 0.
- Importes en euros redondeados a 2 decimales. Puntos ganados = `floor(total)`.

### Pedir la cuenta (`BillService.create`)

1. El pedido debe existir y ser del cliente del JWT; si no, `OrderNotFoundError` (404, sin filtrar existencia). Una sola cuenta por pedido (`BillAlreadyRequestedError`, 400).
2. `subtotal` = suma de `dishPrice` de los ítems.
3. Si llega `discountCode`: debe existir en el restaurante del pedido, estar activo y no caducado; si no, `InvalidDiscountCodeError` con mensaje único `Invalid or expired discount code` (no distingue causas).
4. Si llega `pointsRuleId`: debe ser del restaurante; el cliente debe tener saldo suficiente (`InsufficientPointsError`) y el descuento no puede superar lo que queda por pagar tras el código (`InvalidBillError`).
5. `total = subtotal − descuento de código − descuento de puntos` (nunca negativo; el descuento por código se limita al subtotal).
6. Persistencia sin transacciones: se inserta la cuenta (`UNIQUE(order_id)` evita duplicados concurrentes); se descuentan los puntos con `UPDATE … SET balance = balance - ? WHERE … AND balance >= ?` (si no afecta a ninguna fila, se borra la cuenta y se lanza `InsufficientPointsError`); se suman los puntos ganados.

### Endpoints (todos bajo `/api/v1`)

| Método y ruta | Acceso | Descripción |
|---------------|--------|-------------|
| `POST /restaurants/:restaurantId/discount-codes` | admin, manager + `requireRestaurantAccess` | Crear (201) |
| `GET /restaurants/:restaurantId/discount-codes` | ídem | Listar |
| `GET /restaurants/:restaurantId/discount-codes/:id` | ídem | Detalle (404 si es de otro restaurante) |
| `PUT /restaurants/:restaurantId/discount-codes/:id` | ídem | Actualizar |
| `DELETE /restaurants/:restaurantId/discount-codes/:id` | ídem | Borrar (204) |
| `POST/GET/PUT/DELETE /restaurants/:restaurantId/points-rules[/:id]` | ídem | CRUD de equivalencias |
| `GET /loyalty/:restaurantId` | autenticado | `{ balance, rules }` del cliente del JWT |
| `POST /orders/:orderId/bill` | autenticado (propietario) | Body `{ discountCode?, pointsRuleId? }`; devuelve la cuenta (201) |
| `GET /orders/:orderId/bill` | autenticado (propietario o personal del restaurante) | Cuenta del pedido; 404 si no existe |

Errores: los `AppError` nuevos usan los mensajes de dominio en inglés; los "no encontrado" se añaden a `NOT_FOUND_ERRORS` (404) y el resto son 400, como el resto de la API. No se paginan los listados (son pequeños y el proyecto no tiene convención de paginación en estos recursos).

### Frontends

- **web-admin:** nueva feature `discounts` colgando de `restaurants/:restaurantId`: listado y formulario de códigos, y una página de equivalencias de puntos con alta/edición/borrado. Tarjetas nuevas en el panel del restaurante.
- **web-clientes:** en el detalle del pedido, un panel "Pedir la cuenta" (campo de código, selector de canje de puntos con el saldo del cliente) y, una vez pedida, el desglose (subtotal, descuentos, total, puntos ganados) en lugar del total calculado en cliente. Usa `.subscribe()` directo, como el resto de la app.

## 5. Lista de tareas

> Cada tarea debe poder completarse en 5-10 minutos. Las que cambian comportamiento incluyen su test (`*.test.ts` junto al código).

**API — base**

- [x] **T1** (5 min) — Añadir errores `DiscountCodeNotFoundError`, `InvalidDiscountCodeError`, `DuplicatedDiscountCodeError`, `PointsRuleNotFoundError`, `InvalidPointsRuleError`, `DuplicatedPointsRuleError`, `InsufficientPointsError`, `BillNotFoundError`, `BillAlreadyRequestedError`, `InvalidBillError`, y registrar los `*NotFoundError` en `NOT_FOUND_ERRORS` · `packages/api/src/errors/DomainErrors.ts`, `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts`
- [x] **T2** (10 min) — Crear las cuatro tablas en `runInitialMigrations` y test de que existen y respetan las restricciones (UNIQUE, CHECK de saldo) · `packages/api/src/config/database.ts`, `packages/api/src/config/database.test.ts`
- [x] **T3** (10 min) — Modelo de código de descuento: tipos, `normalizeCode`, validación de tipo/valor/caducidad y `isCodeRedeemable(code, now)` · `packages/api/src/models/discount-code.model.ts` (+ test)
- [x] **T4** (5 min) — Modelo de equivalencia de puntos con su validación · `packages/api/src/models/points-rule.model.ts` (+ test)
- [x] **T5** (10 min) — Modelo de cuenta: `computeCodeDiscount`, `roundMoney`, `earnedPoints` y cálculo del total sin negativos · `packages/api/src/models/bill.model.ts` (+ test)

**API — repositorios**

- [x] **T6** (10 min) — Repositorio de códigos de descuento (create, findById por restaurante, listar, findByCode, update, delete) con test de integración en memoria · `packages/api/src/repositories/discount-code.repository.ts` (+ test)
- [x] **T7** (5 min) — Mock del repositorio de códigos · `packages/api/src/repositories/mocks/MockDiscountCodeRepository.ts`
- [x] **T8** (10 min) — Repositorio de equivalencias de puntos con test de integración · `packages/api/src/repositories/points-rule.repository.ts` (+ test)
- [x] **T9** (5 min) — Mock del repositorio de equivalencias · `packages/api/src/repositories/mocks/MockPointsRuleRepository.ts`
- [x] **T10** (10 min) — Repositorio de saldo de puntos (`getBalance`, `add`, `tryDeduct` atómico) con test de que no permite saldo negativo · `packages/api/src/repositories/client-points.repository.ts` (+ test)
- [x] **T11** (5 min) — Mock del repositorio de saldo · `packages/api/src/repositories/mocks/MockClientPointsRepository.ts`
- [x] **T12** (10 min) — Repositorio de cuentas (`create`, `findByOrderId`, `delete`) con test que verifica `UNIQUE(order_id)` · `packages/api/src/repositories/bill.repository.ts` (+ test)
- [x] **T13** (5 min) — Mock del repositorio de cuentas · `packages/api/src/repositories/mocks/MockBillRepository.ts`

**API — servicios**

- [x] **T14** (10 min) — `DiscountCodeService` CRUD: normaliza el código, rechaza duplicados por restaurante y trata un código de otro restaurante como inexistente · `packages/api/src/services/discount-code.service.ts` (+ test)
- [x] **T15** (10 min) — `PointsRuleService` CRUD con las mismas garantías de ámbito y duplicados · `packages/api/src/services/points-rule.service.ts` (+ test)
- [x] **T16** (10 min) — `BillService.create` sin descuentos: propietario, una cuenta por pedido, subtotal, total y puntos ganados · `packages/api/src/services/bill.service.ts` (+ test)
- [x] **T17** (10 min) — `BillService.create` con código: existente, activo, no caducado y del restaurante; porcentaje y fijo; mensaje único de código inválido · `packages/api/src/services/bill.service.ts` (+ test)
- [x] **T18** (10 min) — `BillService.create` con canje de puntos: equivalencia del restaurante, saldo suficiente, tope por lo que queda por pagar, combinación con código y deshacer la cuenta si el descuento de saldo falla · `packages/api/src/services/bill.service.ts` (+ test)
- [x] **T19** (5 min) — `BillService.getByOrderId` (propietario o personal del restaurante; resto, 404) · `packages/api/src/services/bill.service.ts` (+ test)
- [x] **T20** (5 min) — `LoyaltyService.getSummary(clientId, restaurantId)` con saldo y equivalencias ordenadas por puntos · `packages/api/src/services/loyalty.service.ts` (+ test)

**API — controladores y rutas**

- [x] **T21** (10 min) — Controlador y router (factory) de códigos de descuento con `authorize(['admin','manager'])` + `requireRestaurantAccess()`; tests de ruta: 401, 403, otro restaurante, 201, 404, 204 · `packages/api/src/controllers/discount-code.controller.ts`, `packages/api/src/routes/discount-code.routes.ts` (+ test)
- [x] **T22** (10 min) — Controlador y router de equivalencias de puntos con sus tests de ruta · `packages/api/src/controllers/points-rule.controller.ts`, `packages/api/src/routes/points-rule.routes.ts` (+ test)
- [x] **T23** (10 min) — Controlador y router de la cuenta (`POST` y `GET /orders/:orderId/bill`) con tests de ruta (401, propietario, otro cliente 404, doble petición 400) · `packages/api/src/controllers/bill.controller.ts`, `packages/api/src/routes/bill.routes.ts` (+ test)
- [x] **T24** (5 min) — Controlador y router `GET /loyalty/:restaurantId` con test · `packages/api/src/controllers/loyalty.controller.ts`, `packages/api/src/routes/loyalty.routes.ts` (+ test)
- [x] **T25** (5 min) — Montar las rutas nuevas en `app.ts` (la de la cuenta antes de `orderRoutes`) · `packages/api/src/app.ts`
- [x] **T26** (5 min) — Datos seed idempotentes: un código y dos equivalencias por restaurante de ejemplo · `packages/api/src/scripts/seed.ts`

**web-admin**

- [x] **T27** (5 min) — Modelos `DiscountCode`, `CreateDiscountCodeDto`, `PointsRule`, `CreatePointsRuleDto` · `packages/web-admin/src/app/features/discounts/models/discount.model.ts`
- [x] **T28** (5 min) — Servicios HTTP de códigos y equivalencias · `packages/web-admin/src/app/features/discounts/services/discount.service.ts`
- [x] **T29** (10 min) — Store con signals para códigos y equivalencias (carga, alta, edición, borrado) · `packages/web-admin/src/app/features/discounts/store/discount.store.ts`
- [x] **T30** (10 min) — Página de listado de códigos (activar/desactivar, borrar) · `packages/web-admin/src/app/features/discounts/pages/discount-code-list/`
- [x] **T31** (10 min) — Formulario de código (alta y edición; tipo, valor, caducidad) · `packages/web-admin/src/app/features/discounts/pages/discount-code-form/`
- [x] **T32** (10 min) — Página de equivalencias de puntos (listado y alta/edición/borrado) · `packages/web-admin/src/app/features/discounts/pages/points-rules/`
- [x] **T33** (5 min) — Rutas de la feature y entrada en `restaurants/:restaurantId` · `packages/web-admin/src/app/features/discounts/discounts.routes.ts`, `packages/web-admin/src/app/app.routes.ts`
- [x] **T34** (5 min) — Tarjetas "Códigos de descuento" y "Puntos" en el panel del restaurante · `packages/web-admin/src/app/features/restaurants/pages/restaurant-dashboard/restaurant-dashboard.component.html`
- [x] **T35** (5 min) — Compilar: `npm run build -w @resttek/web-admin` y corregir errores

**web-clientes**

- [x] **T36** (5 min) — Modelos `Bill`, `LoyaltySummary` y `PointsRule` · `packages/web-clientes/src/app/core/models/bill.model.ts`
- [x] **T37** (5 min) — `BillService` (pedir cuenta, obtener cuenta, saldo del restaurante) · `packages/web-clientes/src/app/core/services/bill.service.ts`
- [x] **T38** (10 min) — Panel "Pedir la cuenta" en el detalle del pedido: código, selector de canje con saldo, envío y mensajes de error · `packages/web-clientes/src/app/features/orders/order-detail.component.ts`
- [x] **T39** (10 min) — Mostrar la cuenta pedida (subtotal, descuentos, total, puntos ganados), cargarla al abrir el pedido y ocultar el panel si ya existe · `packages/web-clientes/src/app/features/orders/order-detail.component.ts`
- [x] **T40** (5 min) — Compilar: `npm run build -w @resttek/web-clientes` y corregir errores

**Verificación y documentación**

- [x] **T41** (10 min) — Verificación manual con la API arrancada y `curl` (ver sección 6)
- [x] **T42** (5 min) — Ejecutar `npm test` completo y comprobar que no hay regresiones
- [x] **T43** (10 min) — Documentar endpoints, tablas y términos (código de descuento, equivalencia, cuenta, puntos) · `docs/arquitectura/arquitectura-api.md`, `docs/dominio/modelo-datos.md`, `docs/dominio/glosario.md`
- [x] **T44** (5 min) — Añadir a `CLAUDE.md` una nota sobre descuentos y puntos (tablas, `BillService`, ámbito por restaurante) · `CLAUDE.md`

## 6. Verificación

**Tests automáticos (Vitest, API):** modelos (validación y cálculo con redondeo), repositorios (restricciones UNIQUE/CHECK, `tryDeduct` atómico), servicios (ámbito por restaurante, propietario, código inválido/caducado/inactivo, saldo insuficiente, tope del descuento, combinación código + puntos, deshacer cuenta) y rutas (401/403/404/400/201/204). Los frontends no tienen tests: se verifican con `npm run build -w @resttek/<app>` y comprobación manual.

**Manual con `curl`** (usuarios seed: contraseña = email; tras `npm run seed` y `npm run dev:api`):

1. Login como admin → `POST /restaurants/:id/discount-codes` `{ "code": "verano10", "type": "percent", "value": 10 }` → `201` con `code: "VERANO10"`. Repetirlo → `400`.
2. Login como manager de otro restaurante → `GET /restaurants/:id/discount-codes` → `403`.
3. `POST /restaurants/:id/points-rules` `{ "points": 100, "discount": 10 }` → `201`.
4. Login como cliente, crear un pedido, `POST /orders/:id/bill` `{ "discountCode": "VERANO10" }` → `201` con `total = subtotal × 0,9` y `pointsEarned = floor(total)`; repetirlo → `400`.
5. Segundo pedido con `pointsRuleId` sin saldo suficiente → `400` (`InsufficientPointsError`); con saldo → total reducido y saldo descontado en `GET /loyalty/:restaurantId`.
6. Otro cliente `GET /orders/:id/bill` del pedido ajeno → `404`.
7. En `web-admin` (:4200) crear código y equivalencia; en `web-clientes` (:4202) pedir la cuenta con código y con puntos.

**Regresiones a vigilar:** creación y consulta de pedidos, transiciones de estado, `GET /orders/mine`, autorización de platos e ingredientes, y que el arranque de la API siga creando las tablas sobre una base ya existente (`CREATE TABLE IF NOT EXISTS`).

## 7. Riesgos y dudas abiertas

- **Roles:** el enunciado dice "admin de un restaurante"; se permite a `admin` y `manager` (como en platos). Si solo debe ser `admin`, cambiar el `authorize` de T21/T22.
- **Cuenta antes de entregar:** se permite pedirla con platos pendientes. Si debe exigirse que todo esté `entregado`, añadir esa validación en T16.
- **Concurrencia sin transacciones:** el reparto en pasos (cuenta → descuento de saldo → suma de puntos) puede dejar puntos ganados sin sumar si la API cae a mitad. Es aceptable en esta fase y coherente con `order.repository.ts`; migrar a transacciones es otra tarea.
- **Fraude de puntos:** como los puntos se ganan al pedir la cuenta, un cliente podría pedir pedidos y cuentas sin pagar. Queda fuera hasta que exista un flujo de pago.
- **Comprobación de totales:** los precios se toman del plato en el momento de pedir la cuenta; si el administrador cambia un precio entre el pedido y la cuenta, el subtotal cambia.
- **Seed en base nueva:** `npm run seed` ya falla en bases nuevas (ver `CLAUDE.md`); T26 solo se verifica sobre una base con restaurantes.
