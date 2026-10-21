# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visión general

Resttek: plataforma de gestión de restaurantes. Monorepo con **npm workspaces** (`packages/*`): una API (`api`, Express 5 + TypeScript + SQLite) y cuatro paquetes Angular 21 (`web-admin` :4200, `web-empleados` :4201, `web-clientes` :4202 y la librería `web-shared`). Requiere Node 22+. La documentación del proyecto está en español (`docs/`) y debe escribirse en español.

## Comandos (desde la raíz)

- `npm install`: instala todo (un solo install para todos los workspaces).
- `npm run seed`: puebla SQLite con datos de prueba (idempotente, `INSERT OR IGNORE`). Las tablas se crean al arrancar la API. La contraseña de cada usuario seed es su propio email (p. ej. `admin@resttek.com`).
- `npm run dev:api` (:3000, `tsx watch`), `npm run dev:admin`, `npm run dev:empleados`, `npm run dev:clientes`. Los frontends hacen proxy de `/api` a `localhost:3000`.
- `npm test`: ejecuta los tests de la API (Vitest). Una sola vez: `npm test -w @resttek/api -- <ruta-o-patrón>`; con filtro por nombre: `-- -t "nombre"`; watch: `cd packages/api && npm run test:watch`.
- Frontends: `npm run build -w @resttek/web-admin` (análogo en los otros). No hay tests ni lint configurados en los frontends.
- `scripts/seed-issues.sh`: crea issues de GitHub desde `scripts/issues.json` (requiere `gh` y `jq`).

## Arquitectura

Detalle en `docs/arquitectura/` (general, API, frontend), `docs/dominio/` (glosario, modelo de datos) y `docs/revisiones/` (inconsistencias conocidas).

### API: dos estilos conviven

- **Hexagonal + DDD** solo para el contexto `employee` (`src/contexts/employee/{domain,application,infrastructure}`; `contexts/shared` tiene el value object `Email`, middlewares y `errorHandler`). Casos de uso con puertos (`IEmployeeRepository`, `IAuthService`) y mocks en `application/mocks`; el cableado de dependencias está en `infrastructure/http/dependencies.ts`.
- **Por capas** para `restaurant`, `dish`, `ingredient`, `order`: carpetas transversales `routes → controllers → services → repositories` más `models`. Las rutas públicas (`*.public.routes.ts`) están separadas de las protegidas.
- Antes de tocar código, identifica a qué estilo pertenece el dominio y sigue sus convenciones. Los tests van junto al código (`*.test.ts`).
- Errores: `src/errors/AppError.ts` y `DomainErrors.ts`.

### Frontends

Angular moderno: standalone components, signals, zoneless (sin `zone.js`), guards/interceptors funcionales. RxJS solo para HTTP (en admin/empleados dentro de stores con `firstValueFrom`; en clientes los componentes usan `.subscribe()` directamente). `web-admin` y `web-empleados` se organizan por feature (`models/pages/services/store`); `web-clientes` centraliza modelos y servicios en `core/`. Auth, HTTP, componentes y estilos comunes viven en `web-shared` (`@resttek/web-shared`).

## Gotchas

- Los cambios en `web-shared` no se reflejan en caliente: reinicia el dev server del frontend.
- "Cannot find module @resttek/web-shared": ejecuta `npm install` en la raíz.
- Accede a los frontends por su puerto (proxy), no directamente a la API, para evitar problemas de CORS.
