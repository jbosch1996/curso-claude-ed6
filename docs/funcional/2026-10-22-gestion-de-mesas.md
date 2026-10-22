# Diseño funcional: Gestión de mesas

- **Fecha:** 2026-10-22
- **Plan de origen:** issue #5 (`docs/plans/2026-10-22-gestion-de-mesas.md`)

## 1. Resumen

Cada restaurante tiene sus mesas, con número, descripción, capacidad y estado (libre, ocupada o reservada). El cliente indica cuántas personas son, elige una mesa libre con sitio suficiente y, al continuar, la mesa queda ocupada y pasa a la carta para hacer su pedido. Los empleados ven el estado de las mesas, lo cambian y consultan los pedidos de las mesas ocupadas; el administrador las crea y mantiene.

## 2. Perfiles de usuario

| Perfil | Descripción | Qué puede hacer |
|--------|-------------|-----------------|
| Administrador | Gestiona todos los restaurantes | Crear, ver, editar y borrar mesas de cualquier restaurante; cambiar su estado |
| Gerente / camarero / cocinero | Personal de un restaurante | Ver las mesas de su restaurante y cambiar su estado. En la app de empleados, el menú "Mesas" lo ven el camarero y el gerente |
| Cliente | Usuario de la app de clientes | Buscar mesas libres según el número de personas, ocupar una y hacer su pedido en ella |

## 3. Funcionalidades

### 3.1 Gestionar las mesas del restaurante

- **Quién:** administrador.
- **Qué hace:** desde el panel del restaurante ("Mesas") crea mesas con número, descripción opcional, capacidad y estado; las edita y las borra.
- **Cuándo:** en cualquier momento.
- **Resultado:** el listado muestra número, descripción, capacidad y estado de cada mesa. El número no puede repetirse en el restaurante (sí en otro). La capacidad va de 1 a 50 personas y la descripción admite hasta 200 caracteres. Una mesa ocupada no se puede borrar: hay que liberarla antes.

### 3.2 Elegir mesa y ocuparla

- **Quién:** cliente.
- **Qué hace:** al elegir un restaurante indica el número de personas (de 1 a 50) y pulsa "Buscar mesas". Ve las mesas libres con capacidad suficiente (número, capacidad y descripción), selecciona una y pulsa "Continuar".
- **Cuándo:** antes de ver la carta. Si no tiene mesa en ese restaurante, la carta le lleva a esta pantalla.
- **Resultado:** la mesa pasa a ocupada y el cliente accede a la carta, donde ve "Mesa N" en la cabecera. Si otra persona la ocupó antes, ve el mensaje "Esa mesa ya no está disponible. Elige otra." y la lista se actualiza. Si no hay mesas libres para su grupo, se le indica. No ve el estado de las mesas ocupadas ni reservadas.

### 3.3 Hacer el pedido en la mesa

- **Quién:** cliente con una mesa ocupada.
- **Qué hace:** añade platos al carrito y confirma el pedido.
- **Resultado:** el pedido queda asociado a su mesa y llega a cocina y barra. Se aceptan pedidos con mesa solo si la mesa está ocupada y es de ese restaurante. Tras confirmar, el cliente conserva su mesa para pedir de nuevo; la app no la libera.

### 3.4 Ver y cambiar el estado de las mesas

- **Quién:** camarero y gerente (menú "Mesas" de la app de empleados); también el cocinero y el administrador a través de la API.
- **Qué hace:** ve la rejilla de mesas de su restaurante con su estado y cambia el estado con un selector entre libre, ocupada y reservada. En las mesas ocupadas ve los pedidos activos de esa mesa con el estado de cada plato.
- **Cuándo:** la pantalla se actualiza sola cada 30 segundos.
- **Resultado:** el cambio se aplica al momento. Para volver a dejar libre una mesa, el empleado cambia su estado a libre (no se libera automáticamente). Solo se ven pedidos con algún plato sin entregar. Un cliente no puede ocupar una mesa reservada.

## 4. Flujos principales

1. El administrador crea la mesa 5 (4 personas, "Terraza") en su restaurante.
2. Un cliente elige el restaurante, indica 3 personas y pulsa "Buscar mesas": aparece la mesa 5.
3. La selecciona y pulsa "Continuar": la mesa pasa a ocupada y se muestra la carta con "Mesa 5".
4. Añade platos y confirma el pedido: llega a cocina y barra con la mesa 5.
5. El camarero abre "Mesas", ve la mesa 5 ocupada con el pedido y el estado de cada plato.
6. Al terminar, el camarero cambia la mesa 5 a libre para que pueda ocuparla otro cliente.

## 5. Reglas y mensajes al usuario

| Situación | Qué ocurre | Mensaje |
|-----------|------------|---------|
| Número de mesa repetido en el restaurante | No se crea ni se edita | `A table with that number already exists` |
| Datos de mesa inválidos (número, capacidad, descripción) | No se guarda | `Table number must be an integer greater than or equal to 1` · `Capacity must be an integer between 1 and 50` · `Description must be a string of at most 200 characters` |
| Estado inválido | No se cambia | `Invalid status: <valor>. Must be one of: libre, ocupada, reservada` |
| Número de personas inválido | No se buscan mesas | `guests must be an integer between 1 and 50` |
| Mesa ocupada por otro, reservada, pequeña, inexistente o de otro restaurante | No se ocupa | `Table is not available` (la app muestra: "Esa mesa ya no está disponible. Elige otra.") |
| Borrar una mesa ocupada | No se borra | `Cannot delete an occupied table` |
| Mesa inexistente o de otro restaurante (gestión) | Se trata como inexistente | `Table not found` |
| Pedido con una mesa que no está ocupada o es de otro restaurante | No se crea el pedido | `Table is not occupied in this restaurant` |
| Personal sin acceso a ese restaurante | Acceso denegado | `Forbidden: No access to this restaurant` |
| Rol sin permiso (p. ej. camarero que crea mesas, cliente que lista todas) | Acceso denegado | `Forbidden: Insufficient permissions` |
| Sin sesión iniciada | Acceso denegado | `Unauthorized: No token provided` |

## 6. Referencia de endpoints

| Acción | Método y ruta | Acceso |
|--------|---------------|--------|
| Buscar mesas libres | `GET /api/v1/restaurants/:restaurantId/tables/available?guests=N` | Cliente |
| Ocupar una mesa | `POST /api/v1/restaurants/:restaurantId/tables/:id/occupy` | Cliente |
| Listar / ver mesas | `GET /api/v1/restaurants/:restaurantId/tables[/:id]` | Personal del restaurante y administrador |
| Cambiar el estado | `PATCH /api/v1/restaurants/:restaurantId/tables/:id/status` | Personal del restaurante y administrador |
| Crear / editar / borrar | `POST` · `PUT` · `DELETE /api/v1/restaurants/:restaurantId/tables[/:id]` | Administrador |
| Hacer el pedido en la mesa | `POST /api/v1/orders` (campo de mesa) | Requiere sesión |

## 7. Fuera de alcance

- Reservas con fecha, hora o titular: el estado "reservada" solo se fija a mano.
- Liberar la mesa automáticamente (al entregar todo o al pedir la cuenta).
- Registrar qué cliente ocupa la mesa o impedir que un cliente ocupe varias; una mesa ocupada sin pedido sigue así hasta que un empleado la libere.
- Recordar la mesa si el cliente recarga la página: tendrá que elegir mesa de nuevo (la anterior sigue ocupada hasta que la libere un empleado).
- Histórico de pedidos de una mesa: solo se ven los pedidos con algún plato sin entregar.
- Mostrar el número de mesa en la vista de Salón de la app de empleados (sigue mostrando el identificador de la mesa del pedido).
