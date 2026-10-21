---
name: implementar-plan
description: Implementa un plan de implementación que el usuario adjunta (normalmente un archivo de docs/plans generado con plan-feature) y, al terminar, genera un diseño funcional en docs/funcional con las funcionalidades descritas a nivel de usuario. Úsala cuando el usuario pida implementar, ejecutar o desarrollar un plan adjunto.
argument-hint: <ruta del plan adjunto, p. ej. docs/plans/2026-10-15-xxx.md>
---

# Implementar un plan

Implementa el plan que el usuario adjunta y documenta el resultado en un **diseño funcional** orientado al usuario.

## Entrada

El plan llega adjunto: como ruta en los argumentos (p. ej. `docs/plans/<fecha>-<slug>.md`), como archivo referenciado con `@` o pegado en el mensaje. **Si no hay ningún plan adjunto, no lo busques ni lo inventes**: pídeselo al usuario con `AskUserQuestion` y detente.

## Pasos

1. **Lee el plan completo** y `CLAUDE.md`. Si el plan contradice la arquitectura (`routes → controllers → services → repositories`) o las convenciones del proyecto, avisa al usuario antes de programar.
2. **Resuelve las dudas abiertas** de la sección "Riesgos y dudas abiertas" del plan: si bloquean la implementación, pregunta con `AskUserQuestion`; si no, aplica la opción más conservadora y anótala.
3. **Crea el git worktree de trabajo** (ver "Aislamiento con git worktree"): todos los cambios se hacen en él, nunca en el árbol principal.
4. **Prepara la red de seguridad**: ejecuta `npm test` **antes de tocar código**. Si el proyecto aún no tiene tests, configura **Vitest** (`npm install -D vitest supertest`) con `"test": "vitest run"` en `package.json` y un `vitest.config.js` mínimo (CommonJS, entorno `node`). Para poder testear sin abrir puerto, `index.js` debe exportar la `app` y llamar a `listen` solo cuando se ejecuta directamente (`require.main === module`). Si Vitest no resuelve `node:sqlite`, comprueba primero que usas una versión reciente y, si persiste, decláralo como externo en la configuración (`server.deps.external`). Los tests arrancan la app con `JWT_SECRET` y un `DB_PATH` temporal (`:memory:` o un archivo en el scratchpad), nunca con `data.db`. Si la suite ya existente falla antes de empezar, avisa al usuario y no sigas hasta aclararlo.
5. **Implementa con TDD estricto** (ver abajo), tarea a tarea en orden (T1, T2…), respetando las capas y convenciones (mensajes y campos en español, `400 { errores }`, `404 { error }`, paginación según `docs/api/api-pagination.md` en los GET de listados). Al completar cada tarea, marca su casilla en el plan (`- [ ]` → `- [x]`).
6. **Verifica toda la aplicación**: ejecuta la suite completa (`npm test`, que lanza `vitest run`) y comprueba que pasa al 100 %, incluidas las funcionalidades anteriores al plan (regresiones). Después recorre la sección "Verificación" del plan con el servidor arrancado (`npm start`, `JWT_SECRET` y `DB_PATH` temporal). No marques como hecha una tarea que no esté cubierta por un test en verde.
7. **Cierra el plan**: cambia su `Estado` a `Implementado` (o `Parcial` si quedan tareas, indicando cuáles y por qué).
8. **Genera el diseño funcional** (ver abajo).
9. **Actualiza `CLAUDE.md`** (sección Comandos con `npm test` (Vitest) si antes no había tests, y una nota sobre la convención de tests en `test/`, sección Documentación con el nuevo documento y lo que el plan indique que cambia en arquitectura/convenciones).
10. **Informa al usuario**: tareas completadas, tests añadidos y resultado de la suite completa, ruta del diseño funcional y cualquier desviación respecto al plan.

## Aislamiento con git worktree

Los cambios se hacen siempre en un **git worktree** propio, no en el directorio principal del repositorio.

1. Crea una rama y un worktree por cada implementación, dentro de la carpeta `.claude/worktrees/` de la raíz del repositorio, partiendo de la rama actual: `git worktree add .claude/worktrees/<slug> -b feature/<slug>` (`<slug>` es el del plan; si la rama o el directorio ya existen, añade un sufijo numérico, sin reutilizar ni borrar nada existente).
2. Trabaja y ejecuta **todo** (tests, servidores, edición del plan y del diseño funcional, `CLAUDE.md`) desde la ruta del worktree. Como `node_modules/` no se versiona, ejecuta `npm install` en el worktree antes de la red de seguridad.
3. **Varias aplicaciones con varios agentes**: si el plan afecta a varias aplicaciones (p. ej. `api`, `web-admin`, `web-empleados`, `web-clientes`) y el usuario pide que las implementen varios agentes (uno por aplicación), crea **un worktree y una rama por agente**, nombrados con el slug y la aplicación: `git worktree add .claude/worktrees/<slug>-<app> -b feature/<slug>-<app>`. Cada agente recibe en su prompt la ruta de su worktree y solo modifica los archivos de su aplicación dentro de él; si necesita cambios en `web-shared` o en otra aplicación, lo comunica en vez de tocarlos. Marcar las casillas del plan y generar el diseño funcional lo hace el agente principal tras recoger el trabajo de todos.
4. Si `.claude/worktrees/` no está ignorada por git, avisa al usuario en vez de modificar `.gitignore` por tu cuenta, para que los worktrees no aparezcan como cambios sin seguimiento.
5. No hagas merge ni elimines worktrees al terminar: deja las ramas y worktrees para que el usuario los revise, e indica en el informe final sus rutas y ramas (y cómo integrarlos o limpiarlos con `git worktree remove`).

## TDD estricto

Para **cada tarea** del plan que añada o cambie comportamiento, repite el ciclo sin saltarte ningún paso:

1. **Rojo**: escribe primero el test (con Vitest, en `test/`, un archivo por recurso, p. ej. `test/vendehumos.test.js`, usando `describe`/`it`/`expect` y `supertest` para las peticiones HTTP) que describe el comportamiento esperado. Ejecútalo y **comprueba que falla por la razón correcta** (no por un error de sintaxis o de configuración). Un test que nace en verde no vale.
2. **Verde**: escribe el código mínimo, respetando las capas, para que ese test pase. Nada más.
3. **Refactor**: limpia el código y los tests con la suite en verde, y ejecútala de nuevo.

Reglas:

- **Prohibido escribir código de producción sin un test en rojo previo.** Si ya lo escribiste, bórralo y empieza por el test.
- Los tests son de **comportamiento HTTP** (petición → código de estado y cuerpo), contra la `app` exportada, con las convenciones del proyecto: `400 { errores }`, `404 { error }`, `401`, `409`, paginación, etc. Cubre el caso feliz, las validaciones, los recursos inexistentes y la autenticación cuando aplique.
- Cada test es independiente: base de datos limpia por test o por archivo, sin depender del orden.
- Si el plan modifica el esquema SQLite, añade un test de la migración sobre una base con la tabla antigua.
- Tareas sin comportamiento (documentación, configuración) no requieren test.
- Al terminar cada ciclo ejecuta la **suite completa**, no solo el test nuevo; si rompe algo anterior, arréglalo antes de continuar.
- Un test existente solo se modifica si el plan cambia expresamente ese comportamiento; indícalo en el informe final.

## Diseño funcional

- Ruta: `docs/funcional/<AAAA-MM-DD>-<slug>.md`, con el mismo `<slug>` que el plan. Si ya existe, no lo sobrescribas: añade un sufijo numérico.
- Lee `assets/plantilla-funcional.md` (junto a este `SKILL.md`) y rellénala respetando **todas sus secciones y su orden**; si una no aplica, escribe "No aplica" y el motivo.
- Está escrito **a nivel de usuario**: qué puede hacer cada tipo de usuario (visitante, usuario registrado), en qué situaciones, qué ve y qué mensajes recibe. **No** incluyas nombres de archivos, capas, SQL ni detalles internos; los endpoints solo aparecen en una tabla resumen de referencia.
- Describe lo **realmente implementado y con tests en verde**, no lo que decía el plan si difiere.
- Los mensajes de error se citan tal como los devuelve la API.

## Restricciones

- Toda la documentación, en **español**.
- Implementa solo lo que pide el plan, y solo después de tener su test en rojo; lo marcado como "No incluye" no se toca.
- No inventes archivos, funciones ni endpoints: comprueba el código existente antes de usarlo.
- No trabajes fuera del worktree creado para el plan (o del de cada agente).
- No hagas commit; si el usuario lo quiere, que use `/commit`.
