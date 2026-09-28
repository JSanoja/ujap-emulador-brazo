/**
 * Configuración cinemática del robot emulado.
 *
 * El núcleo no depende del motor 3D: estos datos describen el robot en grados
 * y milímetros, y la escena (apps/emulator) los traduce a nodos y rotaciones.
 */

/** Articulación rotativa. Ángulos en grados; velocidad en grados por segundo. */
export interface JointConfig {
  /** Identificador corto usado en la interfaz y en los mensajes (A1, A2, …). */
  readonly id: string;
  /** Nombre descriptivo (base, hombro, codo, …). */
  readonly name: string;
  /** Límite inferior en grados; corresponde a 0 % en el TXT. */
  readonly min: number;
  /** Límite superior en grados; corresponde a 100 % en el TXT. */
  readonly max: number;
  /** Velocidad máxima en °/s; corresponde a 100 % de velocidad. */
  readonly maxSpeed: number;
}

/** Pinza de dos dedos. */
export interface GripperConfig {
  /** Apertura máxima entre dedos, en mm. */
  readonly maxOpening: number;
  /** Velocidad máxima de apertura o cierre en mm/s; corresponde a 100 % de velocidad. */
  readonly maxSpeed: number;
  /**
   * Opción "Invertir pinza".
   * `false`: 0 % = abierta, 100 % = cerrada (convención por defecto).
   * `true`: 0 % = cerrada, 100 % = abierta.
   */
  readonly inverted: boolean;
}

export interface RobotConfig {
  readonly name: string;
  /** Articulaciones en el orden en que aparecen en cada línea del TXT. */
  readonly joints: readonly JointConfig[];
  readonly gripper: GripperConfig;
}

/**
 * Brazo de 5 ejes inspirado en el LabVolt 5250.
 *
 * Rangos y velocidades tomados de la App 1 (robot.config.ts, 2021).
 * ⚠ Provisionales hasta validarlos con el manual del LabVolt 5250 (workunit D0).
 * ⚠ La apertura y la velocidad de la pinza son valores supuestos hasta medirlas en el modelo iRobot (C2)
 *   y en el manual; con 50 mm y 50 mm/s el recorrido completo tarda 1 s a 100 %.
 */
export const LABVOLT_5250: RobotConfig = {
  name: 'LabVolt 5250 (emulado)',
  joints: [
    { id: 'A1', name: 'Base', min: -170, max: 170, maxSpeed: 97.5 },
    { id: 'A2', name: 'Hombro', min: -40, max: 110, maxSpeed: 91 },
    { id: 'A3', name: 'Codo', min: -90, max: 65, maxSpeed: 89 },
    { id: 'A4', name: 'Muñeca', min: -140, max: 100, maxSpeed: 90 },
    { id: 'A5', name: 'Giro de herramienta', min: -175, max: 175, maxSpeed: 177 },
  ],
  gripper: { maxOpening: 50, maxSpeed: 50, inverted: false },
};

/**
 * Cantidad de valores por línea del TXT: una posición por articulación,
 * una para la pinza y la velocidad al final.
 */
export function valuesPerLine(robot: RobotConfig): number {
  return robot.joints.length + 2;
}

/** Revisa la coherencia de una configuración. Devuelve la lista de errores (vacía si es válida). */
export function validateRobotConfig(robot: RobotConfig): string[] {
  const errors: string[] = [];
  if (robot.joints.length === 0) {
    errors.push('El robot debe tener al menos una articulación.');
  }
  const ids = new Set<string>();
  for (const joint of robot.joints) {
    if (ids.has(joint.id)) {
      errors.push(`Articulación duplicada: ${joint.id}.`);
    }
    ids.add(joint.id);
    if (!(joint.min < joint.max)) {
      errors.push(
        `${joint.id}: el mínimo (${joint.min}°) debe ser menor que el máximo (${joint.max}°).`,
      );
    }
    if (!(joint.maxSpeed > 0)) {
      errors.push(`${joint.id}: la velocidad máxima debe ser mayor que 0.`);
    }
  }
  if (!(robot.gripper.maxOpening > 0)) {
    errors.push('La apertura máxima de la pinza debe ser mayor que 0.');
  }
  if (!(robot.gripper.maxSpeed > 0)) {
    errors.push('La velocidad máxima de la pinza debe ser mayor que 0.');
  }
  return errors;
}
