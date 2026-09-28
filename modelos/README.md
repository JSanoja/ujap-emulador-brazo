# Modelos 3D

## Modelo de la App 2: iRobot (con pinza)

El emulador usa el modelo **iRobot**: 5 ejes y pinza de dos dedos, con la jerarquía ya separada por eje (`Head (Axis 1) › Arm_1 (Axis 2) › Arm_2 (Axis 3) › Arm_3 (Axis 4) › Joint (Axis 5) › Grasper_base › grasper_L / grasper_R`).

- Original (fuera del repo, 75 MB + C4D): `..\..\modelos 3d\o1j4e9phg8w0-iRobot\`. No se versiona: GitHub avisa desde 50 MB y rechaza archivos de más de 100 MB.
- Selección, datos medidos (ejes, pose, polígonos) y pasos de C2: `..\..\docs\06-SELECCION-MODELO-3D.md`.
- Origen: Free3D, "Industrial robot arm" (descarga `o1j4e9phg8w0-iRobot.zip`, OBJ + C4D; hecho en SolidWorks y armado en Cinema 4D): https://free3d.com/es/modelo-3d/industry-robot-arm-37354.html
- ⚠ Autor y licencia por verificar en esa página antes de publicar el GLB (repositorio público).

### Conversión a GLB (C2)

El GLB del emulador se genera con un script reproducible, sin Blender:

```bash
npm run build:robot -w @emulador/model-tools            # usa la ruta por defecto del OBJ
npm run build:robot -w @emulador/model-tools -- <OBJ>   # otra ruta
```

Salida: `apps/emulator/public/models/robot.glb` (≈ 2,3 MB, ≈ 73 k triángulos desde 2 M). Código en `tools/model/src/build-robot.ts`; ahí están los pivotes y ejes medidos y los pasos:

1. Reducción de polígonos por pieza (meshoptimizer), más fuerte en la base (1,16 M → 24 k).
2. Pose cero, con la misma convención de la App 1: A2 vertical, antebrazo horizontal hacia adelante y pinza alineada con el antebrazo. En el OBJ el brazo está en A2 = −37,6°, A3 = +63,5° y A4 = +58,7°.
3. Alineación: base en el origen, adelante = +Z, arriba = +Y, en metros (se asume 1 unidad del OBJ = 1 cm).
4. Jerarquía `Base › A1 › A2 › A3 › A4 › A5 › FingerL / FingerR`. Cada nodo está en su pivote, sin rotación, y trae su eje de giro en `extras.axis` (A1 +Y; A2–A4 +X; A5 +Z; dedos ±Y). Positivo = hacia adelante/abajo (A2–A4) y abrir (dedos).
5. Normales con ángulo de quiebre de 35° y GLB sin compresión (Draco y Meshopt necesitan decodificadores que Babylon descarga de un CDN; el APK debe funcionar sin conexión).

`extras` del nodo `Base`: `gripper.fingerMaxAngle` (30°) y `gripper.maxOpeningMm` (74 mm, separación de las puntas con los dedos a 30°), que usa la escena para convertir la apertura del núcleo en el ángulo de los dedos.

Cinemática: el iRobot gira el antebrazo (su Axis 4) y luego cabecea la muñeca (Axis 5). El LabVolt 5250 cabecea la muñeca (A4) y luego gira la herramienta (A5). Por eso el giro del antebrazo queda fijo (Arm_2 + Arm_3 forman una sola pieza), el Axis 5 del iRobot pasa a ser A4, y A5 gira la base de la pinza sobre su eje longitudinal, que pasa exactamente por el centro de la muñeca.

## `fuente-obj/`: modelo de 2021 (sin pinza, solo referencia)

Los 11 OBJ exportados de FreeCAD en 2021 que usa la App 1. Z hacia arriba, escala ×0,1 en la escena. No tienen pinza (terminan en `EndEffector`), por eso se reemplazaron. Se conservan como referencia histórica para el Cap. IV.
