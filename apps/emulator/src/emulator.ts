/**
 * Estado del emulador: robot, planificador, ejecución del programa y opción "Invertir pinza".
 * Solo coordina objetos del núcleo; la escena y la interfaz leen de aquí.
 */
import {
  MotionPlanner,
  ProgramRunner,
  parseProgram,
  type ProgramError,
  type ProgramPoint,
  type RobotConfig,
} from '@emulador/core';

/** Velocidad (%) de los movimientos manuales con los deslizadores. */
const JOG_SPEED = 50;

export class Emulator {
  private robotConfig: RobotConfig;
  private currentPlanner: MotionPlanner;
  private currentRunner: ProgramRunner;
  private programName = '';
  private listeners: (() => void)[] = [];

  constructor(robot: RobotConfig) {
    this.robotConfig = robot;
    this.currentPlanner = new MotionPlanner(robot);
    this.currentRunner = this.createRunner([]);
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

  get name(): string {
    return this.programName;
  }

  /** Avisa de cambios de programa, estado de ejecución, punto en curso o configuración. */
  subscribe(listener: () => void): void {
    this.listeners.push(listener);
  }

  /** Lee un programa TXT. Con errores, no reemplaza el programa cargado y los devuelve. */
  loadProgram(text: string, name: string): ProgramError[] {
    const result = parseProgram(text, this.robotConfig);
    if (!result.ok) return result.errors;
    this.programName = name;
    this.currentRunner.load(result.points);
    return [];
  }

  /** Mueve una articulación (índice) o la pinza (`'gripper'`) a `percent`, con el robot en reposo. */
  jog(target: number | 'gripper', percent: number): void {
    if (this.currentRunner.state !== 'idle') return;
    const current = this.currentPlanner.toPoint(JOG_SPEED);
    const point: ProgramPoint =
      target === 'gripper'
        ? { ...current, gripper: percent }
        : { ...current, joints: current.joints.map((p, i) => (i === target ? percent : p)) };
    this.currentPlanner.moveTo(point);
  }

  /**
   * Opción "Invertir pinza" (se aplica en reposo). El programa no cambia: solo cómo se
   * interpreta el valor de la pinza.
   */
  setGripperInverted(inverted: boolean): void {
    if (this.currentRunner.state !== 'idle' || inverted === this.robotConfig.gripper.inverted)
      return;
    this.robotConfig = { ...this.robotConfig, gripper: { ...this.robotConfig.gripper, inverted } };
    this.currentPlanner = new MotionPlanner(this.robotConfig, this.currentPlanner.pose);
    this.currentRunner = this.createRunner(this.currentRunner.program);
    this.notify();
  }

  private createRunner(program: readonly ProgramPoint[]): ProgramRunner {
    const runner = new ProgramRunner(this.currentPlanner);
    runner.load(program);
    runner.onChange = () => this.notify();
    return runner;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
