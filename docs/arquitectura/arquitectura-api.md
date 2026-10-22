# Arquitectura de la API

La API de Resttek es una aplicación **Node.js con Express 5 y TypeScript** (`packages/api`), con persistencia en SQLite.

En su interior conviven **dos estilos arquitectónicos**. Conocer cuál aplica a cada dominio es lo primero que hay que tener claro antes de tocar código.

---

## Los dos estilos

### 1. Hexagonal + DDD → solo el contexto `employee`

`src/contexts/` es el único sitio donde se aplica arquitectura hexagonal (Ports & Adapters) con DDD. Contiene dos carpetas:

```
src/contexts/
├── employee/        → Empleados, auth, roles
└── shared/          → Value objects y utilidades HTTP comunes
```

El contexto `employee` sigue las tres capas clásicas:

```
contexts/employee/
├── domain/
│   ├── Employee.ts
│   ├── Employee.test.ts
│   ├── IEmployeeRepository.ts
│   ├── IAuthService.ts
│   └── value-objects/
│       ├── Role.ts
│       └── Role.test.ts
├── application/
│   ├── LoginUseCase.ts
│   ├── CreateEmployeeUseCase.ts
│   ├── RegisterClientUseCase.ts
│   ├── *.test.ts
│   └── mocks/
└── infrastructure/
    ├── SqliteEmployeeRepository.ts
    ├── SqliteEmployeeRepository.test.ts
    ├── BcryptAuthService.ts
    └── http/
        ├── AuthController.ts
        ├── EmployeeController.ts
        ├── dependencies.ts
        ├── auth.routes.ts
        ├── employee.routes.ts
        └── restaurant-employee.routes.ts
```

`contexts/shared/` no es un bounded context de negocio: contiene el value object `Email` y los middlewares y el `errorHandler` de Express.

### 2. Por capas → `restaurant`, `dish`, `ingredient`, `order` y descuentos/puntos (`discount-code`, `points-rule`, `bill`, `loyalty`) y `table` (mesas)

El resto de dominios **no** usan bounded contexts. Se organizan en carpetas transversales por tipo de fichero:

```
src/
├── models/          → Interfaces TypeScript + funciones de normalización
├── repositories/    → Interfaz + implementación SQLite
├── services/        → Lógica de negocio (equivalente a los casos de uso)
├── controllers/     → Adaptadores HTTP
└── routes/          → Definición de rutas y composición de dependencias
```

Con un fichero por dominio en cada carpeta: `models/dish.model.ts`, `services/dish.service.ts`, `repositories/dish.repository.ts`, etc.

**Diferencia clave**: aquí no hay entidades de dominio con comportamiento. `Restaurant`, `Dish`, `Ingredient` y `Order` son `interface` planas; la validación vive en los servicios y en funciones sueltas del modelo.

---

## Capa de Dominio (contexto `employee`)

### Entidades

`Employee` es la **única entidad de dominio** del proyecto. Patrón: **constructor privado + factory method `create()`**:

```tsx
export class Employee {
    private constructor(props: { /* ... */ }) { /* asignar campos */ }

    public static create(props: EmployeeProps): Employee {
        if (!props.firstName || props.firstName.trim() === '') {
            throw new FirstNameRequiredError()
        }
        // ... resto de validaciones

        return new Employee({
            ...props,
            email: new Email(props.email),   // Value Object
            role: new Role(props.role)       // Value Object
        })
    }

    get id(): string { return this._id }
    get email(): string { return this._email.getValue() }
    get role(): EmployeeRoleType { return this._role.getValue() }
}
```

**Reglas:**

- Constructor siempre **privado**.
- Validaciones de negocio en `create()`.
- Propiedades con **getters**, sin setters directos.
- Los Value Objects validan dentro de su propio constructor.

### Value Objects

Solo existen **dos clases** Value Object:

| Value Object | Ubicación | Validación |
| --- | --- | --- |
| `Email` | `contexts/shared/domain/value-objects/Email.ts` | Formato email (regex) |
| `Role` | `contexts/employee/domain/value-objects/Role.ts` | admin, manager, camarero, cocinero, cliente |

Los demás conceptos que podrían ser Value Objects **no están implementados como clases**, sino como tipo unión + función de normalización en `models/`:

| Concepto | Implementación real | Valores válidos |
| --- | --- | --- |
| Unidad de ingrediente | `normalizeIngredientUnit()` en `models/ingredient.model.ts` | kg, g, l, ml, unidad |
| Categoría de plato | `normalizeDishCategory()` en `models/dish.model.ts` | entrante, principal, postre, bebida |
| Estado de pedido | `normalizeOrderStatus()` en `models/order.model.ts` | pendiente, preparando, listo, entregado |
| Teléfono | `PHONE_REGEX` dentro de `services/restaurant.service.ts` | `/^\+?[\d\s\-()]{7,20}$/` |

Las funciones `normalizeX()` hacen `trim()` + `toLowerCase()` y lanzan el error de dominio correspondiente si el valor no es válido.

### Interfaces de Repositorio

El prefijo `I` **solo** se usa en el contexto `employee` (`IEmployeeRepository`, `IAuthService`). En la capa por capas la interfaz va sin prefijo y convive con su implementación en el mismo fichero:

```tsx
// repositories/restaurant.repository.ts
export interface RestaurantRepository {
    findById(id: string): Promise<Restaurant | null>
    findAll(): Promise<Restaurant[]>
    save(restaurant: Restaurant): Promise<void>
}

export class SqliteRestaurantRepository implements RestaurantRepository { /* ... */ }
```

---

## Capa de Aplicación

### Casos de Uso (solo `employee`)

Clase con un único método `execute()`. Dependencias por **inyección de constructor**. Solo hay tres:

| Caso de uso | Qué hace |
| --- | --- |
| `LoginUseCase` | Valida credenciales y devuelve `{ token, employee }` |
| `CreateEmployeeUseCase` | Alta de empleado por parte de un admin |
| `RegisterClientUseCase` | Auto-registro de cliente; fuerza `role: 'cliente'` y `restaurantId: null`, y devuelve token |

```tsx
export class CreateEmployeeUseCase {
    constructor(
        private readonly employeeRepo: IEmployeeRepository,
        private readonly authService: IAuthService
    ) {}

    async execute(dto: CreateEmployeeDTO): Promise<Employee> {
        const existing = await this.employeeRepo.findByEmail(dto.email)
        if (existing) throw new DuplicatedEmailError()

        const passwordHash = await this.authService.hashPassword(dto.passwordPlain)
        const employee = Employee.create({ id: randomUUID(), ...dto, passwordHash })

        await this.employeeRepo.save(employee)
        return employee
    }
}
```

### Servicios (resto de dominios)

En `restaurant`, `dish`, `ingredient` y `order` el equivalente al caso de uso es un **servicio con varios métodos**, no una clase por acción:

```tsx
export class RestaurantService {
    constructor(private readonly restaurantRepository: RestaurantRepository) {}

    async create(dto: CreateRestaurantDTO): Promise<Restaurant> {
        const now = new Date().toISOString()
        const restaurant = this.buildRestaurant({ id: randomUUID(), ...dto, createdAt: now, updatedAt: now })
        await this.restaurantRepository.save(restaurant)
        return restaurant
    }

    // update(), getById(), getAll()

    // buildRestaurant() concentra las validaciones que en DDD irían en la entidad
    private buildRestaurant(props): Restaurant { /* validaciones + objeto plano */ }
}
```

### DTOs

Se declaran en el mismo fichero que los consume (el caso de uso o el servicio):

```tsx
export interface CreateRestaurantDTO {
    name: string
    address: string
    email: string
    phone: string
    ownerFirstName: string
    ownerLastName: string
    logoUrl: string | null
}
```

---

## Capa de Infraestructura

### Repositorios SQLite

Todos siguen el mismo patrón: `save()` decide entre UPDATE e INSERT, y un método privado mapea la fila a objeto:

```tsx
export class SqliteRestaurantRepository implements RestaurantRepository {
    constructor(private db: Database) {}

    async save(restaurant: Restaurant): Promise<void> {
        const existing = await this.findById(restaurant.id)
        // UPDATE si existe, INSERT si no
    }

    private mapToRestaurant(row: RestaurantRow): Restaurant {
        return { id: row.id, /* ... */ }   // objeto plano
    }
}
```

En `employee` el mapeo reconstruye la entidad con `Employee.create()`; en el resto devuelve el objeto plano directamente. El renombrado `snake_case` → `camelCase` se hace con alias en el propio SQL (`owner_first_name as ownerFirstName`).

### Controladores y Rutas

Las rutas conectan URLs con controladores y aplican middlewares. La **composición de dependencias se hace en el propio fichero de rutas**:

```tsx
const dishRepository = new SqliteDishRepository(dbConfig)
const dishService = new DishService(dishRepository)
const dishController = new DishController(dishService)

const router = Router({ mergeParams: true })

router.post('/', authenticate, authorize(['admin', 'manager']), dishController.create)
```

La excepción es `employee`: como sus rutas están repartidas en tres ficheros, el cableado se extrae a `contexts/employee/infrastructure/http/dependencies.ts`, que exporta `authController` y `employeeController` ya construidos.

`mergeParams: true` es obligatorio en los routers montados bajo un prefijo con parámetros (`/restaurants/:restaurantId/...`) para poder leer `req.params.restaurantId`.

---

## Endpoints

Todos cuelgan de `/api/v1`. La columna **Roles** indica qué valores de `req.user.role` acepta `authorize()`; “autenticado” significa que basta con un JWT válido, sin filtro de rol.

### Públicos (sin autenticación)

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/health` | Healthcheck. Devuelve `{ status: 'ok' }`. **No lleva el prefijo `/api/v1`** |
| `POST` | `/api/v1/auth/login` | Login. Devuelve `{ token, employee }` |
| `POST` | `/api/v1/auth/register` | Auto-registro de cliente. Devuelve `{ token, employee }` (201) |
| `GET` | `/api/v1/public/restaurants` | Listado de restaurantes para la app de clientes |
| `GET` | `/api/v1/public/restaurants/:id` | Detalle de restaurante |
| `GET` | `/api/v1/public/restaurants/:restaurantId/dishes` | Carta pública del restaurante |

### Restaurantes

| Método | Ruta | Roles |
| --- | --- | --- |
| `POST` | `/api/v1/restaurants` | admin |
| `GET` | `/api/v1/restaurants` | autenticado |
| `GET` | `/api/v1/restaurants/:id` | autenticado |
| `PUT` | `/api/v1/restaurants/:id` | admin |

`GET /api/v1/restaurants` no devuelve lo mismo a todo el mundo: si el rol es `admin` devuelve todos los restaurantes; si no, devuelve un array con el restaurante de `req.user.restaurantId`, o vacío si el usuario no tiene restaurante asignado.

### Empleados

| Método | Ruta | Roles |
| --- | --- | --- |
| `POST` | `/api/v1/employees` | admin |
| `GET` | `/api/v1/employees` | admin — acepta `?limit=`, `?offset=` y `?role=` |
| `GET` | `/api/v1/employees/:id` | admin |
| `GET` | `/api/v1/restaurants/:restaurantId/employees` | admin |

### Platos e ingredientes

| Método | Ruta | Roles |
| --- | --- | --- |
| `POST` | `/api/v1/restaurants/:restaurantId/dishes` | admin, manager |
| `GET` | `/api/v1/restaurants/:restaurantId/dishes` | admin, manager, camarero, cocinero |
| `GET` | `/api/v1/restaurants/:restaurantId/dishes/:id` | admin, manager, camarero, cocinero |
| `PUT` | `/api/v1/restaurants/:restaurantId/dishes/:id` | admin, manager |
| `DELETE` | `/api/v1/restaurants/:restaurantId/dishes/:id` | admin, manager |
| `POST` | `/api/v1/restaurants/:restaurantId/ingredients` | admin |
| `GET` | `/api/v1/restaurants/:restaurantId/ingredients` | admin, manager, cocinero |
| `GET` | `/api/v1/restaurants/:restaurantId/ingredients/:id` | admin, manager, cocinero |
| `PUT` | `/api/v1/restaurants/:restaurantId/ingredients/:id` | admin |
| `DELETE` | `/api/v1/restaurants/:restaurantId/ingredients/:id` | admin |

Los ingredientes son **más restrictivos** que los platos: solo `admin` puede crear, editar o borrar.

### Pedidos

| Método | Ruta | Roles |
| --- | --- | --- |
| `POST` | `/api/v1/orders` | autenticado — el `clientId` se toma del JWT, no del body |
| `GET` | `/api/v1/orders/active` | admin, manager, camarero, cocinero — el admin **requiere `?restaurantId=`** (400 si falta); el resto ve su restaurante |
| `GET` | `/api/v1/orders/mine` | autenticado — pedidos del usuario del JWT |
| `GET` | `/api/v1/orders/:id` | autenticado |
| `PATCH` | `/api/v1/orders/:orderId/items/:itemId/status` | admin, manager, camarero, cocinero (transición permitida por rol) — devuelve 204 sin cuerpo |

`POST /orders`, `GET /orders/mine` y `GET /orders/:id` solo exigen JWT (el servicio comprueba que el pedido sea del cliente o del personal de su restaurante); `GET /orders/active` y el `PATCH` de estado aplican `authorize()` con los roles de personal y, además, el servicio valida la transición de estado por rol.

`GET /orders/active` devuelve los pedidos del restaurante que tengan **al menos un ítem** en estado distinto de `entregado`.

Al crear un pedido, el servicio **expande las cantidades**: un ítem con `quantity: 3` se guarda como 3 filas de `order_items` con `quantity: 1` cada una, para poder seguir el estado de cada unidad por separado.

Si el pedido trae `tableId`, `OrderService.create` comprueba (cuando recibe el `TableRepository`, que el cableado por defecto de `order.routes.ts` le pasa) que sea una mesa **ocupada del mismo restaurante**; si no, `InvalidOrderError('Table is not occupied in this restaurant')`. `tableId` guarda el `id` de la mesa; sigue sin haber FK en `orders.table_id`, y un pedido sin mesa (`null`) sigue siendo válido.

### Mesas

Por capas: `models/table.model.ts`, `repositories/table.repository.ts` (+ `mocks/MockTableRepository.ts`), `services/table.service.ts`, `controllers/table.controller.ts`, `routes/table.routes.ts` (factory `createTableRouter(service)`). Cada mesa tiene número (único por restaurante), descripción opcional, capacidad (1-50) y estado `libre | ocupada | reservada`.

| Método | Ruta | Roles |
| --- | --- | --- |
| `GET` | `/api/v1/restaurants/:restaurantId/tables/available?guests=N` | `cliente` — mesas libres con capacidad ≥ N, sin estado (`id, number, description, capacity`) |
| `POST` | `/api/v1/restaurants/:restaurantId/tables/:id/occupy` | `cliente` — body `{ guests }`; 200 o 400 `TableNotAvailableError` |
| `GET` | `/api/v1/restaurants/:restaurantId/tables` | admin, manager, camarero, cocinero (+ `requireRestaurantAccess`) — con estado |
| `GET` | `/api/v1/restaurants/:restaurantId/tables/:id` | ídem — 404 si es de otro restaurante |
| `PATCH` | `/api/v1/restaurants/:restaurantId/tables/:id/status` | ídem — body `{ status }`, cambio libre entre los tres estados |
| `POST` | `/api/v1/restaurants/:restaurantId/tables` | admin (+ `requireRestaurantAccess`) — 201 |
| `PUT` | `/api/v1/restaurants/:restaurantId/tables/:id` | admin (+ `requireRestaurantAccess`) |
| `DELETE` | `/api/v1/restaurants/:restaurantId/tables/:id` | admin (+ `requireRestaurantAccess`) — 204; `TableOccupiedError` (400) si está ocupada |

Dos detalles que conviene conocer:

- **Las rutas del cliente no usan `requireRestaurantAccess`**: un cliente tiene `restaurantId` nulo y el middleware lo rechazaría; el `restaurantId` de la URL acota la consulta. `/available` se declara antes de `/:id`.
- **La ocupación es atómica**: `occupyIfAvailable` es un único `UPDATE … WHERE status = 'libre' AND capacity >= ?` y devuelve `changes === 1`, así que dos clientes que piden la misma mesa a la vez no pueden ocuparla ambos. Si no se puede (no existe, es de otro restaurante, está ocupada, reservada o es pequeña) siempre se devuelve el mismo `Table is not available`.

### Códigos de descuento, puntos y cuenta

Por capas: `models/{discount-code,points-rule,bill}.model.ts`, repositorios (`discount-code`, `points-rule`, `client-points`, `bill`, con mocks en `repositories/mocks/`), servicios (`DiscountCodeService`, `PointsRuleService`, `BillService`, `LoyaltyService`), controladores y routers con factory (`createDiscountCodeRouter(service)`, etc.) para poder probarlos con mocks.

| Método | Ruta | Roles |
| --- | --- | --- |
| `POST` | `/api/v1/restaurants/:restaurantId/discount-codes` | admin, manager (+ `requireRestaurantAccess`) — 201 |
| `GET` | `/api/v1/restaurants/:restaurantId/discount-codes` | admin, manager (+ `requireRestaurantAccess`) |
| `GET` | `/api/v1/restaurants/:restaurantId/discount-codes/:id` | admin, manager (+ `requireRestaurantAccess`) — 404 si es de otro restaurante |
| `PUT` | `/api/v1/restaurants/:restaurantId/discount-codes/:id` | admin, manager (+ `requireRestaurantAccess`) |
| `DELETE` | `/api/v1/restaurants/:restaurantId/discount-codes/:id` | admin, manager (+ `requireRestaurantAccess`) — 204 |
| `POST` | `/api/v1/restaurants/:restaurantId/points-rules` | admin, manager (+ `requireRestaurantAccess`) — 201 |
| `GET` | `/api/v1/restaurants/:restaurantId/points-rules` | admin, manager (+ `requireRestaurantAccess`) — ordenadas por puntos |
| `PUT` | `/api/v1/restaurants/:restaurantId/points-rules/:id` | admin, manager (+ `requireRestaurantAccess`) |
| `DELETE` | `/api/v1/restaurants/:restaurantId/points-rules/:id` | admin, manager (+ `requireRestaurantAccess`) — 204 |
| `GET` | `/api/v1/restaurants/:restaurantId/points-earning` | admin, manager (+ `requireRestaurantAccess`) — ritmo de ganancia; sin configurar, `{ amount: 1, points: 1, isDefault: true, updatedAt: null }` |
| `PUT` | `/api/v1/restaurants/:restaurantId/points-earning` | admin, manager (+ `requireRestaurantAccess`) — body `{ amount, points }`, 200; 400 `InvalidPointsEarningError` |
| `GET` | `/api/v1/loyalty/:restaurantId` | autenticado — `{ balance, rules }` del usuario del JWT |
| `POST` | `/api/v1/orders/:orderId/bill` | autenticado, solo el propietario del pedido — body `{ discountCode?, pointsRuleId? }`, 201 |
| `GET` | `/api/v1/orders/:orderId/bill` | autenticado — propietario o personal del restaurante (admin, manager, camarero, cocinero) |

Reglas de `BillService.create`:

- Una sola cuenta por pedido (`BillAlreadyRequestedError`, 400); un pedido ajeno o inexistente es `OrderNotFoundError` (404).
- El **código** se normaliza (mayúsculas, sin espacios) y debe existir en el restaurante del pedido, estar activo y no caducado. Cualquier fallo devuelve el mismo mensaje `Invalid or expired discount code`, sin distinguir la causa.
- El **canje de puntos** usa una equivalencia (`points_rules`) del restaurante: exige saldo suficiente (`InsufficientPointsError`) y que su descuento no supere lo que queda tras el código (`InvalidBillError`). Código y puntos se pueden combinar.
- **Puntos ganados:** `earnedPoints(total, ritmo)` = `floor(total / amount) * points` en céntimos enteros, con el ritmo del restaurante (`points_earning_rates`, `PointsEarningService`/`SqlitePointsEarningRepository`). Sin ritmo configurado se usa `DEFAULT_POINTS_EARNING` (1 € → 1 punto, es decir `floor(total)`). El total es el pagado tras descuentos; el cambio de ritmo no es retroactivo. `amount` va de 0,01 a 10.000 € (redondeado a céntimos) y `points` es un entero de 1 a 10.000.
- **Sin transacciones** (la conexión SQLite es compartida): se inserta la cuenta (`UNIQUE(order_id)`), se descuentan los puntos con un `UPDATE … WHERE balance >= ?` atómico (si falla, se borra la cuenta) y se suman los puntos ganados.

### Packs

Por capas: `models/pack.model.ts` (`validatePackFields`, `eligibleDishes`, `resolvePackSelection`), `repositories/pack.repository.ts` (+ `mocks/MockPackRepository.ts`), `services/pack.service.ts`, `controllers/pack.controller.ts`, `routes/pack.routes.ts` (factory `createPackRouter(service)`) y `routes/pack.public.routes.ts` (factory `createPublicPackRouter(service)`). Un pack tiene nombre, descripción opcional, precio fijo, disponibilidad, de 1 a 4 **categorías** de plato sin repetir (el cliente elige un plato de cada una) y una lista de **platos excluidos** (lista negra: los platos nuevos de la categoría entran solos).

| Método | Ruta | Roles |
| --- | --- | --- |
| `GET` | `/api/v1/public/restaurants/:restaurantId/packs` | público — packs disponibles con `slots: [{ category, dishes }]` (solo platos elegibles); omite los packs con alguna categoría vacía y no expone `excludedDishIds` |
| `POST` | `/api/v1/restaurants/:restaurantId/packs` | admin, manager (+ `requireRestaurantAccess`) — 201; `InvalidPackError` (400) |
| `GET` | `/api/v1/restaurants/:restaurantId/packs` | admin, manager (+ `requireRestaurantAccess`) — ordenados por nombre |
| `GET` | `/api/v1/restaurants/:restaurantId/packs/:id` | admin, manager (+ `requireRestaurantAccess`) — `PackNotFoundError` (404) si es de otro restaurante |
| `PUT` | `/api/v1/restaurants/:restaurantId/packs/:id` | admin, manager (+ `requireRestaurantAccess`) |
| `DELETE` | `/api/v1/restaurants/:restaurantId/packs/:id` | admin, manager (+ `requireRestaurantAccess`) — 204 |

Body de gestión: `{ name, description?, price, available?, categories, excludedDishIds? }`; los platos excluidos deben ser del restaurante.

**Pedidos con packs.** `POST /orders` acepta `packs: [{ packId, dishIds, quantity, notes? }]` además de `items` (que pasa a ser opcional si llegan packs; entre ambos, de 1 a 50 líneas, y las unidades de un pack cuentan `quantity × nº de platos` para el máximo de 100). El pack debe existir, ser del restaurante y estar disponible, y `dishIds` debe traer exactamente un plato elegible por categoría; si no, `InvalidOrderError` (400). Cada unidad de pack se guarda como **ítems normales** (un `order_item` por plato, así cocina y barra no cambian) más una fila en `order_item_packs` con `pack_id`, `pack_name`, `pack_instance_id` y `unit_price`. El precio del pack va entero en el primer ítem y 0 en el resto; `getOrderItems` lee `COALESCE(oip.unit_price, d.price) AS dish_price`, de modo que **`BillService` no cambia** y el subtotal (y con él descuentos y puntos) usa el precio del pack. Precio y nombre quedan congelados en el pedido aunque luego se edite o borre el pack. Los ítems de pack añaden `packId`, `packName` y `packInstanceId`; los ítems sueltos no llevan esos campos.

---

## Middlewares

Definidos en `contexts/shared/infrastructure/http/middlewares.ts`.

| Middleware | Función | Respuesta al fallar |
| --- | --- | --- |
| `authenticate` | Verifica el JWT de `Authorization: Bearer <token>` y vuelca el payload en `req.user` | 401 |
| `authorize(roles)` | Comprueba que `req.user.role` está en la lista | 403 |

Ambos responden directamente, sin pasar por el `errorHandler`.

---

## Gestión de Errores

Jerarquía: `Error` → `AppError` (abstracta) → errores específicos en `errors/DomainErrors.ts`. `AppError` asigna `this.name = this.constructor.name`, y el `errorHandler` decide el código HTTP a partir de ese nombre:

- **404**: `EmployeeNotFoundError`, `RestaurantNotFoundError`, `IngredientNotFoundError`, `DishNotFoundError`, `DiscountCodeNotFoundError`, `PointsRuleNotFoundError`, `BillNotFoundError`, `OrderNotFoundError`, `TableNotFoundError`
- **401**: `InvalidCredentialsError`
- **400**: cualquier otro `AppError`
- **500**: errores no controlados

Dos excepciones que conviene conocer:

- `OrderNotFoundError` está en la lista de 404 del `errorHandler` (los controladores de descuentos y cuenta delegan en él), pero `OrderController` no lo usa.
- `OrderController` no delega en el `errorHandler`: es el único controlador que **no llama a `next(error)`**, sino que hace su propio `try/catch` y construye la respuesta a mano. Por eso `GET /orders/:id` sí devuelve 404, pero el `PATCH` de estado devuelve 400 para el mismo error.

---

## Path Aliases

Definidos en `tsconfig.json` (`baseUrl: ./src`). En tiempo de ejecución los resuelve `tsx`, y en los tests el plugin `vite-tsconfig-paths`.

| Alias | Ruta real |
| --- | --- |
| `@config/*` | `src/config/*` |
| `@errors/*` | `src/errors/*` |
| `@shared/*` | `src/contexts/shared/*` |
| `@employee/*` | `src/contexts/employee/*` |
| `@models/*` | `src/models/*` |
| `@repositories/*` | `src/repositories/*` |
| `@services/*` | `src/services/*` |
| `@controllers/*` | `src/controllers/*` |
| `@routes/*` | `src/routes/*` |
| `@scripts/*` | `src/scripts/*` |

Los imports llevan extensión `.js` (`import { dbConfig } from '@config/database.js'`) porque el paquete es ESM (`"type": "module"`, `module: nodenext`).

---

## Base de Datos

La clase `Database` (`config/database.ts`) encapsula `sqlite3` con una API basada en promesas:

- `initialize()`: abre la conexión y ejecuta `runInitialMigrations()` (`CREATE TABLE IF NOT EXISTS`)
- `run()`: INSERT/UPDATE/DELETE
- `all<T>()`: SELECT de múltiples filas
- `get<T>()`: SELECT de una fila
- `close()`: cierra la conexión
- `getDb()`: acceso crudo; lanza `DatabaseNotInitializedError` si no se ha llamado a `initialize()`

El módulo exporta una **instancia única** (`export const dbConfig = new Database()`) que se importa allá donde hace falta. No es un singleton con `getInstance()`: nada impide construir otra `Database`, y de hecho los tests lo hacen.

La ruta del fichero se decide en el constructor: `:memory:` si `NODE_ENV=test`, y `packages/api/resttek.db` en cualquier otro caso.

---

## Tests

Con **Vitest** (`npm test` desde la raíz, o `npm run test:watch` dentro de `packages/api`). Los tests son unitarios y conviven con el código que prueban:

- Dominio y casos de uso de `employee`, con dobles en `contexts/employee/application/mocks/`
- Servicios y repositorios de `restaurant`, `ingredient` y `order`, con dobles en `repositories/mocks/`

**No hay tests de integración HTTP.** `supertest` figura como dependencia de desarrollo pero no se usa en ningún test, así que las rutas, los middlewares y el `errorHandler` no están cubiertos.
