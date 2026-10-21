# Plan: <título breve de la funcionalidad o bug>

- **Tipo:** <feature | bugfix>
- **Fecha:** <AAAA-MM-DD>
- **Estado:** Pendiente

## 1. Contexto

<Qué se quiere conseguir o qué error ocurre y por qué importa. Si es un bug: pasos para reproducirlo, comportamiento actual y comportamiento esperado.>

## 2. Objetivo y alcance

**Incluye:**

- <qué entra en el plan>

**No incluye:**

- <qué queda fuera a propósito>

## 3. Análisis del código actual

<Archivos y capas afectadas (routes, controllers, services, repositories, models, helpers) y qué hay que cambiar en cada una. Referencias con `ruta/archivo.js`.>

| Capa | Archivo | Cambio previsto |
|------|---------|-----------------|
| <capa> | <archivo> | <cambio> |

## 4. Diseño de la solución

<Decisiones técnicas: endpoints, campos, validaciones, códigos de estado, cambios en el esquema SQLite, errores. Respetar las convenciones del proyecto (mensajes en español, `400 { errores }`, `404 { error }`).>

## 5. Lista de tareas

> Cada tarea debe poder completarse en 5-10 minutos. Si una tarea es mayor, divídela.

- [ ] **T1** (5 min) — <tarea concreta> · `<archivo>`
- [ ] **T2** (10 min) — <tarea concreta> · `<archivo>`

## 6. Verificación

<Cómo comprobar que funciona: peticiones de ejemplo (curl) con resultado esperado, casos límite y regresiones a vigilar. El proyecto no tiene tests automáticos.>

## 7. Riesgos y dudas abiertas

- <riesgo, dependencia o pregunta pendiente>
