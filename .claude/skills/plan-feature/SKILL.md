---
name: plan-feature
description: Planifica cómo implementar una nueva funcionalidad o corregir un bug y genera un plan detallado en docs/plans con una lista de tareas de 5-10 minutos. Úsala cuando el usuario pida planificar, diseñar o preparar una feature o la corrección de un bug antes de programarla.
argument-hint: <descripción de la funcionalidad o del bug>
---

# Planificar funcionalidad o bug

Genera un plan de implementación en un archivo Markdown dentro de `docs/plans/`. **Esta skill solo planifica: no modifica código de la aplicación.**

## Entrada

La descripción de la funcionalidad o del bug viene en los argumentos de la skill. Si es demasiado vaga para planificar, haz las preguntas imprescindibles con `AskUserQuestion` antes de continuar.

## Pasos

1. **Clasifica** la petición como `feature` o `bugfix`.
2. **Investiga el código actual**: lee `CLAUDE.md`, `docs/` y los archivos de las capas afectadas (`routes → controllers → services → repositories`, `models`, `helpers`). Si es un bug, localiza la causa raíz o, si no se puede confirmar, indícalo en el plan como duda abierta.
3. **Diseña la solución** respetando la arquitectura por capas y las convenciones del proyecto (mensajes y campos en español, `400 { errores }`, `404 { error }`, paginación según `docs/api/api-pagination.md` en los GET de listados, etc.).
4. **Lee la plantilla** `assets/plantilla-plan.md` (junto a este `SKILL.md`) y rellénala respetando **todas sus secciones y su orden**. No elimines secciones; si una no aplica, escribe "No aplica" y el motivo.
5. **Escribe la lista de tareas** (sección 5) siguiendo las reglas de abajo.
6. **Guarda el plan** en `docs/plans/<AAAA-MM-DD>-<slug>.md`, donde `<slug>` es kebab-case, en español y sin tildes (p. ej. `2026-10-15-filtrar-vendehumos-por-usuario.md`). Si el archivo ya existe, no lo sobrescribas: añade un sufijo numérico.
7. **Informa al usuario** de la ruta del plan, con un resumen breve (objetivo, número de tareas y tiempo total estimado) y las dudas abiertas, si las hay.

## Reglas de la lista de tareas

- Cada tarea debe poder hacerse en **5-10 minutos**. Si estimas más, divídela en tareas menores.
- Formato: `- [ ] **T<n>** (<5|10> min) — <acción concreta> · \`<archivo>\``.
- Una tarea = una acción verificable y con un solo propósito (p. ej. "añadir columna `x` al DDL en `models/…`", no "implementar el recurso").
- Ordénalas por dependencia respetando las capas: primero `models`/`helpers`, luego `repositories`, `services`, `controllers`, `routes`, y al final verificación y documentación.
- Incluye tareas de verificación manual (peticiones `curl`) y de actualización de documentación (`CLAUDE.md`, `docs/`) cuando proceda.

## Restricciones

- Escribe el plan **en español**.
- No implementes el plan ni edites archivos fuera de `docs/plans/`.
- No hagas commit; si el usuario lo quiere, que use `/commit`.
- No inventes archivos, funciones ni endpoints: todo lo que cites del código actual debe haberlo comprobado.
