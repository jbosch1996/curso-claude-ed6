# Diseño funcional: Códigos de descuento y canje de puntos al pedir la cuenta

- **Fecha:** 2026-10-22
- **Plan de origen:** issue #8 (`docs/plans/2026-10-22-codigos-de-descuento-y-puntos.md`)

## 1. Resumen

Los restaurantes pueden crear códigos de descuento y definir cuántos puntos equivalen a cada descuento. Los clientes, al pedir la cuenta de un pedido, pueden aplicar un código y/o canjear los puntos que hayan acumulado. Cada vez que piden la cuenta ganan puntos nuevos en función de lo que pagan.

## 2. Perfiles de usuario

| Perfil | Descripción | Qué puede hacer |
|--------|-------------|-----------------|
| Administrador | Gestiona todos los restaurantes | Crear, ver, editar, activar/desactivar y borrar códigos de descuento y equivalencias de puntos de cualquier restaurante |
| Gerente | Responsable de un restaurante | Lo mismo, solo en su restaurante |
| Camarero / cocinero | Personal del restaurante | Consultar la cuenta de los pedidos de su restaurante; no gestionan códigos ni equivalencias |
| Cliente | Usuario registrado de la app de clientes | Pedir la cuenta de sus pedidos con código y/o puntos, consultar su saldo de puntos y volver a ver la cuenta |

## 3. Funcionalidades

### 3.1 Gestionar códigos de descuento

- **Quién:** administrador y gerente.
- **Qué hace:** desde el panel del restaurante ("Códigos de descuento") crea un código con su texto, el tipo de descuento (porcentaje o importe fijo en euros), el valor, una fecha de caducidad opcional y si está activo. Puede editarlo, activarlo o desactivarlo desde el listado y borrarlo.
- **Cuándo:** en cualquier momento; el gerente solo en su restaurante.
- **Resultado:** el código se guarda en mayúsculas y sin espacios. Un código solo puede existir una vez por restaurante, aunque puede repetirse en restaurantes distintos. Los porcentajes van de 0 (exclusivo) a 100; los importes fijos deben ser positivos. El código tiene entre 3 y 30 caracteres: letras sin tilde, números, guion o guion bajo.

### 3.2 Definir la equivalencia entre puntos y descuento

- **Quién:** administrador y gerente.
- **Qué hace:** desde "Puntos" añade escalones del tipo "10 puntos = 1 €", "100 puntos = 10 €", los edita o los borra.
- **Cuándo:** en cualquier momento.
- **Resultado:** el cliente verá estos escalones al pedir la cuenta. No puede haber dos escalones con los mismos puntos en un restaurante. Sin escalones, los clientes no pueden canjear puntos.

### 3.3 Pedir la cuenta

- **Quién:** el cliente que hizo el pedido.
- **Qué hace:** en el detalle de su pedido pulsa "Pedir la cuenta". Opcionalmente escribe un código de descuento (sin importar mayúsculas ni espacios) y/o elige un escalón de canje de puntos. Ve su saldo de puntos y los escalones que no alcanza aparecen desactivados.
- **Cuándo:** una sola vez por pedido; no hace falta que todos los platos estén entregados.
- **Resultado:** la cuenta queda guardada y se muestra el desglose: subtotal, descuento por código, puntos canjeados con su descuento, total y puntos ganados. Un código y un canje de puntos se pueden combinar; los descuentos nunca dejan el total por debajo de cero (un importe fijo mayor que el subtotal descuenta solo el subtotal).

### 3.4 Ganar y consultar puntos

- **Quién:** el cliente.
- **Qué hace:** al pedir la cuenta gana 1 punto por cada euro del total pagado (solo la parte entera: 22,50 € dan 22 puntos). Los puntos son de cada restaurante y no se pueden usar en otro.
- **Resultado:** el saldo se muestra al pedir la cuenta en ese restaurante y el cliente ve cuántos puntos ha ganado en la cuenta.

### 3.5 Consultar la cuenta de un pedido

- **Quién:** el cliente propietario y el personal del restaurante del pedido (también el administrador).
- **Resultado:** se muestra la cuenta ya pedida. Si el pedido no tiene cuenta, o es de otro cliente o restaurante, se informa de que no se encuentra.

## 4. Flujos principales

1. El gerente entra en el panel de su restaurante, abre "Puntos" y crea "100 puntos = 10 €".
2. Abre "Códigos de descuento" y crea `VERANO10`: porcentaje, 10, sin caducidad, activo.
3. Un cliente hace un pedido de 25 € y entra en su detalle.
4. Escribe `verano10` y pulsa "Pedir la cuenta".
5. Ve: subtotal 25,00 €, código de descuento -2,50 €, total 22,50 € y "Has ganado 22 puntos".
6. En un pedido posterior, con 22 puntos de saldo, elige "10 puntos = 1 € de descuento" y pide la cuenta: el total baja 1 €, se descuentan 10 puntos y se suman los ganados por el nuevo total.

## 5. Reglas y mensajes al usuario

| Situación | Qué ocurre | Mensaje |
|-----------|------------|---------|
| Código inexistente, inactivo, caducado, mal escrito o de otro restaurante | No se pide la cuenta; no se revela el motivo | `Invalid or expired discount code` (la app muestra: "El código de descuento no es válido o ha caducado.") |
| Saldo de puntos insuficiente | No se pide la cuenta ni se gastan puntos | `Insufficient points` (app: "No tienes puntos suficientes para ese canje.") |
| Escalón de puntos inexistente o de otro restaurante | No se pide la cuenta | `Points rule not found` |
| El canje de puntos supera lo que queda por pagar | No se pide la cuenta ni se gastan puntos | `Points discount exceeds the remaining amount to pay` |
| La cuenta del pedido ya se pidió | No se crea otra | `The bill for this order was already requested` |
| Pedido ajeno o inexistente | Se trata como inexistente | `Order not found` |
| Consultar la cuenta de un pedido que no la tiene | No se encuentra | `Bill not found` |
| Código repetido en el mismo restaurante | No se crea | `Discount code already exists` |
| Código con formato inválido | No se guarda | `Code must be 3 to 30 characters: letters, digits, "-" or "_"` |
| Tipo, valor o caducidad incorrectos | No se guarda | `Invalid type. Must be one of: percent, fixed` · `Value must be a positive number` · `Percentage cannot exceed 100` · `expiresAt must be a valid date` |
| Puntos repetidos en un restaurante | No se crea | `A points rule with those points already exists` |
| Puntos o descuento inválidos | No se guarda | `Points must be a positive integer` · `Discount must be a positive number` |
| Código o escalón de otro restaurante (gestión) | Se trata como inexistente | `Discount code not found` · `Points rule not found` |
| Gerente o personal sin permiso sobre ese restaurante | Acceso denegado | `Forbidden: No access to this restaurant` |
| Cliente, camarero o cocinero intentan gestionar códigos o equivalencias | Acceso denegado | `Forbidden: Insufficient permissions` |
| Sin sesión iniciada | Acceso denegado | `Unauthorized: No token provided` |

## 6. Referencia de endpoints

| Acción | Método y ruta | Acceso |
|--------|---------------|--------|
| Crear / listar códigos | `POST` · `GET /api/v1/restaurants/:restaurantId/discount-codes` | Administrador, gerente del restaurante |
| Ver / editar / borrar un código | `GET` · `PUT` · `DELETE /api/v1/restaurants/:restaurantId/discount-codes/:id` | Administrador, gerente del restaurante |
| Crear / listar equivalencias | `POST` · `GET /api/v1/restaurants/:restaurantId/points-rules` | Administrador, gerente del restaurante |
| Editar / borrar una equivalencia | `PUT` · `DELETE /api/v1/restaurants/:restaurantId/points-rules/:id` | Administrador, gerente del restaurante |
| Ver saldo y escalones | `GET /api/v1/loyalty/:restaurantId` | Requiere sesión (saldo del propio usuario) |
| Pedir la cuenta | `POST /api/v1/orders/:orderId/bill` | Requiere sesión (propietario del pedido) |
| Consultar la cuenta | `GET /api/v1/orders/:orderId/bill` | Requiere sesión (propietario o personal del restaurante) |

## 7. Fuera de alcance

- Límite de usos de un código o de un uso por cliente.
- Previsualizar el descuento antes de pedir la cuenta.
- Pago real o pasarela de pago: los puntos se ganan al pedir la cuenta, sin comprobar un cobro.
- Historial de movimientos de puntos y pantalla de saldo independiente del detalle del pedido.
- Cambios en la app de empleados.
- La app no muestra el saldo hasta abrir un pedido sin cuenta.
