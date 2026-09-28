/**
 * Pruebas de los programas de ejemplo (C7): se leen con el núcleo y se simulan con el
 * planificador, sin navegador. La prueba física del pick and place (la pieza llega a B) es E2E.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LABVOLT_5250,
  MotionPlanner,
  parseProgram,
  type ProgramPoint,
  type RobotConfig,
} from '@emulador/core';
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/examples';

const INVERTED: RobotConfig = {
  ...LABVOLT_5250,
  gripper: { ...LABVOLT_5250.gripper, inverted: true },
};

function load(file: string, robot: RobotConfig = LABVOLT_5250): ProgramPoint[] {
  const text = readFileSync(resolve(import.meta.dirname, '../public/examples', file), 'utf8');
  const result = parseProgram(text, robot);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
  return result.points;
}

/** Ejecuta el programa y devuelve la pose al llegar a cada punto y la duración de cada tramo. */
function simulate(points: readonly ProgramPoint[], robot: RobotConfig = LABVOLT_5250) {
  const planner = new MotionPlanner(robot);
  return points.map((point) => {
    const duration = planner.moveTo(point);
    planner.step(duration);
    return { pose: planner.pose, duration };
  });
}

describe('programas de ejemplo', () => {
  it.each(EXAMPLES.map((e) => [e.file]))('%s se lee sin errores', (file) => {
    expect(load(file).length).toBeGreaterThan(0);
  });

  it('todos terminan en la pose de reposo (todos los ejes en 0°)', () => {
    for (const example of EXAMPLES) {
      const robot = example.file.includes('invertida') ? INVERTED : LABVOLT_5250;
      const last = simulate(load(example.file, robot), robot).at(-1);
      last?.pose.joints.forEach((degrees) => expect(Math.abs(degrees)).toBeLessThan(0.1));
    }
  });

  it('rangos: cada eje alcanza exactamente sus dos límites y la pinza abre y cierra', () => {
    const poses = simulate(load('rangos.txt')).map((s) => s.pose);
    LABVOLT_5250.joints.forEach((joint, i) => {
      const angles = poses.map((p) => p.joints[i] as number);
      expect(Math.min(...angles)).toBe(joint.min);
      expect(Math.max(...angles)).toBe(joint.max);
    });
    const openings = poses.map((p) => p.gripper);
    expect(Math.min(...openings)).toBe(0);
    expect(Math.max(...openings)).toBe(LABVOLT_5250.gripper.maxOpening);
  });

  it('velocidades: el mismo tramo tarda 1 : 2 : 10 al 100 %, 50 % y 10 %', () => {
    const d = simulate(load('velocidades.txt')).map((s) => s.duration);
    // Tramos A → B: puntos 3, 5 y 7 (índices 2, 4 y 6).
    const [fast, medium, slow] = [d[2], d[4], d[6]] as [number, number, number];
    expect(fast).toBeGreaterThan(0.5);
    expect(medium / fast).toBeCloseTo(2, 9);
    expect(slow / fast).toBeCloseTo(10, 9);
  });

  it('pick and place: cierra la pinza al ancho del cubo (40 mm) y la versión invertida hace lo mismo', () => {
    const normal = simulate(load('pick-and-place.txt')).map((s) => s.pose.gripper);
    const inverted = simulate(load('pick-and-place-pinza-invertida.txt', INVERTED), INVERTED).map(
      (s) => s.pose.gripper,
    );
    expect(inverted).toHaveLength(normal.length);
    inverted.forEach((mm, i) => expect(mm).toBeCloseTo(normal[i] as number, 9));
    expect(Math.min(...normal)).toBeCloseTo(40, 0);
    expect(normal[0]).toBe(LABVOLT_5250.gripper.maxOpening);
  });
});
