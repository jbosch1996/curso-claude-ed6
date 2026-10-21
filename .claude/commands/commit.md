---
description: Crea un commit siguiendo la especificación Conventional Commits
argument-hint: [tipo(ámbito)] [descripción opcional]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*)
---

# Crear commit (Conventional Commits)

## Contexto actual

- Estado del repositorio: !`git status --short`
- Cambios en staging: !`git diff --cached --stat`
- Cambios sin añadir: !`git diff --stat`
- Rama actual: !`git branch --show-current`
- Últimos commits (para seguir el estilo): !`git log --oneline -10 2>/dev/null || true`

## Pista del usuario

$ARGUMENTS

## Tarea

Crea **un único commit** con los cambios actuales siguiendo la especificación [Conventional Commits 1.0.0](https://www.conventionalcommits.org/es/v1.0.0/).

### Formato

```
<tipo>[ámbito opcional][!]: <descripción>

[cuerpo opcional]

[pie(s) opcional(es)]
```

### Tipos permitidos

| Tipo       | Cuándo usarlo                                                  |
|------------|----------------------------------------------------------------|
| `feat`     | Nueva funcionalidad                                            |
| `fix`      | Corrección de un error                                         |
| `docs`     | Solo documentación                                             |
| `style`    | Formato (espacios, comas, etc.) sin cambio de lógica           |
| `refactor` | Cambio de código que no corrige un error ni añade funcionalidad |
| `perf`     | Mejora de rendimiento                                          |
| `test`     | Añadir o corregir tests                                        |
| `build`    | Cambios en el sistema de build o dependencias (`package.json`) |
| `ci`       | Cambios en la configuración de integración continua            |
| `chore`    | Tareas de mantenimiento que no afectan al código de producción |
| `revert`   | Revierte un commit anterior                                    |

### Reglas

1. La descripción va en **español**, en imperativo o infinitivo según el estilo del historial, en minúscula, sin punto final y con un máximo de ~72 caracteres en la primera línea.
2. El ámbito (opcional) indica la parte afectada: por ejemplo `auth`, `vendehumos`, `usuarios`, `routes`, `services`, `repositories`, `helpers`.
3. Un cambio incompatible se marca con `!` tras el tipo/ámbito y/o con un pie `BREAKING CHANGE: <explicación>`.
4. El cuerpo (si aporta valor) explica el **qué y el porqué**, no el cómo, separado por una línea en blanco.
5. Si hay un issue relacionado, añádelo en un pie (`Refs: #123`, `Closes: #123`).
6. Si los cambios mezclan varios propósitos distintos, propón dividirlos en varios commits antes de continuar.
7. Si el usuario pasó una pista en `$ARGUMENTS`, úsala como tipo, ámbito o descripción, ajustándola al formato.

### Pasos

1. Revisa el estado y analiza el diff completo (`git diff` y `git diff --cached`) para entender qué cambió.
2. Si no hay nada en staging, añade los archivos relevantes **por nombre** (`git add <archivo>`). No uses `git add -A` ni `git add .`, y nunca añadas archivos sensibles (`.env`, `*.db`, credenciales).
3. Redacta el mensaje y muéstralo al usuario utilizando la tool `AskUserQuestion` para preguntarle si le parece bien el mensaje. Si no le parece bien, genera otra mensaje y le vuelves a preguntar. Cuando lo de por válido sigue con el paso 4.
4. Crea el commit con `git commit -m` (usa varios `-m` o un heredoc si hay cuerpo y pies). Respeta las líneas de atribución que indique la sesión, si las hay.
5. Ejecuta `git status` y `git log -1` para confirmar el resultado e informa del hash y del mensaje.

### Restricciones

- No hagas `git push`, `--amend`, `--no-verify` ni modifiques la configuración de git.
- Si un hook falla, corrige el problema y crea un commit **nuevo**; no uses `--amend`.
- Si no hay cambios que commitear, indícalo y termina sin crear nada.
