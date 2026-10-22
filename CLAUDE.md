# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visión general

Resttek: plataforma de gestión de restaurantes. Monorepo con **npm workspaces** (`packages/*`): una API (`api`, Express 5 + TypeScript + SQLite) y cuatro paquetes Angular 21 (`web-admin` :4200, `web-empleados` :4201, `web-clientes` :4202 y la librería `web-shared`). Requiere Node 22+. La documentación del proyecto está en español (`docs/`) y debe escribirse en español.

## Comandos (desde la raíz)

- `npm install`: instala todo (un solo install para todos los workspaces).
- `npm run seed`: puebla SQLite con datos de prueba (idempotente, `INSERT OR IGNORE`). Las tablas se crean al arrancar la API. La contraseña de cada usuario seed es su propio email (p. ej. `admin@resttek.com`).
- `JWT_SECRET` (ver `packages/api/.env.example`): obligatorio en producción (32+ caracteres). En desarrollo, si falta, la API genera un secreto aleatorio al arrancar (avisa por consola) y las sesiones se pierden en cada reinicio. `src/config/env.ts` es la única fuente del secreto.
- `npm run dev:api` (:3000, `tsx watch`), `npm run dev:admin`, `npm run dev:empleados`, `npm run dev:clientes`. Los frontends hacen proxy de `/api` a `localhost:3000`.
- `npm test`: ejecuta los tests de la API (Vitest). Una sola vez: `npm test -w @resttek/api -- <ruta-o-patrón>`; con filtro por nombre: `-- -t "nombre"`; watch: `cd packages/api && npm run test:watch`.
- Frontends: `npm run build -w @resttek/web-admin` (análogo en los otros). No hay tests ni lint configurados en los frontends.
- `scripts/seed-issues.sh`: crea issues de GitHub desde `scripts/issues.json` (requiere `gh` y `jq`).

## Arquitectura

Detalle en `docs/arquitectura/` (general, API, frontend), `docs/dominio/` (glosario, modelo de datos) y `docs/revisiones/` (inconsistencias conocidas). Los planes de trabajo están en `docs/plans/` y el diseño funcional de lo implementado en `docs/funcional/` (p. ej. `docs/funcional/2026-10-21-corregir-vulnerabilidades-owasp.md`).

### API: dos estilos conviven

- **Hexagonal + DDD** solo para el contexto `employee` (`src/contexts/employee/{domain,application,infrastructure}`; `contexts/shared` tiene el value object `Email`, middlewares y `errorHandler`). Casos de uso con puertos (`IEmployeeRepository`, `IAuthService`) y mocks en `application/mocks`; el cableado de dependencias está en `infrastructure/http/dependencies.ts`.
- **Por capas** para `restaurant`, `dish`, `ingredient`, `order`: carpetas transversales `routes → controllers → services → repositories` más `models`. Las rutas públicas (`*.public.routes.ts`) están separadas de las protegidas.
- Antes de tocar código, identifica a qué estilo pertenece el dominio y sigue sus convenciones. Los tests van junto al código (`*.test.ts`).
- Errores: `src/errors/AppError.ts` y `DomainErrors.ts` (mensajes de dominio en inglés).
- **Autorización por restaurante:** `authorize(roles)` solo comprueba el rol. Las rutas con `:restaurantId` (platos, ingredientes) y `GET /restaurants/:id` añaden además `requireRestaurantAccess(param?)` (`contexts/shared/.../middlewares.ts`): el `admin` pasa siempre y el resto solo si `req.user.restaurantId` coincide con el parámetro (403 si no). Los servicios de plato e ingrediente reciben `restaurantId` en `findById`/`update`/`delete` y tratan un recurso de otro restaurante como inexistente (404).
- **Pedidos:** `OrderService` recibe un `actor` (`{ id, role, restaurantId }`) tomado del JWT. Valida la entrada de `create` (límites de líneas, cantidades y notas, y que los platos existan, estén disponibles y sean del restaurante), comprueba pertenencia al restaurante y aplica `assertTransitionAllowed` (en `models/order.model.ts`) para las transiciones de estado por rol. `routes/order.routes.ts` exporta la factory `createOrderRouter(service)` para poder probar con mocks.
- **Descuentos y puntos (por restaurante):** `discount_codes`, `points_rules`, `client_points` y `bills` (estilo por capas). Admin y manager gestionan códigos y equivalencias con `requireRestaurantAccess`. `BillService` (`POST /orders/:orderId/bill`) aplica código y/o canje de puntos, guarda una sola cuenta por pedido y suma `floor(total)` puntos; sin transacciones (SQLite compartido), usa `UPDATE … WHERE balance >= ?` atómico. Detalle en `docs/arquitectura/arquitectura-api.md` y `docs/funcional/2026-10-22-codigos-de-descuento-y-puntos.md`.
- **Mesas** (`restaurant_tables`, estilo por capas): el CRUD es solo `admin`; el personal consulta y cambia el estado (`PATCH /:id/status`); el rol `cliente` usa `GET /available?guests=N` y `POST /:id/occupy` **sin `requireRestaurantAccess`** (su `restaurantId` es nulo). La ocupación es una sola sentencia `UPDATE … WHERE status = 'libre' AND capacity >= ?` (atómica). `orders.table_id` guarda el id de la mesa y `OrderService` exige que esté ocupada y sea del restaurante (sin FK). Detalle en `docs/arquitectura/arquitectura-api.md` y `docs/funcional/2026-10-22-gestion-de-mesas.md`.
- Validación numérica y de URL compartida en `src/models/validation.ts` (`assertPositiveNumber`, `assertNonNegativeNumber`, `assertHttpUrl`).

### Frontends

Angular moderno: standalone components, signals, zoneless (sin `zone.js`), guards/interceptors funcionales. RxJS solo para HTTP (en admin/empleados dentro de stores con `firstValueFrom`; en clientes los componentes usan `.subscribe()` directamente). `web-admin` y `web-empleados` se organizan por feature (`models/pages/services/store`); `web-clientes` centraliza modelos y servicios en `core/`. Auth, HTTP, componentes y estilos comunes viven en `web-shared` (`@resttek/web-shared`).

## Gotchas

- `npm run seed` sobre una base de datos **nueva** falla con `FOREIGN KEY constraint failed`: `src/scripts/seed.ts` inserta los empleados con `restaurantId` antes de crear los restaurantes (desde que `PRAGMA foreign_keys = ON` está activo). Con una BD que ya tiene los restaurantes funciona.

- Los cambios en `web-shared` no se reflejan en caliente: reinicia el dev server del frontend.
- "Cannot find module @resttek/web-shared": ejecuta `npm install` en la raíz.
- Accede a los frontends por su puerto (proxy), no directamente a la API, para evitar problemas de CORS.
