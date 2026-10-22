# Diseño funcional: El seed borra los datos previos antes de rellenar

- **Fecha:** 2026-10-22
- **Plan de origen:** issue #4 (`docs/plans/2026-10-22-seed-borra-datos-previos.md`)

## 1. Resumen

Al ejecutar `npm run seed`, la base de datos de desarrollo se deja siempre exactamente igual: primero se eliminan todos los datos que hubiera (incluido lo creado o modificado a mano) y después se cargan los datos de ejemplo. Así se puede volver al punto de partida cuando se quiera, sin duplicados ni restos, y el comando también funciona sobre una base de datos nueva.

## 2. Perfiles de usuario

| Perfil | Descripción | Qué puede hacer |
|--------|-------------|-----------------|
| Desarrollador | Persona que prepara o reinicia la base de datos de desarrollo | Ejecutar el seed para dejar la base con los datos de ejemplo |

Los usuarios de las apps (administrador, empleados y clientes) no ejecutan el seed, pero notan su efecto: sus cuentas se regeneran.

## 3. Funcionalidades

### 3.1 Reiniciar la base de datos con los datos de ejemplo

- **Quién:** desarrollador.
- **Qué hace:** ejecuta `npm run seed`. El comando elimina todos los datos de todas las tablas y carga los datos de ejemplo: 2 restaurantes, 10 usuarios (administrador, gerentes, cocineros, camareros y 2 clientes), ingredientes, platos, un pedido de muestra, códigos de descuento, equivalencias de puntos, mesas y un pack.
- **Cuándo:** en cualquier momento, con la base vacía, ya usada o sin crear.
- **Resultado:** al terminar muestra cuántas filas de datos previos eliminó y la lista de credenciales (la contraseña de cada usuario es su propio email). Ejecutarlo varias veces deja siempre el mismo resultado, sin datos duplicados.

### 3.2 Efecto sobre las sesiones y los datos propios

- **Quién:** cualquier usuario de las apps que estuviera en uso.
- **Qué ocurre:** todo lo creado a mano (restaurantes, platos, códigos, mesas, packs, pedidos, cuentas, puntos y clientes registrados) desaparece. Los usuarios de ejemplo se vuelven a crear con otros identificadores.
- **Resultado:** las sesiones abiertas dejan de corresponder a un usuario existente, así que hay que volver a iniciar sesión.

### 3.3 Protección frente a producción

- **Quién:** desarrollador.
- **Qué hace:** si el comando se lanza con `NODE_ENV=production`, se niega a ejecutarse y no toca la base de datos.
- **Resultado:** el mensaje `Seed would delete all data; refusing to run with NODE_ENV=production`. Si además falta `JWT_SECRET`, el comando termina antes con el aviso de que ese secreto es obligatorio en producción; en ambos casos no se borra nada.

## 4. Flujos principales

1. El desarrollador ha creado y modificado datos a mano mientras probaba.
2. Ejecuta `npm run seed`.
3. El comando informa de las filas eliminadas, carga los datos de ejemplo y lista las credenciales.
4. Vuelve a iniciar sesión (por ejemplo con `admin@resttek.com`) y encuentra la base en su estado inicial.

## 5. Reglas y mensajes al usuario

| Situación | Qué ocurre | Mensaje |
|-----------|------------|---------|
| Ejecución normal | Se borran todos los datos y se rellenan | `Previous data deleted: <N> rows from <M> tables.` y, al terminar, `=== Seed completado ===` |
| Base de datos nueva | Funciona sin errores de claves foráneas | `Previous data deleted: 0 rows from <M> tables.` |
| `NODE_ENV=production` | No se ejecuta y no se borra nada | `Seed failed: Error: Seed would delete all data; refusing to run with NODE_ENV=production` (o el aviso de `JWT_SECRET` obligatorio si falta ese secreto) |
| Fallo durante el seed | El comando termina con error | `Seed failed: <error>` |

## 6. Referencia de endpoints

No aplica: el seed es un comando de consola (`npm run seed`), no un endpoint de la API.

## 7. Fuera de alcance

- Copias de seguridad previas o confirmación antes de borrar.
- Conservar datos propios o elegir qué tablas reiniciar.
- Ejecutarlo con la API escribiendo a la vez: puede dar un error de base de datos ocupada; en ese caso, parar la API y repetir.
- Cambiar los datos de ejemplo que se cargan.
