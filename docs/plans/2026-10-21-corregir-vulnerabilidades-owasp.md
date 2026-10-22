# Plan: Corregir las vulnerabilidades OWASP Top 10 de la API y de web-empleados (con refresh token revocable y CSP)

- **Tipo:** bugfix (seguridad)
- **Fecha:** 2026-10-21
- **Estado:** Parcial. Implementado D1, D2, D3 y D4 (T1-T44) en la rama `feature/corregir-vulnerabilidades-owasp`. Pendiente por decisión del usuario: D5-D11 (T45-T114: autenticación, configuración, datos públicos, dependencias, frontend, refresh token y CSP).

**Desviaciones de la implementación (T1-T44):**

- **T1:** el `.gitignore` incluye además `.angular/`, `.DS_Store` y `.claude/worktrees/`, y se creó junto con un commit inicial, porque el repositorio no tenía commits y el worktree lo necesita.
- **T31:** en lugar de `BEGIN/COMMIT`, los ítems se insertan en una sola sentencia y, si falla, se borra el pedido recién creado. La conexión SQLite es única y compartida, y una transacción abierta englobaría las escrituras de otras peticiones concurrentes.
- **Mensajes de error nuevos en inglés**, igual que los errores de dominio existentes, y no en español como decía el plan (D3).
- **T14:** comprobado antes de aplicarlo: solo `web-admin` (formulario de edición, que es solo admin) llama a `GET /restaurants/:id`; web-empleados no lo usa y web-clientes usa el endpoint público.
- **T40:** el error de cantidad de ingrediente de un plato pasa de `Error` genérico a `InvalidDishIngredientError` (mismo mensaje), por lo que ahora lo trata el gestor de errores como `AppError`.
- **Tests existentes modificados** porque el plan cambia expresamente ese comportamiento: `ingredient.service.test.ts` y `order.service.test.ts` (nuevas firmas con `restaurantId` y `actor`).

## 1. Contexto

Una auditoría de solo lectura (OWASP Top 10, 2021) de `packages/api` y `packages/web-empleados` (con `web-shared`) encontró vulnerabilidades. Los hallazgos más graves se verificaron a mano en el código antes de planificar. Los informes de los subagentes son la fuente del resto, que se revalida al implementar cada tarea.

Resumen de hallazgos (ID = referencia usada en este plan):

| ID | Sev. | OWASP | Hallazgo |
|----|------|-------|----------|
| H1 | Crítica | A02/A07 | Secreto JWT por defecto `'super-secret-resttek-key'` duplicado en `BcryptAuthService.ts:5` y `middlewares.ts:4`. `dotenv` es dependencia pero nunca se importa. `jwt.verify` no fija `algorithms`. |
| H2 | Alta | A01 | `/orders/*` solo usa `authenticate`: sin rol, sin pertenencia al restaurante, sin transición de estado válida. Un cliente autoregistrado lee y cambia pedidos de cualquier restaurante. |
| H3 | Alta | A01 | `dishes`/`ingredients`: `authorize` solo comprueba rol. No se compara `:restaurantId` con `req.user.restaurantId` y `:id` se busca sin filtrar por restaurante (IDOR). Ingredientes de otro restaurante enlazables a un plato. `POST /orders` no valida que los `dishId` sean del restaurante ni estén disponibles. |
| H4 | Alta | A04 | `order.service.ts` crea una fila por unidad en un bucle `for (quantity)` sin validar tipo ni rango (DoS). |
| H5 | Media | A07 | Sin rate limiting en `/auth/login` y `/auth/register`. |
| H6 | Media | A07 | Sin política de contraseñas, email sin normalizar a minúsculas, seed con contraseña = email. |
| H7 | Media | A01 | Endpoints públicos exponen email y propietario del restaurante, y la receta (`ingredients`) de los platos. `GET /restaurants/:id` sin ámbito. |
| H8 | Media | A04 | Validación numérica insuficiente (`NaN` y strings pasan `<= 0`). `logoUrl` sin lista blanca de esquema. |
| H9 | Media | A06 | `npm audit`: `qs`, `body-parser`, `proxy-addr` (arreglables), `sqlite3`→6.x (cambio mayor), Angular 21.2.7 con avisos. |
| H10 | Media | A05 | Sin `helmet`, CORS abierto, `X-Powered-By` activo, no existe `.gitignore`. |
| H11 | Media | A09 | `errorHandler` no registra errores ni eventos de seguridad. |
| H12 | Baja | A07 | Enumeración de usuarios en registro y por timing en login. |
| H13 | Baja | A05 | `POST /orders` devuelve `error.message` de BD. JSON mal formado da 500. `OrderNotFoundError` se mapea a 400. |
| H14 | Media | A02/A07 | JWT de 8 h sin revocación: un empleado despedido o con el rol cambiado conserva el acceso. Se resuelve con access token corto + refresh token revocable en servidor, manteniendo Bearer en cabecera. |
| F1 | Media | A01 | Rutas `cocina`/`barra`/`salon` sin guard por rol. `''` redirige siempre a `cocina`. `defaultRoute` no se usa. |
| F2 | Media | A07 | JWT y `auth_user` en `localStorage` sin comprobar `exp` y sin refresh. Se mantiene Bearer: se comprueba `exp`, se renueva con refresh token y se mitiga el impacto de un XSS con CSP. |
| F3 | Baja | A07 | web-empleados acepta sesiones con rol `cliente`. |
| F4 | Baja | A04 | `JSON.parse(auth_user)` sin `try/catch` y `user: any`. |
| F5 | Media | A05 | Sin CSP ni cabeceras de seguridad. Fuente de Google importada por CSS. Se implementa CSP en los tres frontends y en la API. |

**Principio rector:** los controles del frontend son UX, no seguridad. Toda autorización real vive en la API (H2, H3), y las correcciones F1-F4 no la sustituyen.

## 2. Objetivo y alcance

**Incluye:**

- Corregir H1-H14 en `packages/api`, con tests Vitest para cada corrección.
- **Refresh token con revocación (H14):** sesión con access token corto (Bearer en cabecera) y refresh token rotatorio guardado hasheado en SQLite, con endpoints `refresh` y `logout` y revocación por empleado.
- **CSP (F5):** política `Content-Security-Policy` en los tres frontends (build de producción) y en la API.
- Corregir F1-F4 en `packages/web-shared` y `packages/web-empleados`, incluida la renovación automática de sesión en el interceptor (afecta a los tres frontends porque `web-shared` es común).
- Subir dependencias arreglables sin cambios mayores (`npm audit fix` y Angular dentro de `^21`).
- Documentar en español: `docs/arquitectura/`, `CLAUDE.md`, `README.md` y `.env.example`.

**No incluye:**

- Mover el JWT o el refresh token a cookie `HttpOnly`: descartado por decisión del usuario, que mantiene Bearer en cabecera. Los tokens siguen en `localStorage`.
- Revocación inmediata del access token (lista de revocación consultada en cada petición): la revocación actúa al caducar el access token (máximo 15 minutos de ventana) y al renovar.
- Cabeceras que no se pueden fijar con `<meta>` (`frame-ancestors`, HSTS, `X-Content-Type-Options`, `Referrer-Policy`): se documentan para el servidor web o CDN, que no existe en el repositorio.
- Subir `sqlite3` a 6.x: cambio mayor y la vulnerabilidad (`tar`) afecta a la instalación, no a las peticiones. Se planifica aparte.
- Self-hosting de la fuente de Google y SRI.
- Los frontends `web-admin` y `web-clientes`, salvo ajustes de tipos o de versión que exijan los cambios de API (T65, T67).
- Hacer commit: se hace con `/commit` cuando el usuario lo pida.

## 3. Análisis del código actual

La API tiene dos estilos: hexagonal en `contexts/employee` y por capas (`routes → controllers → services → repositories`, más `models`) en el resto. Cada corrección sigue el estilo del código que toca.

| Capa | Archivo | Cambio previsto |
|------|---------|-----------------|
| Config | `packages/api/src/config/env.ts` (nuevo) | Fuente única del `JWT_SECRET` con validación. |
| Config | `packages/api/src/config/logger.ts` (nuevo) | Logger mínimo con salida JSON y niveles. |
| Config | `packages/api/src/config/database.ts` | Migración de la tabla `refresh_tokens`. |
| Config | `packages/api/src/server.ts` | `import 'dotenv/config'` como primera línea. |
| Compartido | `contexts/shared/infrastructure/http/middlewares.ts` | Usar `env.ts`, fijar `algorithms`, tipar `req.user`, añadir `requireRestaurantAccess`. |
| Compartido | `contexts/shared/infrastructure/http/errorHandler.ts` | Registrar errores, mapear 404 por clase, JSON mal formado a 400. |
| Compartido | `contexts/shared/domain/value-objects/Email.ts` | Normalizar con `trim().toLowerCase()`. |
| Employee (hexagonal) | `BcryptAuthService.ts` | Usar `env.ts` y fijar `algorithm: 'HS256'`. |
| Employee (hexagonal) | `domain/value-objects/Password.ts` (nuevo) | Política de contraseñas. |
| Employee (hexagonal) | `LoginUseCase.ts`, `RegisterClientUseCase.ts`, `CreateEmployeeUseCase.ts` | Normalizar email, aplicar política, comparar siempre contra un hash ficticio, registrar eventos. |
| Employee (hexagonal) | `infrastructure/http/auth.routes.ts` | Rate limiting y nuevas rutas `POST /auth/refresh` y `POST /auth/logout`. |
| Employee (hexagonal) | `domain/IRefreshTokenRepository.ts`, `infrastructure/SqliteRefreshTokenRepository.ts` (nuevos) | Puerto y adaptador SQLite de refresh tokens. |
| Employee (hexagonal) | `application/RefreshSessionUseCase.ts`, `LogoutUseCase.ts`, `RevokeEmployeeSessionsUseCase.ts` (nuevos), `domain/IAuthService.ts`, `BcryptAuthService.ts` | Casos de uso de sesión y generación/hash del refresh token. |
| Por capas | `routes/*.routes.ts` | `requireRestaurantAccess`, `authorize` en `orders`, composición con nuevas dependencias. |
| Por capas | `services/order.service.ts` | Validación de entrada, pertenencia, transiciones y platos del restaurante. |
| Por capas | `services/dish.service.ts`, `services/ingredient.service.ts` | Consultas acotadas por `restaurantId`, validación de ingredientes. |
| Por capas | `controllers/order.controller.ts` | Ámbito de restaurante y de propietario, sin fuga de mensajes. |
| Por capas | `controllers/restaurant.controller.ts`, `controllers/dish.controller.ts` | DTO públicos reducidos. |
| Por capas | `models/validation.ts` (nuevo), `models/dish.model.ts`, `models/ingredient.model.ts`, `models/restaurant.model.ts` | Validación numérica y de `logoUrl`. |
| Por capas | `errors/DomainErrors.ts` | Errores nuevos (permiso, cantidad, plato inválido, contraseña débil). |
| Datos | `scripts/seed.ts` | Negarse a ejecutarse con `NODE_ENV=production`. |
| Frontend | `web-shared/src/lib/auth/auth.store.ts`, `auth.guard.ts` (+ nuevo `role.guard.ts`), `web-shared/src/index.ts` | Expiración, `try/catch`, tipo `AuthUser`, `roleGuard`. |
| Frontend | `web-empleados/src/app/app.routes.ts` | Guard por rol y redirect por rol. |
| Frontend | `web-shared/src/lib/auth/auth.service.ts`, `web-shared/src/lib/http/*.interceptor.ts` | Refresh single-flight, reintento tras 401 y renovación proactiva. |
| Frontend | `index.html` y `angular.json` de `web-admin`, `web-empleados` y `web-clientes` | CSP en el build de producción. |
| Raíz | `.gitignore`, `packages/api/.env.example` (nuevos) | Evitar subir BD y secretos. |

Notas verificadas en el código:

- `web-clientes` usa `restaurant.phone` en el listado público. El DTO público conserva `phone`. Los campos `ownerFirstName` y `ownerLastName` solo aparecen en su modelo de tipos, no en vistas.
- `web-clientes` declara `ingredients` en el modelo de plato y en `cart.store.ts` solo como tipo, sin usarlo en vistas. Quitarlo del DTO público no rompe nada visible.
- Flujo real de estados en web-empleados: cocina `pendiente→preparando→listo` (platos que no son bebida), barra `pendiente→listo` (bebidas), salón `listo→entregado`.
- `supertest` ya está en `devDependencies` de la API. Sirve para tests de rutas con Express. `MockDishRepository` no existe y hay que crearlo.
- Convenciones reales de error (el `errorHandler` actual): `AppError` responde `{ error: <nombre>, message }` con 400 por defecto, 404 para `NOT_FOUND_ERRORS` y 401 para `InvalidCredentialsError`. El plan sigue esa convención y no la `400 { errores }` de la plantilla.

## 4. Diseño de la solución

### D1. Secreto JWT (H1)

- `config/env.ts` exporta `JWT_SECRET`.
  - Con `NODE_ENV=production`: es obligatorio y debe tener 32 caracteres o más. Si falta o es débil, el proceso falla al arrancar con un mensaje claro.
  - Con `NODE_ENV=test`: valor fijo de prueba.
  - En desarrollo sin variable: se genera un secreto aleatorio por proceso (`crypto.randomBytes`) y se avisa por consola. Nunca hay un secreto público. El coste es que los tokens se invalidan al reiniciar `tsx watch`.
- `BcryptAuthService` y `middlewares` importan de `env.ts`. Con `jwt.sign(..., { algorithm: 'HS256' })` y `jwt.verify(..., { algorithms: ['HS256'] })`.
- `server.ts` carga `dotenv/config` antes de cualquier otro import, para que `packages/api/.env` funcione. Se añade `.env.example`.
- `env.ts` también expone `ACCESS_TOKEN_TTL` (por defecto `15m`) y `REFRESH_TOKEN_TTL_DAYS` (por defecto `7`), ver D10.

### D2. Ámbito por restaurante (H3)

- Nuevo middleware `requireRestaurantAccess(param = 'restaurantId')`: deja pasar a `admin`. Para el resto exige `req.user.restaurantId === req.params[param]`. Si no, `403 { error: 'Forbidden: ...' }`, con el mismo estilo que `authorize`.
- Se aplica en `dish.routes.ts` e `ingredient.routes.ts` (todas las rutas). Se aplica en `restaurant.routes.ts` a `GET /:id` con `param = 'id'`.
- `/restaurants/:restaurantId/employees` es solo `admin`, así que no necesita cambios.
- Los servicios dejan de fiarse del `:id`: `findById`, `update` y `delete` reciben `restaurantId` y lanzan `…NotFoundError` (404) si el recurso pertenece a otro restaurante.
- `DishService` recibe `IngredientRepository`. Al crear o actualizar un plato valida que cada `ingredientId` exista y sea del mismo restaurante (`InvalidDishIngredientError`, 400).
- Decisión: 403 para URLs con `:restaurantId` ajeno (el atacante ya conoce el id) y 404 para recursos concretos ajenos (no revela existencia).

### D3. Pedidos (H2, H4, parte de H3, H13)

- Rutas: `GET /orders/active` y `PATCH /orders/:orderId/items/:itemId/status` con `authorize(['admin','manager','camarero','cocinero'])`. `POST /orders`, `GET /orders/mine` y `GET /orders/:id` siguen siendo "autenticado".
- `GET /orders/active`: un no-admin usa siempre `req.user.restaurantId` (se ignora el query). El `admin` debe indicar `restaurantId` en el query.
- `GET /orders/:id`: permitido al `clientId` propietario, a empleados del restaurante del pedido y al `admin`. En otro caso `OrderNotFoundError` (404).
- `PATCH …/status`: `OrderService.updateItemStatus(orderId, itemId, status, actor)` verifica:
  1. Pertenencia: `order.restaurantId === actor.restaurantId`, salvo `admin`. Si no, 404.
  2. Transición permitida por rol, con la tabla de abajo. Si no, `ForbiddenTransitionError` (403).
- Tabla de transiciones:

  | Rol | Transiciones permitidas |
  |-----|--------------------------|
  | `cocinero` | `pendiente→preparando`, `preparando→listo` (cualquier ítem, bebidas incluidas) |
  | `camarero` | `pendiente→listo` (solo `bebida`), `listo→entregado` |
  | `manager`, `admin` | cualquier avance hacia delante (`pendiente→preparando→listo→entregado`, también saltando pasos) |

- `POST /orders`: `OrderService` recibe `DishRepository`. Valida:
  - `items` es un array de 1 a 50 elementos.
  - `quantity` es un entero de 1 a 20, y el total de unidades del pedido es como máximo 100.
  - `notes` es `null` o un string de 200 caracteres como máximo.
  - `tableId` es `null` o un string de 50 caracteres como máximo.
  - Cada `dishId` existe, es del `restaurantId` del pedido y está `available`.
  - Si no se cumple, `InvalidOrderError` (400, mensaje en español). La inserción de pedido e ítems pasa a una transacción.
- `OrderController`: en errores que no son `AppError` responde `500 { error: 'InternalServerError' }` sin `error.message`. Los `AppError` conservan su mensaje. `OrderNotFoundError` pasa a 404. Los errores se registran con el logger (D6).

### D4. Validación de entrada (H8)

- `models/validation.ts`: `assertPositiveNumber`, `assertNonNegativeNumber` (con `Number.isFinite` y `typeof === 'number'`), `assertHttpUrl` (acepta `null`, `http:` y `https:`).
- Se usan en `dish.service.ts` (precio, cantidad de ingredientes), `ingredient.service.ts` (`currentStock`) y `restaurant.service.ts` (`logoUrl`).
- `DishController.update`: `available` ausente conserva el valor existente (hoy se guarda como 0).

### D5. Autenticación (H5, H6, H12)

- Rate limiting con `express-rate-limit` (nueva dependencia):
  - Login: 10 intentos por 15 minutos por IP.
  - Registro: 10 por hora por IP.
  - Responde `429 { error: 'TooManyRequests', message }`.
  - Es una factory (`createAuthRateLimiter(opts)`) para poder probarla con límites pequeños. Se desactiva con `NODE_ENV=test` en la app real y se prueba aparte.
- `Password` (value object): 8 a 72 caracteres (72 es el límite de bcrypt) y distinta del email. `WeakPasswordError` (400). Se aplica en `RegisterClientUseCase` y `CreateEmployeeUseCase` antes de hashear.
- `Email` normaliza con `trim().toLowerCase()`. `LoginUseCase` normaliza antes de `findByEmail`. Un email con formato inválido se trata como `InvalidCredentialsError`.
- `LoginUseCase`: si el empleado no existe, ejecuta igualmente `comparePasswords` contra un hash ficticio precalculado, para igualar el tiempo.
- Riesgo aceptado: `register` sigue devolviendo `DuplicatedEmailError`. Evitarlo exige verificación por email, que no existe. La mitigación es el rate limit.
- Seed: se mantiene contraseña = email para desarrollo, pero `seed.ts` se niega a correr con `NODE_ENV=production`.

### D6. Configuración, errores y logging (H10, H11, H13)

- `helmet()`, `app.disable('x-powered-by')`, `express.json({ limit: '100kb' })` explícito.
- CORS con lista blanca desde `CORS_ORIGINS` (separada por comas). Por defecto en desarrollo: `http://localhost:4200`, `4201` y `4202`.
- `.gitignore` en la raíz: `node_modules`, `dist`, `.angular`, `*.db`, `.env`, `.env.*` con excepción de `.env.example`.
- `config/logger.ts`: `logger.info|warn|error(evento, datos)` con JSON por línea. Sin dependencias nuevas (alternativa: `pino`, ver riesgos).
- `errorHandler`:
  - Registra todo error 5xx con su stack. Nunca va a la respuesta.
  - JSON mal formado (`err.type === 'entity.parse.failed'`) responde `400 { error: 'InvalidJson' }`.
  - `OrderNotFoundError` se añade a `NOT_FOUND_ERRORS`.
- Se registran eventos de seguridad: login correcto y fallido (sin contraseña), registro, creación de empleado y 403 por ámbito.

### D7. Exposición de datos públicos (H7)

- `RestaurantController.toPublicJSON`: `id`, `name`, `address`, `phone`, `logoUrl`. Lo usan `getAllPublic` y un nuevo `getPublicById`. `restaurant.public.routes.ts` pasa de `getById` a `getPublicById`.
- `DishController.toPublicJSON` sin `ingredients`. Lo usa `getPublic`.
- `GET /restaurants/:id` queda protegido por `requireRestaurantAccess('id')` (D2).
- Los tipos de `web-clientes` dejan de declarar `ownerFirstName`, `ownerLastName`, `email` e `ingredients` en los modelos públicos.

### D8. Dependencias (H9)

- `npm audit fix` sin `--force` en la raíz, para `qs`, `body-parser` y `proxy-addr`.
- Subir `@angular/*` a la última 21.2.x dentro del rango `^21`, y comprobar que compilan los tres frontends (Angular es compartido).
- `sqlite3` 6.x queda fuera de alcance (ver sección 2).

### D9. Frontend (F1-F4)

- `AuthUser` (interfaz) en `web-shared`, y `AuthStore.user` deja de ser `any`.
- `AuthStore`:
  - `JSON.parse` dentro de `try/catch`. Un valor corrupto limpia la sesión.
  - Decodifica `exp` del JWT (`atob` del payload). `isAuthenticated` es verdadero si el access token está vigente **o** hay refresh token guardado (la renovación la hace el interceptor, ver D10).
  - Guarda también el refresh token (`auth_refresh`) y sincroniza el cierre de sesión y los tokens nuevos entre pestañas con el evento `storage`.
- `roleGuard(roles)` en `web-shared/src/lib/auth/role.guard.ts`, exportado en `index.ts`:
  - Rol permitido: pasa.
  - Rol no permitido pero con sesión válida: redirige a la ruta por defecto del rol.
  - Sin rol reconocido: limpia la sesión y redirige a `/login`.
- `web-empleados/app.routes.ts`:
  - El shell lleva `canActivate: [authGuard, roleGuard(['cocinero','camarero','manager'])]`, lo que rechaza a `cliente` y `admin` (F3).
  - `cocina` exige `cocinero|manager`. `barra` y `salon` exigen `camarero|manager`.
  - `redirectTo` de `''` es una función según el rol (`camarero → barra`, resto → `cocina`).
  - El `defaultRoute` duplicado de `shell.component.ts` se elimina o se reutiliza, sin dejar código muerto.

### D10. Refresh token con revocación (H14, F2)

Se mantiene `Authorization: Bearer` con el JWT de acceso. El refresh token es un valor opaco, no un JWT.

- **Access token:** JWT HS256 de 15 minutos (`ACCESS_TOKEN_TTL`), con el mismo payload actual (`id`, `role`, `restaurantId`).
- **Refresh token:**
  - 32 bytes aleatorios (`crypto.randomBytes`), en base64url. Se devuelve al cliente una sola vez.
  - En la BD solo se guarda su hash SHA-256 (tiene alta entropía, no hace falta bcrypt). Nunca el valor en claro.
  - Caduca a los 7 días (`REFRESH_TOKEN_TTL_DAYS`) en valor absoluto.
- **Tabla nueva `refresh_tokens`** (migración en `config/database.ts`): `id`, `employee_id` (FK a `employees`), `token_hash` (único), `family_id`, `expires_at`, `created_at`, `rotated_at` (nulo si sigue vigente), `revoked_at` (nulo si no está revocado). Índices por `token_hash` y por `employee_id`.
- **Rotación:** cada `POST /auth/refresh` consume el refresh token (`rotated_at`) y entrega un par nuevo (access + refresh) de la **misma familia** (`family_id`, uno por login).
- **Detección de reutilización:** si llega un refresh token ya rotado, se revoca toda su familia (todos sus tokens) y se responde 401. Para no expulsar a un usuario con dos pestañas que renuevan a la vez, se tolera una **ventana de gracia de 10 s**: dentro de ella el token rotado recibe 401 sin revocar la familia, y el cliente relee el par nuevo que dejó la otra pestaña en `localStorage`.
- **Revocación:**
  - `POST /auth/logout` `{ refreshToken }` revoca la familia. Es idempotente y responde `204`.
  - `POST /employees/:id/revoke-sessions` (solo `admin`) revoca todos los refresh tokens del empleado. Es la palanca para despidos y cambios de rol, ya que hoy no existe endpoint de edición de empleados.
  - La revocación impide renovar. El access token en curso sigue siendo válido hasta 15 minutos como máximo (ventana asumida, ver sección 2).
- **Endpoints:**
  - `POST /auth/login` y `POST /auth/register` devuelven además `refreshToken` y `expiresIn` (segundos del access token). Es un cambio aditivo del contrato.
  - `POST /auth/refresh` `{ refreshToken }` devuelve `{ token, refreshToken, expiresIn }`, o `401 InvalidRefreshTokenError`.
  - Las rutas `refresh` y `logout` llevan el rate limiter de D5.
- **Hexagonal:** puerto `IRefreshTokenRepository` (en `domain`), adaptador `SqliteRefreshTokenRepository` (en `infrastructure`) y casos de uso `RefreshSessionUseCase`, `LogoutUseCase` y `RevokeEmployeeSessionsUseCase` (en `application`). `IAuthService` incorpora la generación y el hash del refresh token. La composición va en `dependencies.ts`.
- **Mantenimiento:** al arrancar el servidor se borran los refresh tokens caducados.
- **Cliente (`web-shared`):**
  - Guarda `auth_refresh` en `localStorage` (hace falta persistencia en tablets de cocina).
  - El interceptor renueva de forma proactiva si al access token le quedan menos de 60 s, y reactiva: ante un 401 en una petición normal intenta **un** refresh y reintenta la petición una vez. Si el refresh falla, limpia la sesión y redirige a `/login`.
  - El refresh es *single-flight*: varias peticiones concurrentes comparten una sola llamada a `/auth/refresh`.
  - `logout()` llama a `/auth/logout` (si falla, limpia igualmente la sesión local).
  - El `error.interceptor` actual limpia la sesión en cualquier 401. Hay que ajustarlo para que no compita con el reintento.
- **Riesgo asumido:** el refresh token vive en `localStorage`, por decisión de mantener Bearer. Un XSS podría robarlo, pero con rotación, detección de reutilización y CSP (D11) el impacto baja mucho respecto al JWT de 8 h actual.

### D11. Content-Security-Policy (F5)

- **Frontends (build de producción):** CSP en el `index.html` de cada app con `<meta http-equiv="Content-Security-Policy">`. No se aplica al servidor de desarrollo (Vite necesita inline y WebSocket para HMR), por lo que se usa un `index` específico de la configuración `production` en `angular.json` (comprobar que el builder lo permite) o, si Angular 21 lo ofrece, `security.autoCsp`.
- Política base (se ajusta al comprobar en Chrome que no hay violaciones):
  - `default-src 'self'`
  - `script-src 'self'` (más los hashes de los scripts inline que Angular genere, si los hay)
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` (Angular emite estilos inline)
  - `font-src https://fonts.gstatic.com`
  - `img-src 'self' data: https:` (los `logoUrl` de restaurante son URLs externas; `web-empleados` puede restringirse más)
  - `connect-src 'self'`
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`
- **API:** `helmet` con CSP explícita `default-src 'none'; frame-ancestors 'none'` (la API solo sirve JSON).
- `frame-ancestors` no funciona en `<meta>`: se documenta como cabecera para el servidor web, junto con `X-Content-Type-Options`, `Referrer-Policy` y HSTS.
- Verificación: build de producción de cada frontend servido en local y script con Chrome headless que escucha `securitypolicyviolation` y la consola mientras navega por las pantallas principales.

## 5. Lista de tareas

> Cada tarea debe poder completarse en 5-10 minutos. Si una tarea es mayor, divídela. Tras cada fase de la API, ejecutar `npm test` desde la raíz.

### Fase 0: Higiene del repositorio (H10)

- [x] **T1** (5 min) — Crear `.gitignore` con `node_modules`, `dist`, `.angular`, `*.db`, `.env`, `.env.*` y la excepción `!.env.example` · `.gitignore`
- [x] **T2** (5 min) — Crear `.env.example` con `JWT_SECRET` (comentando que en producción debe tener 32+ caracteres), `CORS_ORIGINS` y `PORT` · `packages/api/.env.example`

### Fase 1: Secreto JWT (H1)

- [x] **T3** (10 min) — Crear `env.ts` con `JWT_SECRET` según D1: obligatorio y de 32+ caracteres en producción, fijo en test, aleatorio con aviso en desarrollo · `packages/api/src/config/env.ts`
- [x] **T4** (10 min) — Test de `env.ts` con `vi.resetModules()` y `vi.stubEnv`: falla en producción sin secreto, falla con secreto corto, acepta secreto válido, genera uno en desarrollo · `packages/api/src/config/env.test.ts`
- [x] **T5** (5 min) — Usar `JWT_SECRET` de `env.ts` y `{ algorithms: ['HS256'] }` en `jwt.verify`; quitar el literal por defecto · `packages/api/src/contexts/shared/infrastructure/http/middlewares.ts`
- [x] **T6** (5 min) — Usar `JWT_SECRET` de `env.ts` y `algorithm: 'HS256'` en `jwt.sign`; quitar el literal por defecto · `packages/api/src/contexts/employee/infrastructure/BcryptAuthService.ts`
- [x] **T7** (5 min) — Añadir `import 'dotenv/config'` como primera línea para que cargue `.env` · `packages/api/src/server.ts`
- [x] **T8** (10 min) — Test de `authenticate` con supertest: sin token (401), token mal firmado (401), token con `alg: none` (401), token caducado (401), token válido (200 y `req.user` rellenado) · `packages/api/src/contexts/shared/infrastructure/http/middlewares.test.ts`

### Fase 2: Ámbito por restaurante (H3)

- [x] **T9** (5 min) — Tipar `req.user` con una interfaz `AuthUser { id, role, restaurantId }` en lugar de `any` · `packages/api/src/contexts/shared/infrastructure/http/middlewares.ts`
- [x] **T10** (10 min) — Añadir el middleware `requireRestaurantAccess(param)` según D2 · `packages/api/src/contexts/shared/infrastructure/http/middlewares.ts`
- [x] **T11** (10 min) — Tests de `requireRestaurantAccess`: admin pasa, manager de su restaurante pasa, manager de otro restaurante 403, usuario sin `restaurantId` 403, parámetro personalizado `id` · `packages/api/src/contexts/shared/infrastructure/http/middlewares.test.ts`
- [x] **T12** (5 min) — Aplicar `requireRestaurantAccess()` a las cinco rutas de platos · `packages/api/src/routes/dish.routes.ts`
- [x] **T13** (5 min) — Aplicar `requireRestaurantAccess()` a las cinco rutas de ingredientes · `packages/api/src/routes/ingredient.routes.ts`
- [x] **T14** (5 min) — Aplicar `requireRestaurantAccess('id')` a `GET /restaurants/:id` · `packages/api/src/routes/restaurant.routes.ts`
- [x] **T15** (10 min) — `DishService.findById`, `update` y `delete` reciben `restaurantId` y lanzan `DishNotFoundError` si el plato es de otro restaurante · `packages/api/src/services/dish.service.ts`
- [x] **T16** (5 min) — Pasar `req.params.restaurantId` a `findById`, `update` y `delete` en el controlador de platos · `packages/api/src/controllers/dish.controller.ts`
- [x] **T17** (10 min) — Mismo cambio de ámbito en `IngredientService` (`findById`, `update`, `delete`) y en su controlador · `packages/api/src/services/ingredient.service.ts`, `packages/api/src/controllers/ingredient.controller.ts`
- [x] **T18** (5 min) — Crear `InvalidDishIngredientError` (400) · `packages/api/src/errors/DomainErrors.ts`
- [x] **T19** (5 min) — Crear `MockDishRepository` (en memoria) para tests · `packages/api/src/repositories/mocks/MockDishRepository.ts`
- [x] **T20** (10 min) — `DishService` recibe `IngredientRepository` y valida que cada `ingredientId` exista y sea del restaurante, en `create` y `update` · `packages/api/src/services/dish.service.ts`
- [x] **T21** (5 min) — Inyectar `SqliteIngredientRepository` al construir `DishService` · `packages/api/src/routes/dish.routes.ts`
- [x] **T22** (10 min) — Tests de `DishService`: plato de otro restaurante en `update` y `delete` da 404, ingrediente de otro restaurante en `create` da 400, ingrediente inexistente da 400, caso feliz · `packages/api/src/services/dish.service.test.ts`
- [x] **T23** (10 min) — Ampliar tests de `IngredientService` con el caso de ingrediente de otro restaurante (404) y ajustar los existentes a las nuevas firmas · `packages/api/src/services/ingredient.service.test.ts`

### Fase 3: Pedidos (H2, H4, H13)

- [x] **T24** (5 min) — Crear `ForbiddenTransitionError` (403), `InvalidOrderError` (400) y `OrderForbiddenError` si hace falta · `packages/api/src/errors/DomainErrors.ts`
- [x] **T25** (10 min) — Añadir al modelo la tabla de transiciones por rol y la función `assertTransitionAllowed(role, item, nextStatus)` según D3 · `packages/api/src/models/order.model.ts`
- [x] **T26** (10 min) — Tests de `assertTransitionAllowed`: cocinero (`preparando`, `listo`, también sobre bebida, bloqueado en `entregado`), camarero (bebida `listo`, `entregado`, bloqueado `preparando`), manager y admin, retroceso rechazado · `packages/api/src/models/order.model.test.ts`
- [x] **T27** (10 min) — `OrderService.create` valida entrada según D3 (array, tamaño, `quantity` entera 1-20, total ≤ 100, `notes`, `tableId`) · `packages/api/src/services/order.service.ts`
- [x] **T28** (10 min) — `OrderService` recibe `DishRepository` y comprueba que cada `dishId` exista, sea del restaurante del pedido y esté disponible · `packages/api/src/services/order.service.ts`
- [x] **T29** (10 min) — `OrderService.updateItemStatus` recibe `actor { role, restaurantId }`; verifica pertenencia y transición · `packages/api/src/services/order.service.ts`
- [x] **T30** (5 min) — `OrderService.getById` recibe `actor` y solo devuelve el pedido al propietario, al personal del restaurante o al admin (si no, `OrderNotFoundError`) · `packages/api/src/services/order.service.ts`
- [x] **T31** (10 min) — Insertar pedido e ítems dentro de una transacción (`BEGIN`/`COMMIT`/`ROLLBACK`) · `packages/api/src/repositories/order.repository.ts`
- [x] **T32** (10 min) — Ajustar los tests existentes de `updateItemStatus` a la nueva firma y añadir casos: pedido de otro restaurante (404), cocinero entregando (rechazado), camarero marcando `preparando` (rechazado) · `packages/api/src/services/order.service.test.ts`
- [x] **T33** (10 min) — Tests de `OrderService.create`: `quantity` 0, negativa, decimal, `NaN`, string y 1e9 rechazadas, `items` vacío o no array, plato de otro restaurante, plato no disponible, caso feliz · `packages/api/src/services/order.service.test.ts`
- [x] **T34** (5 min) — Tests de `getById` por rol y propietario (cliente ajeno, empleado de otro restaurante, admin) · `packages/api/src/services/order.service.test.ts`
- [x] **T35** (10 min) — Controlador de pedidos: `getActiveOrders` usa `user.restaurantId` salvo admin; `getById` y `updateItemStatus` pasan el `actor`; sin `error.message` para errores que no son `AppError`; `OrderNotFoundError` a 404 · `packages/api/src/controllers/order.controller.ts`
- [x] **T36** (5 min) — `authorize(['admin','manager','camarero','cocinero'])` en `/active` y en `PATCH …/status`, e inyectar `DishRepository` en `OrderService` · `packages/api/src/routes/order.routes.ts`
- [x] **T37** (10 min) — Test de integración con supertest de `/orders` con repositorios mock: cliente recibe 403 en `/active` y en `PATCH`; empleado de otro restaurante no ve pedidos ajenos; JSON con `quantity` enorme da 400 · `packages/api/src/routes/order.routes.test.ts`

### Fase 4: Validación de entrada (H8)

- [x] **T38** (10 min) — Crear helpers de validación `assertPositiveNumber`, `assertNonNegativeNumber` y `assertHttpUrl` · `packages/api/src/models/validation.ts`
- [x] **T39** (5 min) — Tests de los helpers: `NaN`, `Infinity`, string numérico, negativo, cero, `javascript:`, `data:`, `null`, `https:` válido · `packages/api/src/models/validation.test.ts`
- [x] **T40** (10 min) — Usar los helpers en precio de plato y cantidad de ingrediente de plato · `packages/api/src/services/dish.service.ts`, `packages/api/src/models/dish.model.ts`
- [x] **T41** (5 min) — Usar `assertNonNegativeNumber` en `currentStock` · `packages/api/src/services/ingredient.service.ts`
- [x] **T42** (5 min) — Validar `logoUrl` con `assertHttpUrl` en alta y edición de restaurante · `packages/api/src/services/restaurant.service.ts`
- [x] **T43** (5 min) — En `DishController.update`, si `available` no llega, conservar el valor existente · `packages/api/src/controllers/dish.controller.ts`, `packages/api/src/services/dish.service.ts`
- [x] **T44** (10 min) — Tests de servicio: precio `"abc"`, `NaN` y negativo; stock string; `logoUrl` con `javascript:` rechazados; `available` ausente conserva el valor · `packages/api/src/services/dish.service.test.ts`, `ingredient.service.test.ts`, `restaurant.service.test.ts`

### Fase 5: Autenticación (H5, H6, H12)

- [ ] **T45** (5 min) — Crear `WeakPasswordError` (400) · `packages/api/src/errors/DomainErrors.ts`
- [ ] **T46** (10 min) — Crear el value object `Password` (8-72 caracteres, distinta del email) con sus tests · `packages/api/src/contexts/employee/domain/value-objects/Password.ts`, `Password.test.ts`
- [ ] **T47** (5 min) — Normalizar `Email` con `trim().toLowerCase()` y ajustar sus tests · `packages/api/src/contexts/shared/domain/value-objects/Email.ts`
- [ ] **T48** (10 min) — Aplicar `Password` y normalización de email en `RegisterClientUseCase` y `CreateEmployeeUseCase`, con tests (contraseña vacía, corta, igual al email, email con mayúsculas duplicado) · `packages/api/src/contexts/employee/application/RegisterClientUseCase.ts`, `CreateEmployeeUseCase.ts`, `RegisterClientUseCase.test.ts`
- [ ] **T49** (10 min) — `LoginUseCase`: normalizar email, tratar email inválido como credenciales inválidas, comparar siempre contra un hash ficticio; añadir test de que `comparePasswords` se llama también con usuario inexistente · `packages/api/src/contexts/employee/application/LoginUseCase.ts`, `EmployeeUseCases.test.ts`
- [ ] **T50** (5 min) — Instalar `express-rate-limit` en la API · `packages/api/package.json`
- [ ] **T51** (10 min) — Crear la factory `createAuthRateLimiter` y aplicarla a `/login` y `/register` (límites de D5, desactivados con `NODE_ENV=test` en la app real) · `packages/api/src/contexts/employee/infrastructure/http/rateLimiter.ts`, `auth.routes.ts`
- [ ] **T52** (10 min) — Test del limitador con supertest y límite 3: la cuarta petición devuelve 429 · `packages/api/src/contexts/employee/infrastructure/http/rateLimiter.test.ts`
- [ ] **T53** (5 min) — Hacer que `seed.ts` aborte con `NODE_ENV=production` · `packages/api/src/scripts/seed.ts`

### Fase 6: Configuración, errores y logging (H10, H11, H13)

- [ ] **T54** (5 min) — Instalar `helmet` en la API · `packages/api/package.json`
- [ ] **T55** (10 min) — En `app.ts`: `helmet()`, `disable('x-powered-by')`, `express.json({ limit: '100kb' })` y CORS con lista blanca desde `CORS_ORIGINS` · `packages/api/src/app.ts`
- [ ] **T56** (10 min) — Test con supertest: no hay cabecera `x-powered-by`, hay `x-content-type-options`, un origen no permitido no recibe `access-control-allow-origin` · `packages/api/src/app.test.ts`
- [ ] **T57** (5 min) — Crear el logger JSON mínimo · `packages/api/src/config/logger.ts`
- [ ] **T58** (10 min) — `errorHandler`: registrar 5xx con stack, `entity.parse.failed` a 400 `InvalidJson`, añadir `OrderNotFoundError` a `NOT_FOUND_ERRORS` · `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts`
- [ ] **T59** (10 min) — Tests del `errorHandler`: 500 genérico sin stack en la respuesta, JSON roto da 400, `AppError` mantiene su código, el 5xx se registra · `packages/api/src/contexts/shared/infrastructure/http/errorHandler.test.ts`
- [ ] **T60** (10 min) — Registrar eventos de seguridad (login correcto y fallido sin contraseña, registro, alta de empleado, 403 por ámbito) con el logger · `packages/api/src/contexts/employee/application/LoginUseCase.ts`, `middlewares.ts`

### Fase 7: Datos públicos (H7)

- [ ] **T61** (10 min) — Crear `toPublicJSON` y `getPublicById` (`id`, `name`, `address`, `phone`, `logoUrl`); usarlos en `getAllPublic` · `packages/api/src/controllers/restaurant.controller.ts`
- [ ] **T62** (5 min) — Apuntar `GET /:id` público a `getPublicById` · `packages/api/src/routes/restaurant.public.routes.ts`
- [ ] **T63** (5 min) — Crear `toPublicJSON` sin `ingredients` y usarlo en `getPublic` · `packages/api/src/controllers/dish.controller.ts`
- [ ] **T64** (10 min) — Tests con supertest: el público no contiene `email`, `ownerFirstName`, `ownerLastName` ni `ingredients`; el autenticado de admin y del propio restaurante sí devuelve el restaurante completo · `packages/api/src/controllers/public-dto.test.ts`
- [ ] **T65** (5 min) — Quitar `ownerFirstName`, `ownerLastName`, `email` e `ingredients` de los tipos públicos de `web-clientes` y comprobar que compila · `packages/web-clientes/src/app/core/models/restaurant.model.ts`, `dish.model.ts`, `packages/web-clientes/src/app/core/store/cart.store.ts`

### Fase 8: Dependencias (H9)

- [ ] **T66** (5 min) — `npm audit fix` (sin `--force`) en la raíz y revisar que solo cambie `package-lock.json` · `package-lock.json`
- [ ] **T67** (10 min) — Subir `@angular/*` a la última 21.2.x dentro del rango y regenerar el lockfile · `packages/web-admin/package.json`, `web-empleados/package.json`, `web-clientes/package.json`, `web-shared/package.json`, `package-lock.json`
- [ ] **T68** (10 min) — Compilar los tres frontends (`npm run build -w @resttek/web-admin`, `web-empleados`, `web-clientes`) y repetir `npm audit --omit=dev` anotando lo que queda · sin archivo

### Fase 9: Frontend (F1-F4)

- [ ] **T69** (5 min) — Definir la interfaz `AuthUser` y tipar `AuthStore.user` · `packages/web-shared/src/lib/auth/auth.store.ts`
- [ ] **T70** (10 min) — `JSON.parse` con `try/catch` (valor corrupto limpia la sesión) y función `isTokenExpired(token)` que decodifica `exp` · `packages/web-shared/src/lib/auth/auth.store.ts`
- [ ] **T71** (5 min) — `isAuthenticated` verdadero solo si el access token está vigente o hay refresh token guardado (D9) · `packages/web-shared/src/lib/auth/auth.store.ts`
- [ ] **T72** (10 min) — Crear `roleGuard(roles)` según D9 · `packages/web-shared/src/lib/auth/role.guard.ts`
- [ ] **T73** (5 min) — Exportar `roleGuard` y `AuthUser` en el índice público · `packages/web-shared/src/index.ts`
- [ ] **T74** (10 min) — Rutas de web-empleados: guard por rol en el shell y en `cocina`/`barra`/`salon`, y `redirectTo` según rol · `packages/web-empleados/src/app/app.routes.ts`
- [ ] **T75** (5 min) — Eliminar `defaultRoute` sin uso o reutilizarlo en el guard, sin dejar código muerto · `packages/web-empleados/src/app/core/layout/shell.component.ts`

### Fase 10: Refresh token con revocación, API (H14)

- [ ] **T76** (5 min) — Crear `InvalidRefreshTokenError` (401) y añadirlo a `UNAUTHORIZED_ERRORS` del `errorHandler` · `packages/api/src/errors/DomainErrors.ts`, `packages/api/src/contexts/shared/infrastructure/http/errorHandler.ts`
- [ ] **T77** (5 min) — Añadir `ACCESS_TOKEN_TTL` (`15m`) y `REFRESH_TOKEN_TTL_DAYS` (`7`) a `env.ts`, y a `.env.example`, con su test · `packages/api/src/config/env.ts`, `env.test.ts`, `packages/api/.env.example`
- [ ] **T78** (10 min) — Migración de la tabla `refresh_tokens` con sus índices (D10) · `packages/api/src/config/database.ts`
- [ ] **T79** (5 min) — Definir la entidad `RefreshToken` y el puerto `IRefreshTokenRepository` (`save`, `findByHash`, `markRotated`, `revokeFamily`, `revokeAllByEmployee`, `deleteExpired`) · `packages/api/src/contexts/employee/domain/IRefreshTokenRepository.ts`
- [ ] **T80** (10 min) — Implementar `SqliteRefreshTokenRepository` · `packages/api/src/contexts/employee/infrastructure/SqliteRefreshTokenRepository.ts`
- [ ] **T81** (10 min) — Test del repositorio con SQLite en memoria, siguiendo el patrón de `SqliteEmployeeRepository.test.ts` (guardar, buscar, rotar, revocar familia, revocar por empleado, borrar caducados) · `packages/api/src/contexts/employee/infrastructure/SqliteRefreshTokenRepository.test.ts`
- [ ] **T82** (5 min) — Ampliar `IAuthService` con `generateRefreshToken()` (valor y hash) y `hashRefreshToken(value)`; implementarlo con `crypto.randomBytes(32)` y SHA-256, y usar `ACCESS_TOKEN_TTL` en `generateToken` · `packages/api/src/contexts/employee/domain/IAuthService.ts`, `packages/api/src/contexts/employee/infrastructure/BcryptAuthService.ts`
- [ ] **T83** (10 min) — Crear un repositorio de refresh tokens en memoria y ampliar el mock de `IAuthService` para los tests · `packages/api/src/contexts/employee/application/mocks/MockDependencies.ts`
- [ ] **T84** (10 min) — `LoginUseCase` y `RegisterClientUseCase` crean una familia nueva, guardan el hash y devuelven `refreshToken` y `expiresIn`; ajustar los tests existentes · `packages/api/src/contexts/employee/application/LoginUseCase.ts`, `RegisterClientUseCase.ts`, `EmployeeUseCases.test.ts`, `RegisterClientUseCase.test.ts`
- [ ] **T85** (10 min) — Crear `RefreshSessionUseCase`: valida hash, caducidad y revocación; rota dentro de la misma familia; detecta reutilización con ventana de gracia de 10 s · `packages/api/src/contexts/employee/application/RefreshSessionUseCase.ts`
- [ ] **T86** (10 min) — Tests de `RefreshSessionUseCase`: rotación correcta, token desconocido, caducado, revocado, reutilización fuera de la gracia (revoca la familia), reutilización dentro de la gracia (401 sin revocar) · `packages/api/src/contexts/employee/application/RefreshSessionUseCase.test.ts`
- [ ] **T87** (5 min) — Crear `LogoutUseCase` (revoca la familia, idempotente) y su test · `packages/api/src/contexts/employee/application/LogoutUseCase.ts`, `LogoutUseCase.test.ts`
- [ ] **T88** (5 min) — Crear `RevokeEmployeeSessionsUseCase` y su test · `packages/api/src/contexts/employee/application/RevokeEmployeeSessionsUseCase.ts`, `RevokeEmployeeSessionsUseCase.test.ts`
- [ ] **T89** (10 min) — Añadir `refresh` y `logout` a `AuthController`, registrar las rutas `POST /auth/refresh` y `POST /auth/logout` con el rate limiter, y componer las dependencias · `packages/api/src/contexts/employee/infrastructure/http/AuthController.ts`, `auth.routes.ts`, `dependencies.ts`
- [ ] **T90** (5 min) — Endpoint `POST /employees/:id/revoke-sessions` solo `admin` (`204`) · `packages/api/src/contexts/employee/infrastructure/http/EmployeeController.ts`, `employee.routes.ts`
- [ ] **T91** (10 min) — Test de integración con supertest del flujo `login → refresh → refresh con el token viejo → logout → refresh`, y de `revoke-sessions` (un manager recibe 403) · `packages/api/src/contexts/employee/infrastructure/http/auth.routes.test.ts`
- [ ] **T92** (5 min) — Borrar refresh tokens caducados al arrancar el servidor · `packages/api/src/server.ts`
- [ ] **T93** (5 min) — Registrar con el logger los eventos `refresh`, `reutilización detectada` (nivel `warn`), `logout` y `revoke-sessions` · `packages/api/src/contexts/employee/application/*.ts`

### Fase 11: Refresh token en el frontend y CSP (F2, F5)

- [ ] **T94** (5 min) — `AuthStore` guarda y limpia `auth_refresh`; `setSession(token, refreshToken, user)` · `packages/web-shared/src/lib/auth/auth.store.ts`
- [ ] **T95** (10 min) — `AuthService.refresh()` *single-flight* (una promesa compartida), tipos de `LoginResponse` con `refreshToken` y `logout()` que llama a `/auth/logout` y limpia aunque falle · `packages/web-shared/src/lib/auth/auth.service.ts`
- [ ] **T96** (10 min) — Interceptor: renovar de forma proactiva si quedan menos de 60 s y, ante un 401 en una petición normal (no `/auth/*`), un refresh y un reintento · `packages/web-shared/src/lib/http/auth.interceptor.ts`
- [ ] **T97** (5 min) — Ajustar `error.interceptor` para que solo limpie sesión y redirija cuando el refresh falla o no hay refresh token · `packages/web-shared/src/lib/http/error.interceptor.ts`
- [ ] **T98** (5 min) — Sincronizar entre pestañas con el evento `storage` (cierre de sesión y tokens nuevos) y releer el par nuevo tras un 401 de la ventana de gracia · `packages/web-shared/src/lib/auth/auth.store.ts`
- [ ] **T99** (5 min) — Pasar el `refreshToken` del registro a `setSession` en `RegisterComponent` y `AuthService.register` · `packages/web-shared/src/lib/auth/auth.service.ts`
- [ ] **T100** (10 min) — Compilar los tres frontends y comprobar que el orden de registro de los interceptores en cada `app.config.ts` es compatible · `packages/web-admin/src/app/app.config.ts`, `web-empleados`, `web-clientes`
- [ ] **T101** (10 min) — Comprobar en `node_modules/@angular/build` si Angular 21 ofrece `security.autoCsp` y si una configuración puede sustituir `index`. Anotar la decisión en este plan · `docs/plans/2026-10-21-corregir-vulnerabilidades-owasp.md`
- [ ] **T102** (10 min) — CSP de producción en web-empleados según D11 (mecanismo elegido en T101) · `packages/web-empleados/src/index.html` (o `index.prod.html`), `packages/web-empleados/angular.json`
- [ ] **T103** (5 min) — Misma CSP en web-admin · `packages/web-admin/src/index.html` (o `index.prod.html`), `angular.json`
- [ ] **T104** (5 min) — Misma CSP en web-clientes (con `img-src https:` para los logos) · `packages/web-clientes/src/index.html` (o `index.prod.html`), `angular.json`
- [ ] **T105** (10 min) — `helmet` con CSP explícita `default-src 'none'; frame-ancestors 'none'` en la API y su test · `packages/api/src/app.ts`, `app.test.ts`
- [ ] **T106** (10 min) — Script de Chrome headless (en el scratchpad) que sirve cada build de producción, navega por login y pantallas principales y registra `securitypolicyviolation` y errores de consola · sin archivo
- [ ] **T107** (10 min) — Corregir las violaciones de CSP que aparezcan (por ejemplo estilos o fuentes) ajustando la política, no abriéndola de más · `packages/web-*/src/index*.html`
- [ ] **T108** (5 min) — Documentar las cabeceras que solo puede fijar el servidor web (`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS) · `docs/arquitectura/arquitectura-general.md`

### Fase 12: Verificación y documentación

- [ ] **T109** (10 min) — Ejecutar `npm test` y `npx tsc --noEmit` en la API. Corregir fallos · sin archivo
- [ ] **T110** (10 min) — Reiniciar API y frontends y ejecutar la verificación manual (sección 6) · sin archivo
- [ ] **T111** (10 min) — Documentar en `docs/arquitectura/arquitectura-api.md`: tabla de rutas con los nuevos roles y ámbito, `requireRestaurantAccess`, transiciones por rol, DTO públicos, rate limiting, logging, `refresh`, `logout`, `revoke-sessions` y la tabla `refresh_tokens` · `docs/arquitectura/arquitectura-api.md`
- [ ] **T112** (10 min) — Documentar en `docs/arquitectura/arquitectura-general.md` y `arquitectura-frontend.md` la sección de seguridad: variables `JWT_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS` y `CORS_ORIGINS`, flujo de refresh con rotación y revocación, y riesgos aceptados (`localStorage`, ventana de 15 min) · `docs/arquitectura/arquitectura-general.md`
- [ ] **T113** (5 min) — Actualizar comandos y gotchas: `.env` y `JWT_SECRET`, seed no válido en producción · `CLAUDE.md`, `README.md`
- [ ] **T114** (5 min) — Registrar en `docs/revisiones/` una nota de los hallazgos corregidos y los pendientes · `docs/revisiones/seguridad-owasp.md`

**Total estimado:** 114 tareas, unas 15 h de trabajo.

## 6. Verificación

Los tests de la API se ejecutan con `npm test` desde la raíz (Vitest). Los frontends no tienen tests, así que su verificación es manual. Con la API en `:3000` y `NODE_ENV` de desarrollo:

```bash
TOKEN_CLI=$(curl -s -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"cliente1@resttek.com","password":"cliente1@resttek.com"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
TOKEN_M1=$(curl -s -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"gerente1@resttek.com","password":"gerente1@resttek.com"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
```

| Caso | Petición | Resultado esperado |
|------|----------|--------------------|
| H1 | Arrancar con `NODE_ENV=production` sin `JWT_SECRET` | El proceso termina con un error claro |
| H1 | Token firmado con `'super-secret-resttek-key'` contra `GET /api/v1/employees` | `401` |
| H2 | `GET /api/v1/orders/active?restaurantId=rest-1` con `TOKEN_CLI` | `403` |
| H2 | `PATCH /api/v1/orders/<id>/items/<itemId>/status` `{"status":"entregado"}` con `TOKEN_CLI` | `403` |
| H3 | `PUT /api/v1/restaurants/rest-2/dishes/<id-de-rest-2>` con `TOKEN_M1` | `403` |
| H3 | `PUT /api/v1/restaurants/rest-1/dishes/<id-de-rest-2>` con `TOKEN_M1` | `404` |
| H3 | `GET /api/v1/restaurants/rest-2/ingredients` con `TOKEN_M1` | `403` |
| H4 | `POST /api/v1/orders` con `quantity: 1000000000` | `400` en milisegundos |
| H4 | `POST /api/v1/orders` con un `dishId` de otro restaurante | `400` |
| H5 | 11 logins fallidos seguidos desde la misma IP | El 11.º devuelve `429` |
| H6 | `POST /api/v1/auth/register` con contraseña `abc` | `400 WeakPasswordError` |
| H6 | Registrar `Foo@x.com` y luego `foo@x.com` | El segundo da `400 DuplicatedEmailError` |
| H7 | `GET /api/v1/public/restaurants` y `/:id` | Sin `email`, `ownerFirstName` ni `ownerLastName` |
| H7 | `GET /api/v1/public/restaurants/rest-1/dishes` | Sin `ingredients` |
| H8 | `POST` de plato con `price: "abc"` | `400` |
| H10 | `curl -i localhost:3000/health` | Sin `X-Powered-By`; con `X-Content-Type-Options: nosniff` |
| H13 | `POST /api/v1/orders` con cuerpo `{` | `400 InvalidJson` |
| H14 | `POST /auth/login` | Respuesta con `token`, `refreshToken` y `expiresIn: 900` |
| H14 | `POST /auth/refresh` con el `refreshToken` | `200` con un par nuevo; el refresh anterior ya no sirve |
| H14 | Repetir `refresh` con el token ya rotado (pasados 10 s) | `401` y la familia entera queda revocada |
| H14 | `POST /auth/logout` y luego `refresh` | `204` y después `401` |
| H14 | `POST /employees/<id>/revoke-sessions` con admin y luego `refresh` de ese empleado | `204` y después `401`; con un manager, `403` |
| F2 | En web-empleados, borrar `auth_token` de `localStorage` dejando `auth_refresh`, y esperar al polling de 30 s | La sesión se renueva sola, sin volver a `/login` |
| F2 | Dos pestañas abiertas, caducar el access token en ambas | Ambas siguen con sesión (ventana de gracia) |
| F2 | Cerrar sesión en una pestaña | La otra pestaña pasa a `/login` |
| F5 | Build de producción de los tres frontends servidos en local, con Chrome headless | Cero `securitypolicyviolation` y cero errores de consola en login y pantallas principales |
| F5 | `curl -i localhost:3000/health` | Cabecera `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` |
| F1/F3 | Iniciar sesión como `cliente1` en `:4201` | Se redirige a `/login` y se limpia la sesión |
| F1 | Iniciar sesión como `camarero1` en `:4201` y escribir `/cocina` | Redirige a `/barra` |
| F1 | Iniciar sesión como `cocinero1` y escribir `/salon` | Redirige a `/cocina` |
| F2 | Poner en `localStorage.auth_token` un JWT caducado y recargar | Redirige a `/login` |
| F4 | Poner `localStorage.auth_user = '{'` y recargar | La app arranca y muestra `/login` (sin pantalla en blanco) |

Regresiones a vigilar:

- El flujo completo de web-empleados: cocina (`pendiente→preparando→listo`), barra (bebida `pendiente→listo`) y salón (`listo→entregado`) con sus roles reales.
- web-admin: un `manager` sigue gestionando platos de su restaurante, y el `admin` sigue gestionando los de cualquiera.
- web-clientes: listado de restaurantes con teléfono, carta pública y creación de pedido.
- El polling de 30 s de `OrderStore` (web-empleados) con un access token de 15 min: debe renovarse sin parpadeos ni redirecciones.
- web-admin y web-clientes, que reciben el mismo interceptor desde `web-shared`.
- El arranque con `npm run dev:api` sin `.env`: debe arrancar con el secreto aleatorio de desarrollo y el aviso en consola.
- El cambio de restaurante en la pestaña de ingredientes (arreglo anterior) sigue funcionando con el nuevo ámbito.

## 7. Riesgos y dudas abiertas

- **Secreto en desarrollo (decidido):** se usa secreto aleatorio por proceso con aviso en consola. Cada reinicio de `tsx watch` invalida las sesiones y hay que volver a iniciar sesión. En producción sigue siendo obligatorio.
- **Transiciones por rol (decidido):** la tabla de D3 está confirmada por el usuario. Única diferencia con las pantallas actuales: el cocinero puede aplicar sus transiciones también a bebidas, aunque la pantalla de cocina solo muestre platos. El camarero solo marca `listo` bebidas, y el manager y el admin avanzan saltando pasos sin retroceder.
- **Pedidos sin plato:** `OrderService` ahora rechaza `dishId` inexistentes. Pedidos antiguos con platos borrados siguen legibles (el `LEFT JOIN` ya lo permite).
- **Cambios de firma en servicios:** `DishService`, `IngredientService` y `OrderService` cambian de firma, así que los tests existentes (`ingredient.service.test.ts`, `order.service.test.ts`) deben ajustarse (T23, T32). `web-admin` no se ve afectado, porque las URLs son las mismas.
- **403 en `GET /restaurants/:id`:** un `manager` de otro restaurante o un `cliente` que hoy lo llame recibirá 403. `web-clientes` usa los endpoints públicos. Falta comprobar si `web-admin` (o `web-empleados`) llama a `GET /restaurants/:id` con un restaurante distinto del de la sesión del usuario: revisarlo con `grep` antes de implementar T14.
- **Enumeración en registro (H12):** se acepta el riesgo, con rate limit como mitigación. Eliminarlo exige verificación por email.
- **Ventana de revocación:** revocar impide renovar, pero el access token ya emitido sigue valiendo hasta 15 minutos. Si hace falta corte inmediato, habría que consultar la BD en cada petición (fuera de alcance).
- **`localStorage`:** los tokens siguen ahí por decisión de mantener Bearer. La CSP, la rotación y la detección de reutilización reducen el daño de un XSS, pero no lo eliminan. Una cookie `HttpOnly` sigue siendo lo más robusto y queda descartada de momento.
- **Carreras entre pestañas:** la ventana de gracia de 10 s evita falsos positivos de reutilización, pero deja una ventana en la que un token robado y reutilizado enseguida no revoca la familia. Se acepta el compromiso y se registra con nivel `warn`.
- **Contrato de auth ampliado:** `login` y `register` devuelven `refreshToken`. Es aditivo, pero `web-admin` y `web-clientes` deben probarse con el nuevo interceptor de `web-shared`. Los clientes antiguos sin refresh dejarán de renovar al cabo de 15 min en vez de 8 h.
- **CSP:** `style-src 'unsafe-inline'` es necesario por los estilos inline de Angular y debilita algo la política. `img-src https:` es amplio por los `logoUrl` externos. `autoCsp` y el `index` por configuración dependen de lo que ofrezca Angular 21 (T101) y se comprobará en el build. Si el servidor de desarrollo mostrase violaciones, no se aplica la CSP allí.
- **Mantenimiento de la tabla:** `refresh_tokens` crece con cada login y renovación. La limpieza al arrancar (T92) es suficiente a esta escala, pero un servidor de larga vida necesitaría una tarea periódica.
- **Dependencias:** `sqlite3` (`tar`, crítica en instalación) queda abierto. Subir Angular puede traer cambios de comportamiento: el build y la revisión manual de los tres frontends (T68) son obligatorios.
- **Logger propio:** se evita añadir `pino` para no crecer dependencias. Si más adelante se necesita rotación o request-id, conviene migrar.
- **Datos existentes:** en `resttek.db` hay ingredientes duplicados por un `npm run seed` anterior (el seed usa `randomUUID`). No afecta a este plan, pero ensucia las pruebas manuales. Se puede resolver recreando la BD.
- **Tests de rutas:** usan `supertest` con repositorios mock. No hay hasta ahora tests de integración HTTP, así que T8, T37, T52, T56 y T64 establecen el patrón.
