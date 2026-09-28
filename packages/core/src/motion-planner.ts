/**
 * Planificador de movimiento articular sincronizado.
 *
 * Para cada punto del programa se calcula el tiempo que necesita cada eje (y la
 * pinza) a `v` % de su velocidad máxima; la duración del movimiento es la del más
 * lento, y todos interpolan linealmente en ese tiempo, así que llegan juntos,
 * como en la interpolación articular de un controlador industrial.
 *
 * No depende del render: la escena llama a `step(dt)` en cada cuadro y lee `pose`.
 * Al terminar, la pose queda exactamente en el destino (sin comparar redondeos)
 * y se resuelven las promesas de `whenAtTarget()`.
 */
import {
  degreesToPercent,
  gripperOpening,
  gripperOpeningToPercent,
  percentToDegrees,
  speedToDegreesPerSecond,
} from './conversion';
import type { RobotConfig } from './robot-config';
import { validatePoint, type ProgramPoint } from './txt-format';

/** Pose física del robot. */
export interface RobotPose {
  /** Ángulo de cada articulación en grados, en el orden de `RobotConfig.joints`. */
  readonly joints: readonly number[];
  /** Apertura de la pinza en mm. */
  readonly gripper: number;
}

export interface RunOptions {
  /** Índice del primer punto a ejecutar (ejecutar desde el punto seleccionado). Por defecto 0. */
  readonly startAt?: number;
  /** Se llama al empezar cada punto, con su índice. */
  readonly onPoint?: (index: number) => void;
}

interface Motion {
  readonly from: RobotPose;
  readonly to: RobotPose;
  readonly duration: number;
  elapsed: number;
}

export class MotionPlanner {
  private current: RobotPose;
  private motion: Motion | null = null;
  private waiters: (() => void)[] = [];
  /** Cambia con cada `stop()`: invalida el programa que se esté ejecutando. */
  private runId = 0;

  /**
   * @param initial Pose inicial. Por defecto, cada eje en 0° (limitado a su rango)
   *   y la pinza totalmente abierta.
   */
  constructor(
    readonly robot: RobotConfig,
    initial?: RobotPose,
  ) {
    this.current = initial ?? {
      joints: robot.joints.map((joint) => Math.min(Math.max(0, joint.min), joint.max)),
      gripper: robot.gripper.maxOpening,
    };
  }

  /** Pose actual. */
  get pose(): RobotPose {
    return this.current;
  }

  /** Duración en segundos del movimiento en curso (0 si está detenido). */
  get duration(): number {
    return this.motion?.duration ?? 0;
  }

  /**
   * Inicia el movimiento hacia un punto del programa y devuelve su duración en segundos.
   * Reemplaza el movimiento en curso, si lo hay, partiendo de la pose actual.
   * @throws RangeError si el punto no es válido para este robot.
   */
  moveTo(point: ProgramPoint): number {
    const errors = validatePoint(point, this.robot, 1);
    if (errors.length > 0) {
      throw new RangeError(errors.map((e) => e.message.replace(/^Línea 1: /, '')).join(' '));
    }

    const { joints, gripper } = this.robot;
    const to: RobotPose = {
      joints: joints.map((joint, i) => percentToDegrees(joint, point.joints[i] as number)),
      gripper: gripperOpening(gripper, point.gripper),
    };

    const times = joints.map(
      (joint, i) =>
        Math.abs((to.joints[i] as number) - (this.current.joints[i] as number)) /
        speedToDegreesPerSecond(joint, point.speed),
    );
    times.push(
      Math.abs(to.gripper - this.current.gripper) / ((gripper.maxSpeed * point.speed) / 100),
    );
    const duration = Math.max(...times);

    if (duration === 0) {
      this.finish(to);
      return 0;
    }
    this.motion = { from: this.current, to, duration, elapsed: 0 };
    return duration;
  }

  /**
   * Avanza el movimiento `dt` segundos. En el último paso la pose queda
   * exactamente en el destino.
   */
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new RangeError(
        `El paso de tiempo vale ${dt} s; debe ser un número mayor o igual que 0.`,
      );
    }
    const motion = this.motion;
    if (!motion) return;

    motion.elapsed += dt;
    if (motion.elapsed >= motion.duration) {
      this.finish(motion.to);
      return;
    }
    const t = motion.elapsed / motion.duration;
    this.current = {
      joints: motion.from.joints.map((a, i) => lerp(a, motion.to.joints[i] as number, t)),
      gripper: lerp(motion.from.gripper, motion.to.gripper, t),
    };
  }

  /** `true` si no hay movimiento en curso. */
  isAtTarget(): boolean {
    return this.motion === null;
  }

  /** Se resuelve cuando termina el movimiento en curso (o de inmediato si no hay). */
  whenAtTarget(): Promise<void> {
    if (this.isAtTarget()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /**
   * Detiene el movimiento en la pose actual, resuelve las esperas y cancela
   * el programa en ejecución, si lo hay.
   */
  stop(): void {
    this.runId++;
    this.finish(this.current);
  }

  /**
   * Pose actual expresada como punto del programa (modo teach).
   * @param speed Velocidad del punto en %.
   */
  toPoint(speed: number): ProgramPoint {
    return {
      joints: this.robot.joints.map((joint, i) =>
        degreesToPercent(joint, this.current.joints[i] as number),
      ),
      gripper: gripperOpeningToPercent(this.robot.gripper, this.current.gripper),
      speed,
    };
  }

  /**
   * Ejecuta los puntos en orden, esperando que termine cada movimiento.
   * El tiempo lo sigue marcando quien llame a `step` (pausar = dejar de llamarlo).
   * Cancela el programa anterior si seguía en ejecución.
   * @returns `true` si terminó, `false` si se canceló con `stop()` u otro `runProgram`.
   */
  async runProgram(points: readonly ProgramPoint[], options: RunOptions = {}): Promise<boolean> {
    const { startAt = 0, onPoint } = options;
    if (!Number.isInteger(startAt) || startAt < 0) {
      throw new RangeError(`El punto inicial vale ${startAt}; debe ser un índice entero desde 0.`);
    }
    this.stop();
    const id = this.runId;
    for (let i = startAt; i < points.length; i++) {
      onPoint?.(i);
      if (this.runId !== id) return false;
      this.moveTo(points[i] as ProgramPoint);
      await this.whenAtTarget();
      if (this.runId !== id) return false;
    }
    return true;
  }

  private finish(pose: RobotPose): void {
    this.current = pose;
    this.motion = null;
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve());
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
