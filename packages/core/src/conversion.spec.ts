import { describe, expect, it } from 'vitest';
import {
  degreesToPercent,
  gripperOpening,
  gripperOpeningToPercent,
  percentToDegrees,
  speedToDegreesPerSecond,
} from './conversion';
import { LABVOLT_5250 } from './robot-config';

const [a1, a2] = LABVOLT_5250.joints as [
  (typeof LABVOLT_5250.joints)[number],
  (typeof LABVOLT_5250.joints)[number],
];

describe('percentToDegrees', () => {
  it('0 % y 100 % producen exactamente θmín y θmáx (caso 5 de la spec)', () => {
    for (const joint of LABVOLT_5250.joints) {
      expect(percentToDegrees(joint, 0)).toBe(joint.min);
      expect(percentToDegrees(joint, 100)).toBe(joint.max);
    }
  });

  it('A2 a 20 % = −10° (ejemplo de la spec)', () => {
    expect(percentToDegrees(a2, 20)).toBeCloseTo(-10, 10);
  });

  it('rechaza valores fuera de 0–100 (caso 7 de la spec)', () => {
    expect(() => percentToDegrees(a1, 101)).toThrow(RangeError);
    expect(() => percentToDegrees(a1, -1)).toThrow(RangeError);
    expect(() => percentToDegrees(a1, Number.NaN)).toThrow(RangeError);
  });

  it('ida y vuelta % → ° → % con decimales', () => {
    for (const p of [0, 12.5, 33.33, 50, 99.99, 100]) {
      expect(degreesToPercent(a1, percentToDegrees(a1, p))).toBeCloseTo(p, 9);
    }
  });
});

describe('gripperOpening (caso 6 de la spec)', () => {
  const normal = { maxOpening: 50, maxSpeed: 50, inverted: false };
  const inverted = { maxOpening: 50, maxSpeed: 50, inverted: true };

  it('normal: 0 % abierta, 100 % cerrada', () => {
    expect(gripperOpening(normal, 0)).toBe(50);
    expect(gripperOpening(normal, 100)).toBe(0);
  });

  it('invertida: 0 % cerrada, 100 % abierta', () => {
    expect(gripperOpening(inverted, 0)).toBe(0);
    expect(gripperOpening(inverted, 100)).toBe(50);
  });

  it('gripperOpeningToPercent es la inversa en ambos sentidos', () => {
    for (const gripper of [normal, inverted]) {
      for (const p of [0, 25, 50, 100]) {
        expect(gripperOpeningToPercent(gripper, gripperOpening(gripper, p))).toBeCloseTo(p, 9);
      }
    }
    expect(() => gripperOpeningToPercent(normal, 51)).toThrow(RangeError);
    expect(() => gripperOpeningToPercent(normal, -1)).toThrow(RangeError);
  });
});

describe('speedToDegreesPerSecond', () => {
  it('100 % = velocidad máxima del eje; 50 % = la mitad', () => {
    expect(speedToDegreesPerSecond(a1, 100)).toBe(97.5);
    expect(speedToDegreesPerSecond(a1, 50)).toBe(48.75);
  });

  it('la velocidad válida es 1–100', () => {
    expect(() => speedToDegreesPerSecond(a1, 0)).toThrow(RangeError);
    expect(() => speedToDegreesPerSecond(a1, 101)).toThrow(RangeError);
  });
});
