import { describe, expect, it } from 'vitest';
import { MotionPlanner } from './motion-planner';
import { ProgramRunner } from './program-runner';
import type { RobotConfig } from './robot-config';
import type { ProgramPoint } from './txt-format';

const ROBOT: RobotConfig = {
  name: 'prueba',
  joints: [{ id: 'A1', name: 'a', min: 0, max: 100, maxSpeed: 10 }],
  gripper: { maxOpening: 10, maxSpeed: 100, inverted: false },
};

/** Cada punto lleva A1 a `a1` % (= grados) a velocidad máxima: 10 °/s. */
const point = (a1: number): ProgramPoint => ({ joints: [a1], gripper: 0, speed: 100 });
const PROGRAM = [point(10), point(20), point(30)]; // 1 s por punto desde 0°

function setup(): { runner: ProgramRunner; changes: string[] } {
  const runner = new ProgramRunner(new MotionPlanner(ROBOT));
  const changes: string[] = [];
  runner.onChange = (r) => changes.push(`${r.state}:${r.index}`);
  runner.load(PROGRAM);
  return { runner, changes };
}

const angle = (runner: ProgramRunner): number => runner.planner.pose.joints[0] as number;

describe('ProgramRunner', () => {
  it('reproduce todos los puntos en orden y queda en reposo en el último', () => {
    const { runner, changes } = setup();
    runner.play();
    for (let i = 0; i < 40; i++) runner.tick(0.1);
    expect(runner.state).toBe('idle');
    expect(angle(runner)).toBe(30);
    expect(changes).toEqual(['idle:-1', 'running:0', 'running:1', 'running:2', 'idle:2']);
  });

  it('pausa congela el tiempo y play continúa donde quedó', () => {
    const { runner } = setup();
    runner.play();
    runner.tick(0.5);
    runner.pause();
    runner.tick(5);
    expect(runner.state).toBe('paused');
    expect(angle(runner)).toBeCloseTo(5, 9);
    runner.play();
    runner.tick(0.5);
    expect(angle(runner)).toBe(10);
    expect(runner.index).toBe(1);
  });

  it('stop detiene el robot donde está', () => {
    const { runner } = setup();
    runner.play();
    runner.tick(0.25);
    runner.stop();
    runner.tick(1);
    expect(runner.state).toBe('idle');
    expect(runner.index).toBe(-1);
    expect(angle(runner)).toBeCloseTo(2.5, 9);
  });

  it('paso a paso: se pausa al llegar a cada punto', () => {
    const { runner } = setup();
    runner.stepForward();
    for (let i = 0; i < 20; i++) runner.tick(0.1);
    expect(runner.state).toBe('paused');
    expect(runner.index).toBe(0);
    expect(angle(runner)).toBe(10);
    runner.stepForward();
    for (let i = 0; i < 20; i++) runner.tick(0.1);
    expect(runner.index).toBe(1);
    expect(angle(runner)).toBe(20);
    // play desde la pausa del paso a paso sigue con el resto del programa
    runner.play();
    for (let i = 0; i < 20; i++) runner.tick(0.1);
    expect(runner.state).toBe('idle');
    expect(angle(runner)).toBe(30);
  });

  it('paso a paso en el último punto termina la ejecución', () => {
    const { runner } = setup();
    runner.play(2);
    runner.pause();
    runner.stepForward();
    for (let i = 0; i < 40; i++) runner.tick(0.1);
    expect(runner.state).toBe('paused');
    runner.stepForward();
    expect(runner.state).toBe('idle');
  });

  it('play(startAt) ejecuta desde el punto seleccionado y valida el índice', () => {
    const { runner } = setup();
    runner.play(2);
    expect(runner.index).toBe(2);
    expect(runner.planner.duration).toBeCloseTo(3, 9);
    expect(() => runner.play(3)).toThrow(RangeError);
    runner.stop();
    expect(() => runner.play(-1)).toThrow(RangeError);
  });

  it('en reposo, tick también avanza los movimientos manuales', () => {
    const { runner } = setup();
    runner.planner.moveTo(point(50));
    runner.tick(1);
    expect(angle(runner)).toBeCloseTo(10, 9);
    expect(runner.state).toBe('idle');
  });

  it('load detiene el programa anterior; paso a paso sin puntos no hace nada', () => {
    const { runner } = setup();
    runner.play();
    runner.load([]);
    expect(runner.state).toBe('idle');
    runner.stepForward();
    expect(runner.state).toBe('idle');
    runner.pause(); // sin efecto en reposo
    expect(runner.state).toBe('idle');
  });
});
