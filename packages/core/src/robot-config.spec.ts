import { describe, expect, it } from 'vitest';
import { LABVOLT_5250, validateRobotConfig, valuesPerLine, type RobotConfig } from './robot-config';

describe('robot-config', () => {
  it('la configuración del LabVolt 5250 es válida', () => {
    expect(validateRobotConfig(LABVOLT_5250)).toEqual([]);
  });

  it('LabVolt 5250: 5 ejes + pinza + velocidad = 7 valores por línea', () => {
    expect(valuesPerLine(LABVOLT_5250)).toBe(7);
  });

  it('robot de 2 ejes + pinza + velocidad = 4 valores (ejemplo "20 20 80 50")', () => {
    const robot: RobotConfig = {
      name: 'prueba',
      joints: [
        { id: 'A1', name: 'a', min: 0, max: 90, maxSpeed: 10 },
        { id: 'A2', name: 'b', min: 0, max: 90, maxSpeed: 10 },
      ],
      gripper: { maxOpening: 10, maxSpeed: 10, inverted: false },
    };
    expect(valuesPerLine(robot)).toBe(4);
  });

  it('detecta límites invertidos, ids duplicados, apertura y velocidades no positivas', () => {
    const robot: RobotConfig = {
      name: 'mal',
      joints: [
        { id: 'A1', name: 'a', min: 10, max: -10, maxSpeed: 10 },
        { id: 'A1', name: 'b', min: 0, max: 90, maxSpeed: 0 },
      ],
      gripper: { maxOpening: 0, maxSpeed: 0, inverted: false },
    };
    expect(validateRobotConfig(robot)).toHaveLength(5);
  });
});
