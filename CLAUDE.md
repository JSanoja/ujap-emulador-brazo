# CLAUDE.md — Emulador de brazo robótico (App 2)

Tesis de postgrado de Juan Sanoja (UJAP, Especialización en Automatización Industrial). Este repositorio es la **App 2**: emulador programable nuevo, web + Android, con Babylon.js + Vite + Capacitor y un núcleo TypeScript sin render.

Contexto en `..\docs\` (leer al empezar):

- `00-CONTEXTO-GENERAL.md` — historia, estado, ejes.
- `01-WORKUNITS.md` — tablero; **actualizar estado y registro de decisiones al terminar cada workunit**.
- `02-EVALUACION-APP2.md` — por qué Babylon.js + Capacitor.
- `03-ESPEC-FORMATO-TXT.md` — formato TXT (fuente de verdad para N1).
- `06-SELECCION-MODELO-3D.md` — modelo 3D elegido (iRobot, con pinza), ejes medidos y pasos de C2.
- `05-CIERRE-APP1-TRASPASO-APP2.md` — lecciones de la App 1: pivotes y jerarquía de los modelos, luces físicas, etiquetas y `devicePixelRatio`, E2E con Playwright, GitHub Pages.

## Arquitectura

- `packages/core` (`@emulador/core`): TypeScript puro, **sin dependencias de DOM ni de Babylon**. Todo lo que sea lógica del robot (TXT, conversiones, planificador, validación) va aquí y con pruebas. Se consume como código fuente (`exports` → `src/index.ts`), sin paso de build.
- `apps/emulator` (`@emulador/emulator`): escena y UI. No implementa lógica del robot: llama al núcleo.
- `tools/model` (`@emulador/model-tools`): script Node (TypeScript sin compilar, Node 24) que convierte el OBJ del iRobot en `apps/emulator/public/models/robot.glb` con pivotes y pose cero (`npm run build:robot -w @emulador/model-tools`). Ver `modelos/README.md`.
- Las rotaciones de la escena se aplican a partir de ángulos en grados que entrega el núcleo.

## Reglas

- **Git y GitHub solo manual (normativa):** Claude no ejecuta `git commit`, `git push`, `git tag`, `gh` ni ninguna otra operación que escriba en el repositorio o en GitHub. Cuando haga falta, entrega los comandos listos para que Juan los ejecute.
- **Línea de comandos: WSL (Ubuntu).** Todos los comandos que se le pasen a Juan son de Linux (bash), con rutas `/mnt/d/AI - FOLDER/Tesis UJAP/...` entre comillas. Node (nvm), `gh` y Git se usan desde WSL.
- Idioma: español en comentarios, commits, mensajes de la interfaz y de error.
- **Identificadores en inglés:** variables, constantes, funciones, métodos, clases, interfaces, tipos y nombres de archivo del código se escriben en inglés (`percentToDegrees`, `JointConfig`, `txt-format.ts`). Los textos que ve el usuario y los comentarios siguen en español.
- Rama por workunit (`n1-nucleo`, `c1-spike`, `c2-modelos`, …); commits pequeños; merge a `main` con `npm run check` en verde. Etiquetar hitos (`v0.1-esqueleto`, …).
- Antes de cada cambio visual grande, capturas en `..\docs\capturas\` (prefijo `app2-`), para el Cap. IV.
- **Vite en WSL sobre `/mnt/d`:** no llegan eventos de cambio de archivos; `vite.config.ts` activa el sondeo (`usePolling`) en ese caso. Si el navegador muestra código viejo, reiniciar el servidor.
- **Capturas y E2E:** `playwright-core` (dependencia de desarrollo) con el Node de Windows y Chrome (`channel: 'chrome'`, `--use-angle=swiftshader`); en desarrollo la escena queda en `window.BABYLON_SCENE`.
- **`node_modules` se instala desde WSL**, que es donde se ejecuta; esbuild/rolldown tienen binarios por plataforma. Si alguna vez se instala desde Windows, borrar `node_modules` y reinstalar desde WSL.
- Finales de línea LF, controlados por `.gitattributes`.
- Valores del LabVolt 5250 en `packages/core/src/robot-config.ts` son **provisionales** hasta D0 (manual).

## Pila (versiones al crear el repo, 2026-09-27)

Node 24, npm 11, TypeScript 6.0, Vite 8.3, Vitest 5.0, ESLint 10 + typescript-eslint 8.69, Prettier 3.9, Babylon.js 9.27, Capacitor 8.5.
