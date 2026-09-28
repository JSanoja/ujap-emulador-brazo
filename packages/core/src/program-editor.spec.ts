import { describe, expect, it } from 'vitest';
import { ProgramEditor } from './program-editor';
import type { RobotConfig } from './robot-config';
import { parseProgram, roundPoint, serializeProgram, type ProgramPoint } from './txt-format';

const ROBOT: RobotConfig = {
  name: 'prueba',
  joints: [
    { id: 'A1', name: 'a', min: 0, max: 90, maxSpeed: 10 },
    { id: 'A2', name: 'b', min: 0, max: 90, maxSpeed: 10 },
  ],
  gripper: { maxOpening: 10, maxSpeed: 10, inverted: false },
};

const p = (a1: number, speed = 50): ProgramPoint => ({ joints: [a1, 0], gripper: 0, speed });
const a1s = (editor: ProgramEditor): number[] => editor.points.map((q) => q.joints[0] as number);

function editorWith(...values: number[]): ProgramEditor {
  const editor = new ProgramEditor(ROBOT);
  editor.reset(values.map((v) => p(v)));
  return editor;
}

describe('ProgramEditor', () => {
  it('programa nuevo: vacío, sin cambios, sin errores y sin historial', () => {
    const editor = new ProgramEditor(ROBOT);
    expect(editor.points).toEqual([]);
    expect(editor.dirty).toBe(false);
    expect(editor.errors).toEqual([]);
    expect(editor.canUndo).toBe(false);
  });

  it('insertar, modificar, duplicar, borrar y mover', () => {
    const editor = editorWith(10, 20, 30);
    editor.insert(3, p(40));
    editor.insert(0, p(5));
    expect(a1s(editor)).toEqual([5, 10, 20, 30, 40]);
    editor.update(1, p(11));
    editor.duplicate(1);
    expect(a1s(editor)).toEqual([5, 11, 11, 20, 30, 40]);
    editor.remove(0);
    editor.move(4, 0);
    expect(a1s(editor)).toEqual([40, 11, 11, 20, 30]);
    editor.move(0, 4);
    expect(a1s(editor)).toEqual([11, 11, 20, 30, 40]);
  });

  it('setSpeed cambia solo la velocidad', () => {
    const editor = editorWith(10);
    editor.setSpeed(0, 80);
    expect(editor.points[0]).toEqual(p(10, 80));
  });

  it('índices fuera del programa son error', () => {
    const editor = editorWith(10);
    expect(() => editor.update(1, p(0))).toThrow(RangeError);
    expect(() => editor.remove(-1)).toThrow(RangeError);
    expect(() => editor.insert(2, p(0))).toThrow(RangeError);
    expect(() => editor.move(0, 1)).toThrow(RangeError);
    expect(() => editor.duplicate(0.5)).toThrow(
      'El punto 1.5 no existe; el programa tiene 1 puntos.',
    );
  });

  it('deshacer y rehacer; una edición nueva borra lo que se podía rehacer', () => {
    const editor = editorWith(10);
    editor.insert(1, p(20));
    editor.insert(2, p(30));
    editor.undo();
    expect(a1s(editor)).toEqual([10, 20]);
    editor.undo();
    expect(a1s(editor)).toEqual([10]);
    editor.undo(); // sin efecto
    expect(editor.canUndo).toBe(false);
    editor.redo();
    expect(a1s(editor)).toEqual([10, 20]);
    editor.remove(0);
    expect(editor.canRedo).toBe(false);
    editor.redo(); // sin efecto
    expect(a1s(editor)).toEqual([20]);
  });

  it('cambios sin guardar: se marcan al editar y se limpian al exportar o al deshacer', () => {
    const editor = editorWith(10);
    editor.move(0, 0); // mover al mismo lugar no es un cambio
    expect(editor.dirty).toBe(false);
    editor.setSpeed(0, 70);
    expect(editor.dirty).toBe(true);
    editor.undo();
    expect(editor.dirty).toBe(false);
    editor.redo();
    editor.markSaved();
    expect(editor.dirty).toBe(false);
    expect(editor.canUndo).toBe(true); // exportar no borra el historial
  });

  it('validación en vivo con los mismos mensajes que al importar', () => {
    const editor = editorWith(10, 20);
    editor.update(1, { joints: [20, 120], gripper: 0, speed: 0 });
    expect(editor.errors).toEqual([
      { line: 2, message: 'Línea 2: la articulación A2 vale 120; debe estar entre 0 y 100.' },
      { line: 2, message: 'Línea 2: la velocidad vale 0; debe estar entre 1 y 100.' },
    ]);
    const imported = parseProgram(serializeProgram(editor.points), ROBOT);
    expect(imported.ok ? [] : imported.errors).toEqual(editor.errors);
    editor.undo();
    expect(editor.errors).toEqual([]);
  });

  it('avisa de cada cambio', () => {
    const editor = editorWith(10);
    let calls = 0;
    editor.onChange = () => calls++;
    editor.insert(0, p(5));
    editor.undo();
    editor.redo();
    editor.markSaved();
    editor.reset();
    expect(calls).toBe(5);
  });

  it('el historial conserva 100 pasos', () => {
    const editor = editorWith(0);
    for (let i = 1; i <= 120; i++) editor.update(0, p(i % 90));
    let steps = 0;
    while (editor.canUndo) {
      editor.undo();
      steps++;
    }
    expect(steps).toBe(100);
  });
});

describe('roundPoint', () => {
  it('redondea como al exportar (1 decimal por defecto)', () => {
    const point: ProgramPoint = { joints: [12.345, 7.05], gripper: 99.96, speed: 49.99 };
    expect(roundPoint(point)).toEqual({ joints: [12.3, 7.1], gripper: 100, speed: 50 });
    expect(roundPoint(point, 2)).toEqual({ joints: [12.35, 7.05], gripper: 99.96, speed: 49.99 });
  });
});
