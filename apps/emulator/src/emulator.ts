/**
 * Estado del emulador: robot, planificador, editor y ejecución del programa, y la opción
 * "Invertir pinza". Solo coordina objetos del núcleo; la escena y la interfaz leen de aquí.
 */
import {
  MotionPlanner,
  ProgramEditor,
  ProgramRunner,
  parseProgram,
  roundPoint,
  serializeProgram,
  type ProgramError,
  type ProgramPoint,
  type RobotConfig,
} from '@emulador/core';

/** Velocidad (%) de los movimientos manuales (deslizadores e "Ir al punto"). */
const JOG_SPEED = 50;

/** Nombre sugerido por la spec TXT: programa-AAAAMMDD-HHMM.txt. */
export function defaultProgramName(date = new Date()): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `programa-${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}.txt`;
}

export class Emulator {
  readonly editor: ProgramEditor;
  private robotConfig: RobotConfig;
  private currentPlanner: MotionPlanner;
  private currentRunner: ProgramRunner;
  private programName: string | null = null;
  private listeners: (() => void)[] = [];

  constructor(robot: RobotConfig) {
    this.robotConfig = robot;
    this.editor = new ProgramEditor(robot);
    this.currentPlanner = new MotionPlanner(robot);
    this.currentRunner = this.createRunner();
    this.editor.onChange = () => {
      // El programa que se ejecuta es siempre el del editor (solo se edita en reposo).
      if (this.currentRunner.state === 'idle') this.currentRunner.load(this.editor.points);
      this.notify();
    };
  }

  get robot(): RobotConfig {
    return this.robotConfig;
  }

  get planner(): MotionPlanner {
    return this.currentPlanner;
  }

  get runner(): ProgramRunner {
    return this.currentRunner;
  }

  /** Nombre del archivo del programa; `null` si es nuevo y todavía no se exportó. */
  get name(): string | null {
    return this.programName;
  }

  /** `true` si el programa se puede ejecutar: tiene puntos y no tiene errores. */
  get runnable(): boolean {
    return this.editor.points.length > 0 && this.editor.errors.length === 0;
  }

  /** Avisa de cambios de programa, ejecución, punto en curso o configuración. */
  subscribe(listener: () => void): void {
    this.listeners.push(listener);
  }

  newProgram(): void {
    this.programName = null;
    this.editor.reset();
  }

  /** Lee un programa TXT. Con errores no reemplaza el programa abierto y los devuelve. */
  loadProgram(text: string, name: string): ProgramError[] {
    const result = parseProgram(text, this.robotConfig);
    if (!result.ok) return result.errors;
    this.programName = name;
    this.editor.reset(result.points);
    return [];
  }

  /** Texto TXT del programa y nombre de archivo; lo marca como guardado. */
  exportProgram(): { readonly name: string; readonly text: string } {
    this.programName ??= defaultProgramName();
    const text = serializeProgram(this.editor.points);
    this.editor.markSaved();
    return { name: this.programName, text };
  }

  /** Enseñar (teach): inserta la pose actual del robot como punto en la posición `at`. */
  teach(at: number, speed: number): void {
    this.editor.insert(at, roundPoint(this.currentPlanner.toPoint(speed)));
  }

  /** Reemplaza el punto `index` por la pose actual, conservando su velocidad. */
  reteach(index: number): void {
    const speed = this.editor.points[index]?.speed ?? JOG_SPEED;
    this.editor.update(index, roundPoint(this.currentPlanner.toPoint(speed)));
  }

  /** Lleva el robot al punto `index` del programa (en reposo, a velocidad de movimiento manual). */
  goToPoint(index: number): void {
    const point = this.editor.points[index];
    if (!point || this.currentRunner.state !== 'idle') return;
    this.currentPlanner.moveTo({ ...point, speed: JOG_SPEED });
  }

  /** Mueve una articulación (índice) o la pinza (`'gripper'`) a `percent`, con el robot en reposo. */
  jog(target: number | 'gripper', percent: number): void {
    if (this.currentRunner.state !== 'idle') return;
    // Se parte del destino (no de la pose actual) para no perder otro eje que se esté moviendo.
    const current = this.currentPlanner.toPoint(JOG_SPEED, this.currentPlanner.target);
    const point: ProgramPoint =
      target === 'gripper'
        ? { ...current, gripper: percent }
        : { ...current, joints: current.joints.map((p, i) => (i === target ? percent : p)) };
    this.currentPlanner.moveTo(point);
  }

  /** Reproduce desde `startAt` (o continúa si está en pausa). No hace nada si hay errores. */
  play(startAt = 0): void {
    if (!this.runnable) return;
    this.currentRunner.play(startAt);
  }

  /**
   * Opción "Invertir pinza" (se aplica en reposo). El programa no cambia: solo cómo se
   * interpreta el valor de la pinza.
   */
  setGripperInverted(inverted: boolean): void {
    if (this.currentRunner.state !== 'idle' || inverted === this.robotConfig.gripper.inverted) {
      return;
    }
    this.robotConfig = { ...this.robotConfig, gripper: { ...this.robotConfig.gripper, inverted } };
    this.currentPlanner = new MotionPlanner(this.robotConfig, this.currentPlanner.pose);
    this.currentRunner = this.createRunner();
    this.notify();
  }

  private createRunner(): ProgramRunner {
    const runner = new ProgramRunner(this.currentPlanner);
    runner.load(this.editor.points);
    runner.onChange = () => this.notify();
    return runner;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
