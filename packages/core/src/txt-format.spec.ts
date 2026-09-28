import { describe, expect, it } from 'vitest';
import { LABVOLT_5250, type RobotConfig } from './robot-config';
import {
  parseProgram,
  serializeProgram,
  validateProgram,
  type ParseResult,
  type ProgramPoint,
} from './txt-format';

/** Robot de 2 ejes + pinza: 4 valores por línea, como el ejemplo "20 20 80 50". */
const SMALL_ROBOT: RobotConfig = {
  name: 'prueba',
  joints: [
    { id: 'A1', name: 'a', min: 0, max: 90, maxSpeed: 10 },
    { id: 'A2', name: 'b', min: 0, max: 90, maxSpeed: 10 },
  ],
  gripper: { maxOpening: 10, maxSpeed: 10, inverted: false },
};

const SPEC_EXAMPLE = '50 50 50 50 50 0 50\n50 70 30 45 50 0 30\n50 70 30 45 50 100 20\n';

function points(result: ParseResult): ProgramPoint[] {
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
  return result.points;
}

function errors(result: ParseResult): string[] {
  if (result.ok) throw new Error('Se esperaba un error.');
  return result.errors.map((e) => e.message);
}

describe('parseProgram', () => {
  it('caso 1: "20 20 80 50" en un robot de 2 ejes + pinza se interpreta sin errores', () => {
    expect(points(parseProgram('20 20 80 50', SMALL_ROBOT))).toEqual([
      { joints: [20, 20], gripper: 80, speed: 50 },
    ]);
  });

  it('caso 2: 6 + 1 valores por línea en el LabVolt de 5 ejes + pinza', () => {
    const result = points(parseProgram(SPEC_EXAMPLE, LABVOLT_5250));
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ joints: [50, 70, 30, 45, 50], gripper: 100, speed: 20 });
  });

  it('caso 4: 5 valores en un robot de 7 devuelve el error con su número de línea', () => {
    const result = parseProgram('50 50 50 50 50 0 50\n50 50 50 50 50\n', LABVOLT_5250);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        { line: 2, message: 'Línea 2: se esperaban 7 valores, se encontraron 5.' },
      ]);
    }
  });

  it('caso 7: 101 o −1 devuelve el error de rango con su número de línea', () => {
    const text = '50 50 50 50 50 0 50\n50 101 50 50 50 0 50\n-1 50 50 50 50 0 50\n';
    expect(errors(parseProgram(text, LABVOLT_5250))).toEqual([
      'Línea 2: la articulación A2 vale 101; debe estar entre 0 y 100.',
      'Línea 3: la articulación A1 vale -1; debe estar entre 0 y 100.',
    ]);
  });

  it('pinza fuera de 0–100 y velocidad fuera de 1–100 son error', () => {
    expect(errors(parseProgram('50 50 50 50 50 120 0', LABVOLT_5250))).toEqual([
      'Línea 1: la pinza vale 120; debe estar entre 0 y 100.',
      'Línea 1: la velocidad vale 0; debe estar entre 1 y 100.',
    ]);
    expect(errors(parseProgram('50 50 50 50 50 0 100.5', LABVOLT_5250))).toEqual([
      'Línea 1: la velocidad vale 100.5; debe estar entre 1 y 100.',
    ]);
  });

  it('valores no numéricos son error: texto, coma decimal, exponente', () => {
    expect(errors(parseProgram('20 abc 80 50\n20 1,5 80 50\n20 1e2 80 50', SMALL_ROBOT))).toEqual([
      'Línea 1: el valor 2 ("abc") no es un número.',
      'Línea 2: el valor 2 ("1,5") no es un número.',
      'Línea 3: el valor 2 ("1e2") no es un número.',
    ]);
  });

  it('con errores no devuelve puntos: el programa no se carga', () => {
    const result = parseProgram('20 20 80 50\n20 20 80', SMALL_ROBOT);
    expect(result.ok).toBe(false);
    expect('points' in result).toBe(false);
  });

  it('acepta decimales con punto, signo y formas cortas', () => {
    expect(points(parseProgram('12.5 +3 .5 7.', SMALL_ROBOT))).toEqual([
      { joints: [12.5, 3], gripper: 0.5, speed: 7 },
    ]);
  });

  it('ignora líneas vacías y comentarios; los números de línea son los del archivo', () => {
    const text = '# programa de prueba\n\n20 20 80 50\n   \n  # otro comentario\n20 20 80\n';
    expect(errors(parseProgram(text, SMALL_ROBOT))).toEqual([
      'Línea 6: se esperaban 4 valores, se encontraron 3.',
    ]);
  });

  it('acepta espacios múltiples, tabuladores, CRLF, CR y BOM', () => {
    const text = '\uFEFF20  20\t80 50\r\n 10 10 10 10 \r30 30 30 30';
    expect(points(parseProgram(text, SMALL_ROBOT))).toHaveLength(3);
  });

  it('un texto vacío es un programa vacío (crear desde cero)', () => {
    expect(points(parseProgram('', SMALL_ROBOT))).toEqual([]);
  });
});

describe('serializeProgram', () => {
  it('una línea por punto, un espacio entre valores, CRLF por defecto', () => {
    const program = points(parseProgram('20\t 20 80 50', SMALL_ROBOT));
    expect(serializeProgram(program)).toBe('20 20 80 50\r\n');
  });

  it('LF opcional; programa vacío = texto vacío', () => {
    const program = points(parseProgram('20 20 80 50', SMALL_ROBOT));
    expect(serializeProgram(program, { lineEnding: '\n' })).toBe('20 20 80 50\n');
    expect(serializeProgram([])).toBe('');
  });

  it('redondea a 1 decimal por defecto y quita ceros de sobra', () => {
    const program: ProgramPoint[] = [{ joints: [12.34, 50.0], gripper: 99.96, speed: 7.05 }];
    expect(serializeProgram(program)).toBe('12.3 50 100 7.1\r\n');
    expect(serializeProgram(program, { decimals: 0 })).toBe('12 50 100 7\r\n');
    expect(serializeProgram(program, { decimals: 2 })).toBe('12.34 50 99.96 7.05\r\n');
  });

  it('nunca escribe "-0"', () => {
    const program: ProgramPoint[] = [{ joints: [-0, 0.01], gripper: 0, speed: 1 }];
    expect(serializeProgram(program)).toBe('0 0 0 1\r\n');
  });

  it('caso 3: importar y exportar devuelve un archivo equivalente (ida y vuelta)', () => {
    const text = '# comentario\r\n50 50 50 50 50 0 50\r\n\r\n12.5  70 30 45 50 100 20\r\n';
    const first = points(parseProgram(text, LABVOLT_5250));
    const exported = serializeProgram(first);
    expect(exported).toBe('50 50 50 50 50 0 50\r\n12.5 70 30 45 50 100 20\r\n');
    expect(points(parseProgram(exported, LABVOLT_5250))).toEqual(first);
    expect(serializeProgram(points(parseProgram(exported, LABVOLT_5250)))).toBe(exported);
  });
});

describe('validateProgram', () => {
  it('programa válido: sin errores', () => {
    expect(validateProgram(points(parseProgram(SPEC_EXAMPLE, LABVOLT_5250)), LABVOLT_5250)).toEqual(
      [],
    );
  });

  it('mismos mensajes que al importar; el punto i es la línea i + 1', () => {
    const program: ProgramPoint[] = [
      { joints: [20, 20], gripper: 80, speed: 50 },
      { joints: [20, 101], gripper: 80, speed: 50 },
      { joints: [20], gripper: 80, speed: 50 },
    ];
    expect(validateProgram(program, SMALL_ROBOT)).toEqual([
      { line: 2, message: 'Línea 2: la articulación A2 vale 101; debe estar entre 0 y 100.' },
      { line: 3, message: 'Línea 3: se esperaban 4 valores, se encontraron 3.' },
    ]);
  });

  it('NaN e infinito son valores fuera de rango', () => {
    const program: ProgramPoint[] = [
      { joints: [Number.NaN, 20], gripper: Number.POSITIVE_INFINITY, speed: 50 },
    ];
    expect(validateProgram(program, SMALL_ROBOT)).toHaveLength(2);
  });
});
