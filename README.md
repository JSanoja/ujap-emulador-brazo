# Emulador programable de brazo robótico (App 2)

Emulador 3D de un brazo de 5 ejes con pinza, inspirado en el LabVolt 5250 del laboratorio de robótica de la Universidad "José Antonio Páez" (UJAP). Se programa con archivos TXT de puntos articulares y corre en el navegador (PWA) y en Android (Capacitor).

Forma parte del Trabajo Especial de Grado de la Especialización en Automatización Industrial (UJAP) de Juan Manuel Sanoja Peña. La App 1 (Angular + three.js, solo de referencia) está en [JSanoja/ujap-jsanoja-v2](https://github.com/JSanoja/ujap-jsanoja-v2).

## Formato de programa

Una línea por punto: la posición de cada articulación en porcentaje, la pinza y la velocidad, separadas por un espacio.

```
50 50 50 50 50 0 50
50 70 30 45 50 100 20
```

Especificación completa: `../docs/03-ESPEC-FORMATO-TXT.md`.

## Estructura

```
packages/core/      Núcleo en TypeScript puro, sin render: modelo del robot, conversiones,
                    formato TXT y planificador de movimiento. Probado con Vitest.
apps/emulator/      Aplicación Babylon.js + Vite. Capacitor la empaqueta para Android.
  src/scene/        Escena 3D, cámara, luces y robot.
  src/ui/           Paneles e interfaz.
  public/           Recursos estáticos (aquí irá el GLB del robot).
  android/          Proyecto Android generado por Capacitor (se crea en C1).
modelos/fuente-obj/ Modelos OBJ originales (FreeCAD, 2021), fuente para el GLB de C2.
```

## Requisitos

- Node.js 24 LTS (mínimo 22) y npm 11.
- Para Android: Android Studio con el SDK y un JDK 21.

## Comandos

```bash
npm install          # instala todo el monorepo (desde WSL)
npm run dev          # servidor de desarrollo con recarga (http://localhost:5173)
npm test             # pruebas unitarias del núcleo
npm run check        # lint + tipos + pruebas + build; lo mismo que corre GitHub Actions
npm run build        # build de producción en apps/emulator/dist
```

Android (a partir de C1):

```bash
cd apps/emulator
npx cap add android     # solo la primera vez; genera apps/emulator/android/
npm run android:sync    # build web + copia al proyecto Android
npm run android:open    # abre Android Studio para compilar e instalar el APK
```

## Estado

| Workunit | Qué                                                                                 | Estado |
| -------- | ----------------------------------------------------------------------------------- | ------ |
| —        | Esqueleto del monorepo, núcleo con configuración y conversiones, escena provisional | ✅     |
| N1       | Formato TXT (`parse`, `serialize`, `validate`) y planificador sincronizado          | ⬜     |
| C1       | Spike: GLB de prueba + APK en un teléfono real                                      | ⬜     |
| C2       | Modelos: OBJ → GLB con pivotes, pinza y compresión                                  | ⬜     |
| C3       | Escena definitiva, control articular y reproducción de programas                    | ⬜     |
| C4       | Editor de programas, importar y exportar TXT, interfaz táctil                       | ⬜     |
| C5       | Android firmado y PWA instalable                                                    | ⬜     |
| C6       | Configuración ("Invertir pinza" persistente)                                        | ⬜     |
| C7       | Programas de ejemplo                                                                | ⬜     |

Tablero y registro de decisiones: `../docs/01-WORKUNITS.md`.

## Licencia

MIT. Los modelos 3D de `modelos/` son propios del autor (FreeCAD, 2021).
