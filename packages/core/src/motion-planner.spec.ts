import { describe, expect, it } from 'vitest';
import { MotionPlanner } from './motion-planner';
import { LABVOLT_5250, type RobotConfig } from './robot-config';
import type { ProgramPoint } from './txt-format';

/** Robot de 2 ejes con velocidades distintas, para comprobar la sincronización. */
const ROBOT: RobotConfig = {
  name: 'prueba',
  joints: [
    { id: 'A1', name: 'rápido', min: 0, max: 100, maxSpeed: 100 },
    { id: 'A2', name: 'lento', min: 0, max: 100, maxSpeed: 10 },
  ],
  gripper: { maxOpening: 10, maxSpeed: 10, inverted: false },
};

const point = (a1: number, a2: number, gripper: number, speed: number): ProgramPoint => ({
  joints: [a1, a2],
  gripper,
  speed,
});

/** Avanza la simulación a pasos fijos hasta terminar; devuelve el tiempo simulado. */
function runUntilStopped(planner: MotionPlanner, dt = 1 / 60, limit = 1000): number {
  let t = 0;
  while (!planner.isAtTarget()) {
    planner.step(dt);
    t += dt;
    if (t > limit) throw new Error('El movimiento no terminó.');
  }
  return t;
}

describe('MotionPlanner', () => {
  it('pose inicial: ejes en 0° (limitado al rango) y pinza abierta', () => {
    const planner = new MotionPlanner(LABVOLT_5250);
    expect(planner.pose).toEqual({
      joints: [0, 0, 0, 0, 0],
      gripper: LABVOLT_5250.gripper.maxOpening,
    });
    expect(new MotionPlanner(ROBOT).pose.joints).toEqual([0, 0]);
    expect(planner.isAtTarget()).toBe(true);
  });

  it('la duración es la del eje más lento a v % de su velocidad', () => {
    const planner = new MotionPlanner(ROBOT, { joints: [0, 0], gripper: 10 });
    // A1: 50° a 100 °/s = 0,5 s; A2: 20° a 10 °/s = 2 s → 2 s.
    expect(planner.moveTo(point(50, 20, 0, 100))).toBeCloseTo(2, 12);
    // A la mitad de velocidad, el doble de tiempo.
    const slow = new MotionPlanner(ROBOT, { joints: [0, 0], gripper: 10 });
    expect(slow.moveTo(point(50, 20, 0, 50))).toBeCloseTo(4, 12);
  });

  it('la pinza también cuenta para la duración', () => {
    const planner = new MotionPlanner(ROBOT, { joints: [0, 0], gripper: 10 });
    // Cerrar 10 mm a 10 mm/s = 1 s; los ejes no se mueven.
    expect(planner.moveTo(point(0, 0, 100, 100))).toBeCloseTo(1, 12);
  });

  it('movimiento sincronizado: todos los ejes avanzan la misma fracción y llegan juntos', () => {
    const planner = new MotionPlanner(ROBOT, { joints: [0, 0], gripper: 10 });
    planner.moveTo(point(50, 20, 100, 100)); // 2 s
    planner.step(0.5);
    expect(planner.pose.joints[0]).toBeCloseTo(12.5, 12);
    expect(planner.pose.joints[1]).toBeCloseTo(5, 12);
    expect(planner.pose.gripper).toBeCloseTo(7.5, 12);
    planner.step(1.49);
    expect(planner.isAtTarget()).toBe(false);
    planner.step(0.01);
    expect(planner.isAtTarget()).toBe(true);
    expect(planner.pose).toEqual({ joints: [50, 20], gripper: 0 });
  });

  it('llega exactamente al destino con decimales y pasos irregulares (bug de 2021)', async () => {
    const planner = new MotionPlanner(LABVOLT_5250);
    const target: ProgramPoint = {
      joints: [12.34, 56.78, 90.12, 33.33, 66.67],
      gripper: 12.34,
      speed: 37,
    };
    planner.moveTo(target);
    const done = planner.whenAtTarget();
    runUntilStopped(planner, 0.0173);
    await expect(done).resolves.toBeUndefined();
    expect(planner.toPoint(37).joints.map((p) => Number(p.toFixed(9)))).toEqual(target.joints);
  });

  it('0 % y 100 % llevan a los límites exactos', () => {
    const planner = new MotionPlanner(LABVOLT_5250);
    planner.moveTo({ joints: [0, 100, 0, 100, 0], gripper: 100, speed: 100 });
    runUntilStopped(planner, 0.1);
    expect(planner.pose).toEqual({ joints: [-170, 110, -90, 100, -175], gripper: 0 });
  });

  it('el tiempo simulado coincide con la duración calculada', () => {
    const planner = new MotionPlanner(LABVOLT_5250);
    const duration = planner.moveTo({ joints: [100, 50, 50, 50, 50], gripper: 0, speed: 100 });
    // A1: de 0° a 170° a 97,5 °/s ≈ 1,744 s.
    expect(duration).toBeCloseTo(170 / 97.5, 12);
    expect(runUntilStopped(planner, 0.001)).toBeCloseTo(duration, 2);
  });

  it('un destino igual a la pose actual termina de inmediato', async () => {
    const planner = new MotionPlanner(ROBOT, { joints: [30, 30], gripper: 10 });
    expect(planner.moveTo(point(30, 30, 0, 50))).toBe(0);
    expect(planner.isAtTarget()).toBe(true);
    await expect(planner.whenAtTarget()).resolves.toBeUndefined();
  });

  it('un punto fuera de rango se rechaza y el robot no se mueve (bug de 2021)', () => {
    const planner = new MotionPlanner(ROBOT);
    expect(() => planner.moveTo(point(101, 0, 0, 50))).toThrow(
      'la articulación A1 vale 101; debe estar entre 0 y 100.',
    );
    expect(() => planner.moveTo(point(0, 0, 0, 0))).toThrow(RangeError);
    expect(() => planner.moveTo({ joints: [0], gripper: 0, speed: 50 })).toThrow(RangeError);
    expect(planner.isAtTarget()).toBe(true);
  });

  it('step rechaza pasos negativos o no numéricos y no hace nada si está detenido', () => {
    const planner = new MotionPlanner(ROBOT);
    expect(() => planner.step(-0.1)).toThrow(RangeError);
    expect(() => planner.step(Number.NaN)).toThrow(RangeError);
    const before = planner.pose;
    planner.step(1);
    expect(planner.pose).toBe(before);
  });

  it('stop detiene el robot donde está y resuelve las esperas', async () => {
    const planner = new MotionPlanner(ROBOT, { joints: [0, 0], gripper: 10 });
    planner.moveTo(point(0, 100, 0, 100)); // 10 s
    const done = planner.whenAtTarget();
    planner.step(1);
    planner.stop();
    await expect(done).resolves.toBeUndefined();
    expect(planner.pose.joints[1]).toBeCloseTo(10, 12);
    expect(planner.duration).toBe(0);
  });

  it('un nuevo destino reemplaza el movimiento en curso desde la pose actual', () => {
    const planner = new MotionPlanner(ROBOT, { joints: [0, 0], gripper: 10 });
    planner.moveTo(point(0, 100, 0, 100));
    planner.step(5); // A2 en 50°
    expect(planner.moveTo(point(0, 0, 0, 100))).toBeCloseTo(5, 12);
  });

  it('toPoint devuelve la pose actual en porcentajes (teach), en ambos sentidos de pinza', () => {
    const planner = new MotionPlanner(LABVOLT_5250);
    planner.moveTo({ joints: [25, 50, 75, 10, 90], gripper: 30, speed: 100 });
    runUntilStopped(planner);
    const taught = planner.toPoint(40);
    expect(taught.speed).toBe(40);
    expect(taught.gripper).toBeCloseTo(30, 9);
    taught.joints.forEach((p, i) => expect(p).toBeCloseTo([25, 50, 75, 10, 90][i] as number, 9));
  });
});

describe('Invertir pinza (caso 6 de la spec)', () => {
  const inverted: RobotConfig = {
    ...LABVOLT_5250,
    gripper: { ...LABVOLT_5250.gripper, inverted: true },
  };
  const rest = [50, 50, 50, 50, 50];

  it('el mismo punto abre o cierra la pinza según la opción', () => {
    const normal = new MotionPlanner(LABVOLT_5250);
    const flipped = new MotionPlanner(inverted);
    for (const planner of [normal, flipped]) {
      planner.moveTo({ joints: rest, gripper: 100, speed: 100 });
      runUntilStopped(planner);
    }
    expect(normal.pose.gripper).toBe(0); // cerrada
    expect(flipped.pose.gripper).toBe(LABVOLT_5250.gripper.maxOpening); // abierta
    expect(flipped.toPoint(50).gripper).toBe(100);
  });
});

describe('runProgram', () => {
  const program = [point(10, 10, 0, 100), point(20, 20, 100, 100), point(0, 0, 0, 100)];

  /** Simula el bucle de render: un paso de 1/60 s por microtarea. */
  async function drive(planner: MotionPlanner, run: Promise<boolean>): Promise<boolean> {
    let finished = false;
    void run.then(() => (finished = true));
    for (let frame = 0; frame < 10_000 && !finished; frame++) {
      planner.step(1 / 60);
      await Promise.resolve();
    }
    return run;
  }

  it('ejecuta los puntos en orden y termina en el último', async () => {
    const planner = new MotionPlanner(ROBOT);
    const visited: number[] = [];
    const run = planner.runProgram(program, { onPoint: (i) => visited.push(i) });
    await expect(drive(planner, run)).resolves.toBe(true);
    expect(visited).toEqual([0, 1, 2]);
    expect(planner.pose).toEqual({ joints: [0, 0], gripper: 10 });
  });

  it('startAt ejecuta desde el punto seleccionado', async () => {
    const planner = new MotionPlanner(ROBOT);
    const visited: number[] = [];
    const run = planner.runProgram(program, { startAt: 1, onPoint: (i) => visited.push(i) });
    await drive(planner, run);
    expect(visited).toEqual([1, 2]);
    await expect(planner.runProgram(program, { startAt: -1 })).rejects.toThrow(RangeError);
    await expect(planner.runProgram(program, { startAt: 1.5 })).rejects.toThrow(RangeError);
  });

  it('stop() cancela el programa y el robot queda detenido', async () => {
    const planner = new MotionPlanner(ROBOT);
    const visited: number[] = [];
    const run = planner.runProgram(program, {
      onPoint: (i) => {
        visited.push(i);
        if (i === 1) planner.stop();
      },
    });
    await expect(drive(planner, run)).resolves.toBe(false);
    expect(visited).toEqual([0, 1]);
    expect(planner.pose).toEqual({ joints: [10, 10], gripper: 10 });
    expect(planner.isAtTarget()).toBe(true);
  });

  it('stop() a mitad de un movimiento cancela el programa', async () => {
    const planner = new MotionPlanner(ROBOT);
    const run = planner.runProgram(program);
    planner.step(0.1);
    planner.stop();
    await expect(run).resolves.toBe(false);
    expect(planner.pose.joints[1]).toBeCloseTo(1, 12);
  });

  it('un nuevo runProgram cancela el anterior', async () => {
    const planner = new MotionPlanner(ROBOT);
    const first = planner.runProgram(program);
    const second = planner.runProgram([point(50, 50, 0, 100)]);
    await expect(first).resolves.toBe(false);
    await expect(drive(planner, second)).resolves.toBe(true);
    expect(planner.pose.joints).toEqual([50, 50]);
  });

  it('un programa vacío termina de inmediato', async () => {
    await expect(new MotionPlanner(ROBOT).runProgram([])).resolves.toBe(true);
  });
});
