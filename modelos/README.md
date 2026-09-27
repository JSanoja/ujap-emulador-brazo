# Modelos 3D

## Modelo de la App 2: iRobot (con pinza)

El emulador usa el modelo **iRobot**: 5 ejes y pinza de dos dedos, con la jerarquía ya separada por eje (`Head (Axis 1) › Arm_1 (Axis 2) › Arm_2 (Axis 3) › Arm_3 (Axis 4) › Joint (Axis 5) › Grasper_base › grasper_L / grasper_R`).

- Original (fuera del repo, 75 MB + C4D): `..\..\modelos 3d\o1j4e9phg8w0-iRobot\`. No se versiona: GitHub avisa desde 50 MB y rechaza archivos de más de 100 MB.
- Selección, datos medidos (ejes, pose, polígonos) y pasos de C2: `..\..\docs\06-SELECCION-MODELO-3D.md`.
- ⚠ Origen y licencia por verificar antes de publicar el GLB (repositorio público).

Salida de C2: `apps/emulator/public/models/robot.glb` (meta < 3 MB, Meshopt o Draco), con nodos `A1`–`A5`, `Gripper`, `FingerL`, `FingerR` y pivotes en cada eje. Si el `.blend` pesa menos de 50 MB, guardarlo aquí.

## `fuente-obj/`: modelo de 2021 (sin pinza, solo referencia)

Los 11 OBJ exportados de FreeCAD en 2021 que usa la App 1. Z hacia arriba, escala ×0,1 en la escena. No tienen pinza (terminan en `EndEffector`), por eso se reemplazaron. Se conservan como referencia histórica para el Cap. IV.
