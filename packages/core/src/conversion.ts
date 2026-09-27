/**
 * Conversiones entre los valores del TXT (porcentajes) y magnitudes físicas.
 * Ver docs/03-ESPEC-FORMATO-TXT.md, sección "Conversión porcentaje → ángulo".
 */
import type { GripperConfig, JointConfig } from './robot-config';

function assertPercent(value: number, what: string, min = 0): void {
  if (!Number.isFinite(value) || value < min || value > 100) {
    throw new RangeError(`${what} vale ${value}; debe estar entre ${min} y 100.`);
  }
}

/** θ = θmín + (p / 100) · (θmáx − θmín). 0 % y 100 % devuelven exactamente los límites. */
export function percentToDegrees(joint: JointConfig, percent: number): number {
  assertPercent(percent, `${joint.id}`);
  if (percent === 0) return joint.min;
  if (percent === 100) return joint.max;
  return joint.min + (percent / 100) * (joint.max - joint.min);
}

/** Inversa de `percentToDegrees`. */
export function degreesToPercent(joint: JointConfig, degrees: number): number {
  if (!Number.isFinite(degrees) || degrees < joint.min || degrees > joint.max) {
    throw new RangeError(
      `${joint.id} vale ${degrees}°; debe estar entre ${joint.min}° y ${joint.max}°.`,
    );
  }
  return ((degrees - joint.min) / (joint.max - joint.min)) * 100;
}

/**
 * Apertura física de la pinza en mm.
 * Normal: d = dmáx · (1 − p / 100). Invertida: d = dmáx · p / 100.
 */
export function gripperOpening(gripper: GripperConfig, percent: number): number {
  assertPercent(percent, 'La pinza');
  const fraction = percent / 100;
  return gripper.maxOpening * (gripper.inverted ? fraction : 1 - fraction);
}

/** Velocidad de un eje en °/s para un porcentaje de velocidad (1–100). */
export function speedToDegreesPerSecond(joint: JointConfig, speedPercent: number): number {
  assertPercent(speedPercent, 'La velocidad', 1);
  return (joint.maxSpeed * speedPercent) / 100;
}
