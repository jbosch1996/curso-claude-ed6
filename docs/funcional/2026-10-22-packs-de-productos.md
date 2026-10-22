# Diseño funcional: Packs de productos

- **Fecha:** 2026-10-22
- **Plan de origen:** issue #9 (`docs/plans/2026-10-22-packs-de-productos.md`)

## 1. Resumen

Además de los platos sueltos, cada restaurante puede ofrecer **packs**: menús a precio fijo en los que el cliente elige un plato de cada categoría (por ejemplo, entrante + principal + bebida por 20 €). El administrador decide qué categorías forman el pack y puede bloquear platos concretos dentro de él (por ejemplo, la cerveza en la bebida). El cliente paga el precio del pack, no la suma de los platos, y los descuentos y puntos se calculan sobre ese precio.

## 2. Perfiles de usuario

| Perfil | Descripción | Qué puede hacer |
|--------|-------------|-----------------|
| Administrador | Gestiona todos los restaurantes | Crear, ver, editar y borrar packs de cualquier restaurante |
| Gerente | Responsable de un restaurante | Lo mismo que el administrador, pero solo en su restaurante |
| Camarero / cocinero | Personal de un restaurante | No gestionan packs. Reciben los platos de un pack como platos normales del pedido |
| Cliente | Usuario de la app de clientes | Ver los packs del restaurante, elegir un plato por categoría, añadirlos al carrito y pedirlos |

## 3. Funcionalidades

### 3.1 Gestionar los packs del restaurante

- **Quién:** administrador o gerente.
- **Qué hace:** desde el panel del restaurante ("Packs") crea un pack con nombre, descripción opcional, precio y disponibilidad, y marca las categorías que lo forman (entrante, principal, postre, bebida; de una a cuatro, sin repetir). Por cada categoría marcada ve los platos del restaurante de esa categoría, todos marcados como **elegibles**; desmarcar un plato lo bloquea en ese pack. También puede editar y borrar packs.
- **Cuándo:** en cualquier momento.
- **Resultado:** el listado muestra nombre, composición (p. ej. "Entrante + Principal + Bebida"), precio, número de platos excluidos y si está disponible. Los platos que se añadan después a una categoría del pack son elegibles automáticamente. Si se borra un plato que estaba bloqueado en un pack, el bloqueo desaparece con él.

### 3.2 Ver los packs en la carta

- **Quién:** cliente (también sin sesión, como el resto de la carta).
- **Qué hace:** al entrar en la carta de un restaurante ve, encima de las categorías de platos, la sección "Packs" con el nombre, la descripción, el precio y un desplegable por categoría.
- **Cuándo:** solo aparecen los packs disponibles y que tienen al menos un plato elegible en cada categoría. En cada desplegable solo salen los platos disponibles y no bloqueados.
- **Resultado:** el cliente elige un plato de cada categoría; el botón "Añadir pack" se habilita cuando ha elegido todos.

### 3.3 Pedir packs

- **Quién:** cliente con mesa ocupada.
- **Qué hace:** añade packs al carrito (puede mezclarlos con platos sueltos), ajusta la cantidad o los elimina y confirma el pedido.
- **Cuándo:** igual que un pedido normal.
- **Resultado:** el carrito muestra cada pack con los platos elegidos y su precio; dos packs iguales con la misma elección se suman en la misma línea. El total del carrito usa el precio del pack. Al confirmar, cada plato elegido llega a cocina y barra como un plato más del pedido, con su propio estado.

### 3.4 Ver el pedido y pedir la cuenta

- **Quién:** cliente.
- **Qué hace:** abre el detalle del pedido.
- **Resultado:** cada pack aparece como una línea "Nombre del pack: plato · plato · plato" con el precio del pack y el estado de sus platos; los platos sueltos se muestran como siempre. Al pedir la cuenta, el subtotal suma el precio de los packs (el que tenían al hacer el pedido, aunque después se cambie o se borre el pack) y los platos sueltos; códigos de descuento y puntos se aplican sobre ese subtotal.

## 4. Flujos principales

1. El gerente entra en el panel de su restaurante, pulsa "Packs" y "Nuevo pack".
2. Escribe "Menú del día", precio 18 €, marca Entrante, Principal y Bebida, desmarca "Cerveza" en la lista de bebidas y guarda.
3. Un cliente ocupa una mesa y abre la carta: en "Packs" ve "Menú del día — 18,00 €" con tres desplegables (la cerveza no aparece en bebidas).
4. Elige ensalada, pizza y agua, pulsa "Añadir pack" y, además, añade un refresco suelto.
5. En el carrito ve el pack con sus platos (18 €) y el refresco; confirma el pedido.
6. Cocina y barra reciben ensalada, pizza, agua y refresco como platos normales y van cambiando su estado.
7. El cliente pide la cuenta: subtotal = 18 € + precio del refresco.

## 5. Reglas y mensajes al usuario

| Situación | Qué ocurre | Mensaje |
|-----------|------------|---------|
| Precio vacío, cero o negativo | No se guarda el pack | `Price must be a positive number` |
| Nombre vacío o de más de 100 caracteres | No se guarda el pack | `Name is required and must have at most 100 characters` |
| Descripción de más de 300 caracteres | No se guarda el pack | `Description must be a string of at most 300 characters` |
| Ninguna categoría marcada | El formulario no se envía | "Elige al menos una categoría." (en la app de administración) |
| Categoría repetida o más de 4 | No se guarda el pack | `categories cannot be repeated` / `categories must be an array with 1 to 4 categories` |
| Plato bloqueado que no es del restaurante | No se guarda el pack | `Excluded dishes must belong to the restaurant` |
| Pack de otro restaurante o inexistente (gestión) | No se muestra ni se modifica | `Pack not found` |
| Gerente que intenta gestionar packs de otro restaurante | Acceso denegado (403) | — |
| Camarero, cocinero o cliente en la gestión de packs | Acceso denegado (403) | — |
| Pedido con un pack inexistente, de otro restaurante o no disponible | No se crea el pedido | `Pack <id> is not available in this restaurant` |
| Selección con un plato bloqueado, no disponible, de otra categoría o de otro restaurante | No se crea el pedido | `Dish <id> cannot be chosen in pack <id>` |
| Selección que no tiene exactamente un plato por categoría | No se crea el pedido | `Pack <id> needs exactly one dish per category: <categorías>` |
| Pedido vacío o con más de 50 líneas (platos sueltos + packs) | No se crea el pedido | `An order must have 1 to 50 lines` |
| Más de 100 platos en total (cada pack cuenta sus platos) | No se crea el pedido | `An order cannot exceed 100 units` |
| Cantidad de packs fuera de 1-20 por línea | No se crea el pedido | `quantity must be an integer between 1 and 20` |
| Cualquier error al confirmar en la app de clientes | El carrito se conserva | "Error al confirmar el pedido. Inténtalo de nuevo." |

## 6. Referencia de endpoints

| Acción | Método y ruta | Acceso |
|--------|---------------|--------|
| Ver los packs de la carta | `GET /api/v1/public/restaurants/:restaurantId/packs` | Público |
| Listar packs | `GET /api/v1/restaurants/:restaurantId/packs` | Requiere sesión (admin o gerente del restaurante) |
| Ver un pack | `GET /api/v1/restaurants/:restaurantId/packs/:id` | Requiere sesión (admin o gerente del restaurante) |
| Crear pack | `POST /api/v1/restaurants/:restaurantId/packs` | Requiere sesión (admin o gerente del restaurante) |
| Editar pack | `PUT /api/v1/restaurants/:restaurantId/packs/:id` | Requiere sesión (admin o gerente del restaurante) |
| Borrar pack | `DELETE /api/v1/restaurants/:restaurantId/packs/:id` | Requiere sesión (admin o gerente del restaurante) |
| Hacer un pedido con packs | `POST /api/v1/orders` (campo `packs`) | Requiere sesión |

## 7. Fuera de alcance

- Pedir dos platos de la misma categoría en un pack (p. ej. "2 principales").
- Elegir explícitamente qué platos entran (lista blanca): solo se pueden bloquear platos.
- Suplementos de precio por elegir ciertos platos dentro de un pack.
- Mostrar el nombre del pack en la app de empleados: cocina y barra ven los platos sueltos.
- En "Mis pedidos" y en el listado de ítems, los platos de un pack distintos del primero figuran con precio 0 (el total del pedido sí es correcto).
