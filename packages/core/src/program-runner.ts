/**
 * Ejecución de programas punto a punto, pensada para el bucle de render:
 * la escena llama a `tick(dt)` en cada cuadro y lee la pose del planificador.
 *
 * Estados:
 * - `idle`: sin programa en ejecución (el planificador puede moverse por un comando manual).
 * - `running`: avanza el tiempo y pasa al punto siguiente al llegar a cada uno.
 * - `paused`: el tiempo no avanza; `resume` o `play` continúan donde quedó.
 *
 * En modo paso a paso (`stepForward`) el programa se pausa al llegar a cada punto.
 */
import type { MotionPlanner } from './motion-planner';
import type { ProgramPoint } from './txt-format';

export type RunnerState = 'idle' | 'running' | 'paused';

export class ProgramRunner {
  private points: readonly ProgramPoint[] = [];
  private currentState: RunnerState = 'idle';
  private currentIndex = -1;
  private stepMode = false;

  /** Se llama cada vez que cambia el estado o el punto en curso. */
  onChange: ((runner: ProgramRunner) => void) | null = null;

  constructor(readonly planner: MotionPlanner) {}

  get state(): RunnerState {
    return this.currentState;
  }

  /** Índice del punto en curso (o del último alcanzado en pausa); −1 si no hay ninguno. */
  get index(): number {
    return this.currentIndex;
  }

  get program(): readonly ProgramPoint[] {
    return this.points;
  }

  /** Carga un programa (ya validado). Detiene el que se esté ejecutando. */
  load(points: readonly ProgramPoint[]): void {
    this.stop();
    this.points = points;
    this.notify();
  }

  /**
   * Reproduce el programa. En pausa, continúa donde quedó; si no, empieza en `startAt`.
   * @throws RangeError si `startAt` no es un punto del programa.
   */
  play(startAt = 0): void {
    this.stepMode = false;
    if (this.currentState === 'paused') {
      this.continueFromPause();
      return;
    }
    this.start(startAt);
  }

  /** Congela el movimiento; `play` continúa. */
  pause(): void {
    if (this.currentState !== 'running') return;
    this.currentState = 'paused';
    this.notify();
  }

  /** Detiene el robot donde está y termina la ejecución. */
  stop(): void {
    const changed = this.currentState !== 'idle' || this.currentIndex !== -1;
    this.planner.stop();
    this.currentState = 'idle';
    this.currentIndex = -1;
    this.stepMode = false;
    if (changed) this.notify();
  }

  /**
   * Paso a paso: ejecuta hasta el próximo punto y se pausa al llegar.
   * Sin ejecución en curso, empieza por el primer punto.
   */
  stepForward(): void {
    this.stepMode = true;
    if (this.currentState === 'idle') {
      if (this.points.length > 0) this.start(0);
      return;
    }
    if (this.currentState === 'paused') this.continueFromPause();
  }

  /** Avanza `dt` segundos. Los comandos manuales (en reposo) también avanzan. */
  tick(dt: number): void {
    if (this.currentState === 'paused') return;
    this.planner.step(dt);
    if (this.currentState !== 'running' || !this.planner.isAtTarget()) return;

    if (this.stepMode) {
      this.currentState = 'paused';
    } else if (this.currentIndex + 1 < this.points.length) {
      this.moveToPoint(this.currentIndex + 1);
    } else {
      this.currentState = 'idle';
    }
    this.notify();
  }

  private start(startAt: number): void {
    if (!Number.isInteger(startAt) || startAt < 0 || startAt >= this.points.length) {
      throw new RangeError(
        `El punto inicial vale ${startAt}; el programa tiene ${this.points.length} puntos.`,
      );
    }
    this.moveToPoint(startAt);
    this.currentState = 'running';
    this.notify();
  }

  private continueFromPause(): void {
    // Si el punto ya se alcanzó (pausa del paso a paso), se pasa al siguiente.
    if (this.planner.isAtTarget()) {
      if (this.currentIndex + 1 >= this.points.length) {
        this.stop();
        return;
      }
      this.moveToPoint(this.currentIndex + 1);
    }
    this.currentState = 'running';
    this.notify();
  }

  private moveToPoint(index: number): void {
    this.currentIndex = index;
    this.planner.moveTo(this.points[index] as ProgramPoint);
  }

  private notify(): void {
    this.onChange?.(this);
  }
}
