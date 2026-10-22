# Diseño funcional: Ritmo de ganancia de puntos configurable por restaurante

- **Fecha:** 2026-10-22
- **Plan de origen:** issue #7 (`docs/plans/2026-10-22-sistema-de-puntos-configurable.md`)

## 1. Resumen

Cada restaurante puede decidir cuántos puntos gana un cliente según lo que paga: "por cada X € gastados, Y puntos". Hasta ahora todos los restaurantes daban siempre 1 punto por euro. Un restaurante que no configure nada sigue igual que antes. El resto del programa de puntos (saldo, canje y cuenta) no cambia.

## 2. Perfiles de usuario

| Perfil | Descripción | Qué puede hacer |
|--------|-------------|-----------------|
| Administrador | Gestiona todos los restaurantes | Consultar y cambiar el ritmo de ganancia de puntos de cualquier restaurante |
| Gerente | Responsable de un restaurante | Lo mismo, solo en su restaurante |
| Camarero / cocinero | Personal del restaurante | No pueden consultar ni cambiar el ritmo |
| Cliente | Usuario registrado de la app de clientes | Gana puntos al pedir la cuenta según el ritmo del restaurante; no ve ni cambia el ritmo |

## 3. Funcionalidades

### 3.1 Consultar el ritmo de ganancia de puntos

- **Quién:** administrador y gerente.
- **Qué hace:** en el panel del restaurante, en la página "Puntos de fidelidad", la tarjeta "Ganancia de puntos" muestra el ritmo actual ("Por cada (€)" y "Puntos").
- **Cuándo:** en cualquier momento; el gerente solo en su restaurante.
- **Resultado:** si el restaurante nunca lo ha configurado, ve 1 € → 1 punto y el aviso "Ahora se aplica el valor por defecto: 1 punto por cada euro."

### 3.2 Cambiar el ritmo de ganancia de puntos

- **Quién:** administrador y gerente.
- **Qué hace:** escribe el importe en euros (X) y los puntos (Y) y pulsa "Guardar".
- **Cuándo:** en cualquier momento.
- **Resultado:** se muestra "Ganancia de puntos guardada." y, desde ese momento, las cuentas nuevas del restaurante dan Y puntos por cada X € pagados. Las cuentas ya pedidas conservan los puntos que dieron. El importe admite céntimos (de 0,01 € a 10.000 €; si se escriben más decimales, se redondea a céntimos) y los puntos son un número entero de 1 a 10.000. Para volver al comportamiento original basta con guardar 1 € → 1 punto.

### 3.3 Ganar puntos al pedir la cuenta

- **Quién:** el cliente.
- **Qué hace:** pide la cuenta de su pedido como hasta ahora (con o sin código de descuento y canje de puntos).
- **Cuándo:** al pedir la cuenta.
- **Resultado:** gana Y puntos por cada bloque **completo** de X € del total que paga, después de los descuentos. Lo que no llega a un bloque completo no da puntos. Ejemplos con "10 € → 3 puntos": 27,50 € dan 6 puntos; 9,99 € dan 0 puntos. Con el valor por defecto (1 € → 1 punto) 22,50 € dan 22 puntos, igual que antes. La cuenta muestra los puntos ganados, que se suman al saldo del cliente en ese restaurante.

## 4. Flujos principales

1. El gerente entra en el panel de su restaurante y abre "Puntos de fidelidad".
2. En "Ganancia de puntos" ve 1 € → 1 punto (valor por defecto).
3. Cambia a "Por cada 10 €" y "3 puntos" y pulsa "Guardar"; aparece "Ganancia de puntos guardada.".
4. Un cliente hace un pedido de 27,50 € y pide la cuenta sin descuentos.
5. La cuenta muestra un total de 27,50 € y "Has ganado 6 puntos"; su saldo en el restaurante aumenta en 6.

## 5. Reglas y mensajes al usuario

| Situación | Qué ocurre | Mensaje |
|-----------|------------|---------|
| Importe no numérico, 0, negativo, menor de 0,01 € o mayor de 10.000 € | No se guarda | `Amount must be a positive number up to 10000 with at most 2 decimals` |
| Puntos no enteros, 0, negativos o mayores de 10.000 | No se guarda | `Points must be a positive integer up to 10000` |
| El total pagado no llega a un bloque completo | La cuenta se pide con normalidad y no gana puntos | — |
| Restaurante sin ritmo configurado | Se aplica 1 punto por euro | — |
| Gerente de otro restaurante | Acceso denegado | `Forbidden: No access to this restaurant` |
| Cliente, camarero o cocinero | Acceso denegado | `Forbidden: Insufficient permissions` |
| Sin sesión iniciada | Acceso denegado | `Unauthorized: No token provided` |

## 6. Referencia de endpoints

| Acción | Método y ruta | Acceso |
|--------|---------------|--------|
| Consultar el ritmo de ganancia | `GET /api/v1/restaurants/:restaurantId/points-earning` | Administrador, gerente del restaurante |
| Cambiar el ritmo de ganancia | `PUT /api/v1/restaurants/:restaurantId/points-earning` | Administrador, gerente del restaurante |

## 7. Fuera de alcance

- Historial de movimientos de puntos, caducidad de puntos, gasto mínimo o tope de puntos por cuenta.
- Recalcular los puntos de cuentas ya pedidas al cambiar el ritmo.
- Mostrar el ritmo de ganancia al cliente en la app de clientes (solo ve los puntos ganados en la cuenta).
- Un ritmo común para todos los restaurantes de la plataforma.
- Cambios en las equivalencias de canje de puntos o en la app de empleados.
