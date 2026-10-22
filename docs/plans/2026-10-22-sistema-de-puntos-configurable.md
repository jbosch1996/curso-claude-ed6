<!-- plan-feature -->
# Plan: Ritmo de ganancia de puntos configurable por restaurante (X € → Y puntos)

- **Tipo:** feature
- **Fecha:** 2026-10-22
- **Estado:** Implementado

## 1. Contexto

- **Issue:** #7 — Implementar sistema de puntos (https://github.com/jbosch1996/curso-claude-ed6/issues/7)

La issue pide: "Implementar un sistema de puntos para los clientes. Por cada X€ gastados se llevan Y puntos."

**Qué ya existe** (fusionado con la PR #8/#11, ver `docs/funcional/2026-10-22-codigos-de-descuento-y-puntos.md`):

- Saldo de puntos por cliente y restaurante en la tabla `client_points` (`SqliteClientPointsRepository`: `getBalance`, `add`, `tryDeduct`).
- Al pedir la cuenta (`POST /api/v1/orders/:orderId/bill`, `BillService.create`) el cliente gana puntos con `earnedPoints(total)` de `packages/api/src/models/bill.model.ts`, que hoy es **fijo**: `Math.floor(total)` → 1 punto por euro pagado (parte entera). Se guarda en `bills.points_earned`.
- Canje de puntos mediante equivalencias `points_rules` (p. ej. "10 puntos = 1 €"), gestionadas por admin/manager en `/api/v1/restaurants/:restaurantId/points-rules` y en la página "Puntos de fidelidad" de `web-admin`.
- `GET /api/v1/loyalty/:restaurantId` devuelve saldo y escalones de canje al cliente.

**Qué falta:** que la "X" y la "Y" de la issue sean configurables por cada restaurante. Hoy X = 1 € e Y = 1 punto están fijados en el código. Este plan añade esa configuración (la gestionan admin y manager) y la aplica al calcular los puntos ganados. Un restaurante sin configuración sigue ganando 1 punto por euro, igual que ahora.

## 2. Objetivo y alcance

**Incluye:**

- Nueva tabla `points_earning_rates` (una fila por restaurante, opcional) con `amount` (X €) y `points` (Y puntos).
- Endpoints `GET` y `PUT /api/v1/restaurants/:restaurantId/points-earning` (admin y manager del restaurante) para consultar y fijar el ritmo de ganancia. `GET` devuelve el valor por defecto (1 € → 1 punto, `isDefault: true`) si el restaurante no lo ha configurado.
- Cálculo de puntos ganados al pedir la cuenta con la configuración del restaurante: `floor(total / X) * Y` (solo bloques completos de X €).
- Pequeña sección en la página existente "Puntos de fidelidad" de `web-admin` para ver y cambiar el ritmo, y corrección de su texto, que hoy afirma "1 punto por cada euro" (quedaría falso tras el cambio).
- Documentación: `docs/arquitectura/arquitectura-api.md`, `docs/dominio/modelo-datos.md`, `docs/dominio/glosario.md` y el diseño funcional.

**No incluye:**

- Historial de movimientos de puntos, caducidad de puntos, mínimo de gasto o máximo de puntos por cuenta (ya fuera de alcance en #8; no lo pide la issue).
- Recalcular puntos de cuentas ya pedidas: el cambio de ritmo solo afecta a cuentas nuevas (`bills.points_earned` guarda lo ganado en su momento).
- Mostrar el ritmo de ganancia en `web-clientes` o en `GET /loyalty/:restaurantId` (la cuenta ya muestra los puntos ganados; la issue solo lleva la etiqueta `proyecto:api`).
- Cambios en las equivalencias de canje (`points_rules`), en `web-empleados` o en el seed (sin fila, cada restaurante usa el valor por defecto).
- Endpoint `DELETE` para "volver al defecto": basta con `PUT { amount: 1, points: 1 }`.

## 3. Análisis del código actual

Todo es la API **por capas** (`models → repositories → services → controllers → routes`), mismo estilo que `points-rule` y `bill`, más la feature `discounts` de `web-admin` (organizada por `models/pages/services/store`).

| Paquete / capa | Archivo | Cambio previsto |
|------|---------|-----------------|
| api / config | `packages/api/src/config/database.ts` | Añadir `CREATE TABLE IF NOT EXISTS points_earning_rates` (insertado tras `bills`, sin tocar las demás tablas) |
| api / errors | `packages/api/src/errors/DomainErrors.ts` | Añadir `InvalidPointsEarningError` (400) al final del fichero |
| api / models | `packages/api/src/models/points-earning.model.ts` (nuevo) | Tipo `PointsEarningRate`, constante `DEFAULT_POINTS_EARNING` y `validatePointsEarning` |
| api / models | `packages/api/src/models/bill.model.ts` | `earnedPoints(total, rate = DEFAULT_POINTS_EARNING)`: parámetro opcional, por defecto el comportamiento actual |
| api / repositories | `packages/api/src/repositories/points-earning.repository.ts` (nuevo) + `mocks/MockPointsEarningRepository.ts` | `findByRestaurantId`, `save` (upsert) |
| api / services | `packages/api/src/services/points-earning.service.ts` (nuevo) | `get` (con defecto) y `update` (valida y guarda) |
| api / services | `packages/api/src/services/bill.service.ts` | Nueva dependencia opcional `PointsEarningRepository`; usa el ritmo del restaurante para `pointsEarned` |
| api / controllers | `packages/api/src/controllers/points-earning.controller.ts` (nuevo) | `get` y `update` |
| api / routes | `packages/api/src/routes/points-earning.routes.ts` (nuevo) | Factory `createPointsEarningRouter(service)` con `authenticate`, `authorize(['admin','manager'])`, `requireRestaurantAccess()` |
| api / routes | `packages/api/src/routes/bill.routes.ts` | Pasar `SqlitePointsEarningRepository` al `BillService` |
| api / app | `packages/api/src/app.ts` | Un `import` y un `app.use('/api/v1/restaurants/:restaurantId/points-earning', …)` |
| web-admin / discounts | `features/discounts/models/discount.model.ts`, `services/discount.service.ts`, `store/discount.store.ts`, `pages/points-rules/*` | Modelo, llamadas HTTP, estado y formulario "Ganancia de puntos" |

## 4. Diseño de la solución

**Esquema SQLite** (aditivo, `CREATE TABLE IF NOT EXISTS`, sirve para BD existentes):

```sql
CREATE TABLE IF NOT EXISTS points_earning_rates (
    restaurant_id TEXT PRIMARY KEY,
    amount REAL NOT NULL CHECK (amount > 0),
    points INTEGER NOT NULL CHECK (points > 0),
    updated_at TEXT NOT NULL,
    FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
);
```

**Modelo** (`points-earning.model.ts`):

- `PointsEarningRate { restaurantId, amount, points, isDefault, updatedAt: string | null }`.
- `DEFAULT_POINTS_EARNING = { amount: 1, points: 1 }`.
- `validatePointsEarning({ amount, points })`:
  - `amount`: número positivo (`assertPositiveNumber`), redondeado a céntimos con `roundMoney`; tras redondear debe ser ≥ 0,01 y ≤ 10.000 → si no, `InvalidPointsEarningError('Amount must be a positive number up to 10000 with at most 2 decimals')`.
  - `points`: entero positivo ≤ 10.000 → si no, `InvalidPointsEarningError('Points must be a positive integer up to 10000')`.

**Cálculo** (`bill.model.ts`): `earnedPoints(total, rate = DEFAULT_POINTS_EARNING)` = `Math.floor(cents(total) / cents(rate.amount)) * rate.points`, trabajando en céntimos enteros (`Math.round(x * 100)`) para evitar errores de coma flotante (p. ej. 0,30 / 0,10). Con el defecto da exactamente `Math.floor(total)` para importes con 2 decimales, así que los tests actuales de `earnedPoints` y `BillService` no cambian. Ejemplo: X = 10 €, Y = 3 → 25,99 € dan 6 puntos; 9,99 € dan 0.

- Base del cálculo: el **total pagado tras descuentos** (igual que hoy).
- Redondeo: **hacia abajo, solo bloques completos** (opción conservadora, coherente con la "parte entera" actual).

**`BillService`**: el constructor recibe un sexto parámetro **opcional** `pointsEarningRepository?: PointsEarningRepository`. En `create` se lee `findByRestaurantId(order.restaurantId)`; si no hay fila (o no hay repositorio), se usa `DEFAULT_POINTS_EARNING`. Así los tests existentes que construyen `BillService` con cinco argumentos siguen pasando sin modificarse.

**Endpoints** (router con `mergeParams`, guard `authenticate, authorize(['admin', 'manager']), requireRestaurantAccess()`, como `points-rules`):

| Método | Ruta | Respuesta |
|--------|------|-----------|
| `GET` | `/api/v1/restaurants/:restaurantId/points-earning` | 200 `{ restaurantId, amount, points, isDefault, updatedAt }` (defecto `{ amount: 1, points: 1, isDefault: true, updatedAt: null }`) |
| `PUT` | `/api/v1/restaurants/:restaurantId/points-earning` | body `{ amount, points }` → 200 con el ritmo guardado (`isDefault: false`); 400 `InvalidPointsEarningError` si los datos no son válidos |

Errores: 401 sin token, 403 `Forbidden: Insufficient permissions` para cliente/camarero/cocinero, 403 `Forbidden: No access to this restaurant` para un manager de otro restaurante. No se comprueba que el restaurante exista (igual que `points-rules`); un `PUT` sobre un id inexistente falla por la FK → ver riesgos.

**web-admin**: en la página "Puntos de fidelidad" se sustituye el texto fijo por una tarjeta "Ganancia de puntos" con dos campos ("Por cada (€)" y "Puntos") y botón "Guardar", que muestra el valor actual (y si es el de por defecto). Es imprescindible tocarla porque su texto actual ("1 punto por cada euro") sería incorrecto, y es el único modo práctico para que el manager configure el ritmo. No se añaden rutas ni entradas de menú (no se tocan `app.routes.ts`, `app.config.ts` ni el dashboard).

## 5. Lista de tareas

> Cada tarea debe poder completarse en 5-10 minutos. Si una tarea es mayor, divídela.

- [x] **T1** (5 min) — Añadir `InvalidPointsEarningError` al final de `DomainErrors.ts` · `packages/api/src/errors/DomainErrors.ts`
- [x] **T2** (10 min) — Test + implementación de `PointsEarningRate`, `DEFAULT_POINTS_EARNING` y `validatePointsEarning` · `packages/api/src/models/points-earning.model.ts` (+ `.test.ts`)
- [x] **T3** (10 min) — Test + `earnedPoints(total, rate?)` en céntimos con ritmo opcional (casos 10 € → 3, 0,10 € → 1, defecto sin cambios) · `packages/api/src/models/bill.model.ts` (+ `bill.model.test.ts`, solo añadiendo casos)
- [x] **T4** (5 min) — Añadir la tabla `points_earning_rates` a las migraciones (test en `database.test.ts` de que existe) · `packages/api/src/config/database.ts`
- [x] **T5** (10 min) — Test + `SqlitePointsEarningRepository` (`findByRestaurantId`, `save` con upsert) · `packages/api/src/repositories/points-earning.repository.ts`
- [x] **T6** (5 min) — `MockPointsEarningRepository` · `packages/api/src/repositories/mocks/MockPointsEarningRepository.ts`
- [x] **T7** (10 min) — Test + `PointsEarningService.get` (defecto e `isDefault`) y `update` (valida y guarda) · `packages/api/src/services/points-earning.service.ts`
- [x] **T8** (10 min) — Test + `BillService` con repositorio de ritmo opcional: usa el ritmo del restaurante, el defecto sin fila y no suma puntos si salen 0 · `packages/api/src/services/bill.service.ts`
- [x] **T9** (5 min) — `PointsEarningController` (`get`, `update`) · `packages/api/src/controllers/points-earning.controller.ts`
- [x] **T10** (10 min) — Test + `createPointsEarningRouter` (401, 403 por rol y por restaurante, 200 GET defecto, 200 PUT, 400 inválido, admin en cualquier restaurante) · `packages/api/src/routes/points-earning.routes.ts`
- [x] **T11** (5 min) — Montar la ruta en `app.ts` y cablear `SqlitePointsEarningRepository` en `bill.routes.ts` · `packages/api/src/app.ts`, `packages/api/src/routes/bill.routes.ts`
- [x] **T12** (5 min) — Ejecutar la suite completa (`npm test`) y `npx tsc --noEmit` en la API · `packages/api`
- [x] **T13** (5 min) — web-admin: modelo `PointsEarningRate`/`UpdatePointsEarningDto` y métodos `getEarning`/`updateEarning` · `features/discounts/models/discount.model.ts`, `features/discounts/services/discount.service.ts`
- [x] **T14** (5 min) — web-admin: estado `earning` y métodos `loadEarning`/`updateEarning` en el store · `features/discounts/store/discount.store.ts`
- [x] **T15** (10 min) — web-admin: tarjeta "Ganancia de puntos" y nuevo texto en la página · `features/discounts/pages/points-rules/points-rules.component.{ts,html,css}`
- [x] **T16** (5 min) — `npm run build -w @resttek/web-admin` · `packages/web-admin`
- [x] **T17** (10 min) — Verificación manual con `curl` contra la API en `PORT=3996` y una copia de la BD · —
- [x] **T18** (10 min) — Documentación: endpoints y regla de cálculo en arquitectura, tabla en modelo de datos y glosario · `docs/arquitectura/arquitectura-api.md`, `docs/dominio/modelo-datos.md`, `docs/dominio/glosario.md`

Tiempo total estimado: 2 h 10 min.

## 6. Verificación

**Tests (Vitest, junto al código):**

- `points-earning.model.test.ts`: acepta `{ 10, 3 }` y `{ 0.5, 1 }`; redondea `amount` a céntimos; rechaza `amount` 0, negativo, no numérico, < 0,01 tras redondear o > 10.000; rechaza `points` 0, decimal, negativo o > 10.000.
- `bill.model.test.ts` (solo casos nuevos): `earnedPoints(25.99, { amount: 10, points: 3 })` = 6; `earnedPoints(9.99, { amount: 10, points: 3 })` = 0; `earnedPoints(0.3, { amount: 0.1, points: 1 })` = 3 (sin error de coma flotante). El test actual ("un punto por euro") debe seguir pasando sin tocarlo.
- `points-earning.repository.test.ts`: `null` sin fila; `save` inserta y vuelve a guardar actualizando.
- `points-earning.service.test.ts`: `get` devuelve el defecto con `isDefault: true`; tras `update`, `isDefault: false` y los nuevos valores; `update` con datos inválidos lanza `InvalidPointsEarningError`.
- `bill.service.test.ts` (casos nuevos en un `describe` aparte): con ritmo 10 € → 5 puntos y total 30 € gana 15 y suma 15 al saldo; con 50 € → 1 punto y total 30 € gana 0 y no suma; sin fila usa 1 punto por euro.
- `points-earning.routes.test.ts`: permisos y respuestas de la tabla de endpoints.
- Regresión: la suite existente (`npm test`) pasa sin modificar ningún test previo.

**Manual (API en `PORT=3996` con copia de la BD en el worktree):**

```bash
TOKEN=$(curl -s -X POST localhost:3996/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<manager>","password":"<manager>"}' | jq -r .token)
curl -s localhost:3996/api/v1/restaurants/<rid>/points-earning -H "Authorization: Bearer $TOKEN"
# → { amount: 1, points: 1, isDefault: true, ... }
curl -s -X PUT localhost:3996/api/v1/restaurants/<rid>/points-earning -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"amount":10,"points":3}'
# → 200 { amount: 10, points: 3, isDefault: false }
curl -s -X PUT ... -d '{"amount":0,"points":3}'   # → 400 InvalidPointsEarningError
```

Después, con un cliente, crear un pedido y pedir la cuenta: `pointsEarned` = `floor(total / 10) * 3`.

**Frontend:** `npm run build -w @resttek/web-admin` sin errores (no hay tests en los frontends; la comprobación visual no se puede hacer sin arrancar el dev server en un puerto propio).

## 7. Riesgos y dudas abiertas

- **Huecos de la issue (decididos de forma conservadora):** redondeo hacia abajo por bloques completos de X €; base = total pagado tras descuentos (como hoy); sin mínimo de gasto ni tope de puntos; sin historial de movimientos; el cambio de ritmo no es retroactivo. Límites de validación (X entre 0,01 y 10.000 €, Y entero entre 1 y 10.000) elegidos para evitar valores absurdos; el responsable de producto debería confirmarlos.
- **Quién configura:** admin y manager (igual que las equivalencias de canje). Si se quisiera un ritmo global para toda la plataforma, este diseño no lo cubre.
- **Restaurante inexistente en `PUT`:** la FK `restaurant_id` hace fallar la inserción con un 500 (mismo comportamiento que `points-rules`, que tampoco comprueba existencia). Solo puede ocurrir con el admin, porque el manager está limitado a su restaurante.
- **Conflictos de fusión:** otra PR en paralelo (issue #9) también añade tablas en `database.ts`, errores en `DomainErrors.ts` y rutas en `app.ts`. Los cambios aquí son aditivos (tabla insertada tras `bills`, error al final, una línea de import y otra de `app.use`), pero pueden requerir resolver conflictos triviales de líneas contiguas.
- **Parámetro opcional en `BillService`:** se hace opcional para no tocar los tests existentes; en producción `bill.routes.ts` siempre lo inyecta.
