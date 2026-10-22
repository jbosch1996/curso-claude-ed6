# Diseño funcional: Protección de acceso y datos de restaurantes y pedidos

- **Fecha:** 2026-10-21
- **Plan de origen:** `docs/plans/2026-10-21-corregir-vulnerabilidades-owasp.md` (parte implementada: diseños D1 a D4)

## 1. Resumen

Cada persona solo puede ver y modificar lo que le corresponde. Un empleado trabaja únicamente con los platos, ingredientes y pedidos de su propio restaurante, y un cliente solo ve sus propios pedidos. Además, cada empleado solo puede hacer con un pedido los pasos propios de su puesto (cocina prepara, camarero entrega). Por último, la aplicación rechaza datos absurdos, como cantidades enormes o precios que no son números, que antes podían bloquear el sistema o dejar datos incorrectos.

## 2. Perfiles de usuario

| Perfil | Descripción | Qué puede hacer |
|--------|-------------|-----------------|
| Visitante sin sesión | Persona que no ha iniciado sesión | Nada de lo descrito aquí: cualquier acción protegida responde que falta iniciar sesión. |
| Cliente | Persona registrada que hace pedidos | Hacer pedidos de platos disponibles, consultar sus propios pedidos y ver un pedido suyo. |
| Cocinero | Empleado de cocina de un restaurante | Ver los pedidos activos y los datos de su restaurante, y pasar ítems de «pendiente» a «preparando» y de «preparando» a «listo». |
| Camarero | Empleado de sala y barra de un restaurante | Ver los pedidos activos de su restaurante, marcar como «listo» las bebidas pendientes y entregar los ítems listos. |
| Gerente (manager) | Responsable de un restaurante | Gestionar los platos de su restaurante, consultar sus ingredientes y su ficha, ver sus pedidos activos y avanzar el estado de los ítems. |
| Administrador | Responsable de la plataforma | Acceder a los datos de cualquier restaurante y avanzar el estado de cualquier ítem. |

## 3. Funcionalidades

### 3.1 Sesión protegida por una clave segura

- **Quién:** todos los perfiles con sesión.
- **Qué hace:** las sesiones se firman con una clave secreta que ya no es pública. Una sesión fabricada con la clave antigua deja de funcionar.
- **Cuándo:** al iniciar la aplicación. En producción la clave es obligatoria y debe tener al menos 32 caracteres; si falta o es corta, la aplicación no arranca. En desarrollo, si no se configura ninguna, se genera una clave temporal y se avisa en la consola.
- **Resultado:** quien usa la aplicación en desarrollo debe volver a iniciar sesión cada vez que se reinicia el servidor sin clave configurada.

### 3.2 Cada empleado solo trabaja con su restaurante

- **Quién:** gerente, cocinero y camarero.
- **Qué hace:** al consultar o modificar platos, ingredientes o la ficha de un restaurante, solo se permite el restaurante al que pertenece el empleado. El administrador puede acceder a todos.
- **Cuándo:** siempre que se abre un restaurante, sus platos o sus ingredientes.
- **Resultado:** si un gerente intenta entrar en otro restaurante, recibe un aviso de falta de permisos. Si intenta cambiar o borrar un plato o un ingrediente concreto de otro restaurante, el sistema responde que no existe, sin confirmar que existe en otro sitio.

### 3.3 Los platos solo usan ingredientes del mismo restaurante

- **Quién:** gerente y administrador.
- **Qué hace:** al crear o editar un plato, cada ingrediente indicado debe existir y pertenecer al restaurante del plato.
- **Cuándo:** al guardar un plato con ingredientes.
- **Resultado:** si se usa un ingrediente de otro restaurante o inexistente, el plato no se guarda y se explica cuál es el problema.

### 3.4 Pedidos visibles solo para quien corresponde

- **Quién:** cliente, empleados y administrador.
- **Qué hace:** un empleado solo ve los pedidos activos de su restaurante, aunque intente consultar otro. El administrador debe indicar de qué restaurante quiere verlos. Un pedido concreto solo lo ve el cliente que lo hizo, los empleados de ese restaurante y el administrador. Los clientes no pueden ver los pedidos activos de ningún restaurante.
- **Cuándo:** al abrir las pantallas de cocina, barra o salón, o al consultar un pedido.
- **Resultado:** quien no tiene derecho a ver un pedido recibe «no encontrado», igual que si no existiera.

### 3.5 Cada puesto hace solo sus pasos del pedido

- **Quién:** cocinero, camarero, gerente y administrador.
- **Qué hace:** controla quién puede cambiar el estado de un ítem de un pedido:

  | Perfil | Cambios permitidos |
  |--------|--------------------|
  | Cocinero | De «pendiente» a «preparando» y de «preparando» a «listo», en cualquier ítem |
  | Camarero | De «pendiente» a «listo» solo en bebidas, y de «listo» a «entregado» |
  | Gerente y administrador | Cualquier avance, aunque se salte pasos |

  Nadie puede retroceder un estado ni repetir el mismo. El cliente no puede cambiar ningún estado.
- **Cuándo:** al marcar un ítem como preparando, listo o entregado.
- **Resultado:** un cambio no permitido se rechaza y el ítem queda como estaba. Un empleado de otro restaurante recibe «no encontrado».

### 3.6 Pedidos con límites razonables

- **Quién:** cliente (y cualquier usuario con sesión que haga un pedido).
- **Qué hace:** un pedido debe tener entre 1 y 50 líneas, con 1 a 20 unidades por línea, un máximo de 100 unidades en total, notas de hasta 200 caracteres y una mesa de hasta 50 caracteres. Los platos deben existir, estar disponibles y ser del restaurante elegido.
- **Cuándo:** al enviar un pedido.
- **Resultado:** un pedido fuera de esos límites se rechaza de inmediato, sin bloquear el sistema. Si falla el guardado, no queda un pedido a medias. Los errores internos ya no muestran detalles técnicos.

### 3.7 Datos numéricos y enlaces válidos

- **Quién:** gerente y administrador.
- **Qué hace:** el precio de un plato y la cantidad de cada ingrediente del plato deben ser números mayores que cero. El stock de un ingrediente debe ser un número igual o mayor que cero. El logotipo de un restaurante, si se indica, debe ser una dirección web `http` o `https`.
- **Cuándo:** al crear o editar platos, ingredientes y restaurantes.
- **Resultado:** valores como «abc», «10» entre comillas o direcciones que no son web (por ejemplo `javascript:`) se rechazan. Al editar un plato sin indicar si está disponible, se conserva su disponibilidad actual.

## 4. Flujos principales

1. Un cliente inicia sesión, elige platos del restaurante A y envía un pedido de 2 unidades. El pedido se guarda y el cliente puede consultarlo.
2. El cocinero del restaurante A abre cocina, ve el pedido, marca un ítem como «preparando» y después como «listo».
3. Un camarero del restaurante A ve el ítem listo y lo marca como «entregado».
4. Un cocinero del restaurante B abre su cocina y no ve el pedido del restaurante A. Si intenta cambiar su estado, recibe «no encontrado».
5. El gerente del restaurante A edita el precio de uno de sus platos. Si intenta lo mismo con un plato del restaurante B, no se modifica nada.
6. Un cliente que intenta consultar la cocina de un restaurante o cambiar el estado de un ítem recibe un aviso de falta de permisos.

## 5. Reglas y mensajes al usuario

Los mensajes se muestran tal como los devuelve la aplicación.

| Situación | Qué ocurre | Mensaje |
|-----------|------------|---------|
| Sin sesión | Se rechaza la acción | `Unauthorized: No token provided` |
| Sesión inválida, mal firmada o caducada | Se rechaza la acción | `Unauthorized: Invalid token` |
| Perfil sin permiso para esa acción | Se rechaza la acción | `Forbidden: Insufficient permissions` |
| Empleado en un restaurante que no es el suyo | Se rechaza la acción | `Forbidden: No access to this restaurant` |
| Plato o ingrediente de otro restaurante | Se trata como inexistente | `Dish not found` / `Ingredient not found` |
| Plato con ingrediente ajeno o inexistente | No se guarda | `Ingredient <id> does not belong to this restaurant` |
| Pedido o ítem ajeno o inexistente | Se trata como inexistente | `Order not found` |
| Administrador pide pedidos activos sin indicar restaurante | Se rechaza | `restaurantId is required` |
| Cambio de estado sin indicar el estado | Se rechaza | `status is required` |
| Estado de ítem que no existe | Se rechaza | `Estado inválido: <valor>. Debe ser uno de: pendiente, preparando, listo, entregado` |
| Cambio de estado no permitido para ese perfil o hacia atrás | Se rechaza, el ítem no cambia | `Role <rol> cannot move an item from <estado> to <estado>` |
| Pedido sin líneas o con demasiadas | Se rechaza | `items must be an array with 1 to 50 lines` |
| Línea sin plato | Se rechaza | `Every item needs a dishId` |
| Cantidad no entera o fuera de 1 a 20 | Se rechaza | `quantity must be an integer between 1 and 20` |
| Más de 100 unidades en el pedido | Se rechaza | `An order cannot exceed 100 units` |
| Notas demasiado largas o que no son texto | Se rechaza | `notes must be a string of at most 200 characters` |
| Mesa demasiado larga | Se rechaza | `tableId must be a string of at most 50 characters` |
| Plato inexistente, no disponible o de otro restaurante | Se rechaza el pedido | `Dish <id> is not available in this restaurant` |
| Error interno al guardar un pedido | Se rechaza sin detalles técnicos | `Internal Server Error` |
| Precio no numérico, cero o negativo | No se guarda | `Price must be a positive number` |
| Cantidad de ingrediente de un plato no válida | No se guarda | `Ingredient quantity must be positive` |
| Stock negativo | No se guarda | `Stock cannot be negative` |
| Stock que no es un número | No se guarda | `Stock must be a finite number` |
| Logotipo que no es una dirección `http` o `https` | No se guarda | `Logo URL must be a valid http or https URL` |

## 6. Referencia de endpoints

| Acción | Método y ruta | Acceso |
|--------|---------------|--------|
| Crear un pedido | `POST /api/v1/orders` | Requiere sesión |
| Ver mis pedidos | `GET /api/v1/orders/mine` | Requiere sesión |
| Ver un pedido | `GET /api/v1/orders/:id` | Requiere sesión (propietario, empleados del restaurante o administrador) |
| Ver pedidos activos de un restaurante | `GET /api/v1/orders/active` | Requiere sesión (administrador, gerente, camarero, cocinero) |
| Cambiar el estado de un ítem de pedido | `PATCH /api/v1/orders/:orderId/items/:itemId/status` | Requiere sesión (administrador, gerente, camarero, cocinero) |
| Listar, ver, crear, editar o borrar platos | `/api/v1/restaurants/:restaurantId/dishes` | Requiere sesión, del propio restaurante o administrador |
| Listar, ver, crear, editar o borrar ingredientes | `/api/v1/restaurants/:restaurantId/ingredients` | Requiere sesión, del propio restaurante o administrador |
| Ver la ficha de un restaurante | `GET /api/v1/restaurants/:id` | Requiere sesión, del propio restaurante o administrador |

## 7. Fuera de alcance

- Limitar los intentos de inicio de sesión, exigir contraseñas seguras y normalizar los correos (parte D5 del plan).
- Cabeceras de seguridad, restricción de orígenes, registro de errores y eventos de seguridad (D6).
- Reducir los datos públicos de restaurantes y platos (D7).
- Actualización de dependencias (D8).
- Cambios en las pantallas: guardas por rol, caducidad de sesión y sesión renovable (D9, D10 y D11).
- Cerrar una sesión de forma inmediata o revocarla: la sesión actual sigue valiendo hasta que caduque (8 horas) hasta que se implemente la renovación con revocación (D10).
- No se ha modificado ninguna pantalla. Este diseño describe el comportamiento de la aplicación comprobado con pruebas automáticas y peticiones directas; el recorrido completo desde el navegador (cocina, barra, salón, administración y clientes) queda pendiente de revisar.
