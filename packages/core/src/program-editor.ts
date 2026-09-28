/**
 * Edición de programas: agregar, modificar, duplicar, borrar y reordenar puntos, con
 * deshacer/rehacer, validación en vivo y control de cambios sin guardar.
 *
 * Los puntos pueden quedar inválidos mientras se editan (por ejemplo, un valor de 120 %):
 * `errors` los informa con los mismos mensajes y números de línea que al importar, y quien
 * ejecuta el programa debe impedirlo mientras haya errores.
 */
import type { RobotConfig } from './robot-config';
import { validateProgram, type ProgramError, type ProgramPoint } from './txt-format';

/** Pasos de deshacer que se conservan. */
const HISTORY_LIMIT = 100;

export class ProgramEditor {
  private current: readonly ProgramPoint[] = [];
  private saved: readonly ProgramPoint[] = this.current;
  private undoStack: (readonly ProgramPoint[])[] = [];
  private redoStack: (readonly ProgramPoint[])[] = [];
  private cachedErrors: ProgramError[] | null = null;

  /** Se llama después de cada cambio del programa o de su estado guardado. */
  onChange: ((editor: ProgramEditor) => void) | null = null;

  constructor(readonly robot: RobotConfig) {}

  get points(): readonly ProgramPoint[] {
    return this.current;
  }

  /** `true` si el programa cambió desde que se creó, abrió o exportó. */
  get dirty(): boolean {
    return this.current !== this.saved;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Errores de validación; el punto i corresponde a la línea i + 1 del archivo exportado. */
  get errors(): readonly ProgramError[] {
    this.cachedErrors ??= validateProgram(this.current, this.robot);
    return this.cachedErrors;
  }

  /** Reemplaza el programa (nuevo o abierto): borra el historial y lo marca como guardado. */
  reset(points: readonly ProgramPoint[] = []): void {
    this.current = [...points];
    this.saved = this.current;
    this.undoStack = [];
    this.redoStack = [];
    this.changed();
  }

  /** Marca el programa actual como guardado (después de exportarlo). */
  markSaved(): void {
    this.saved = this.current;
    this.changed();
  }

  /** Inserta un punto en la posición `index` (0 = al principio; `points.length` = al final). */
  insert(index: number, point: ProgramPoint): void {
    this.checkIndex(index, this.current.length);
    this.edit([...this.current.slice(0, index), point, ...this.current.slice(index)]);
  }

  /** Reemplaza el punto `index`. */
  update(index: number, point: ProgramPoint): void {
    this.checkIndex(index);
    this.edit(this.current.map((p, i) => (i === index ? point : p)));
  }

  /** Cambia solo la velocidad del punto `index`. */
  setSpeed(index: number, speed: number): void {
    this.checkIndex(index);
    this.update(index, { ...(this.current[index] as ProgramPoint), speed });
  }

  /** Inserta una copia del punto `index` justo después de él. */
  duplicate(index: number): void {
    this.checkIndex(index);
    this.insert(index + 1, this.current[index] as ProgramPoint);
  }

  remove(index: number): void {
    this.checkIndex(index);
    this.edit(this.current.filter((_, i) => i !== index));
  }

  /** Mueve el punto `from` a la posición `to`. */
  move(from: number, to: number): void {
    this.checkIndex(from);
    this.checkIndex(to);
    if (from === to) return;
    const points = [...this.current];
    const [point] = points.splice(from, 1);
    points.splice(to, 0, point as ProgramPoint);
    this.edit(points);
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.current);
    this.current = previous;
    this.changed();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.current);
    this.current = next;
    this.changed();
  }

  private edit(points: readonly ProgramPoint[]): void {
    this.undoStack.push(this.current);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.current = points;
    this.changed();
  }

  private checkIndex(index: number, max = this.current.length - 1): void {
    if (!Number.isInteger(index) || index < 0 || index > max) {
      throw new RangeError(
        `El punto ${index + 1} no existe; el programa tiene ${this.current.length} puntos.`,
      );
    }
  }

  private changed(): void {
    this.cachedErrors = null;
    this.onChange?.(this);
  }
}
