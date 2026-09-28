/**
 * Formato de programa TXT: lectura, validación y escritura.
 * Ver docs/03-ESPEC-FORMATO-TXT.md.
 *
 * Cada línea es un punto: `p1 … pN pinza v`, con posiciones en % (0–100)
 * y velocidad en % (1–100). Las líneas vacías y las que empiezan con `#`
 * se ignoran al leer y no se escriben al exportar.
 */
import { valuesPerLine, type RobotConfig } from './robot-config';

/** Un punto del programa, con los valores tal como van en el TXT (porcentajes). */
export interface ProgramPoint {
  /** Posición de cada articulación en %, en el orden de `RobotConfig.joints`. */
  readonly joints: readonly number[];
  /** Posición de la pinza en % (su sentido depende de `gripper.inverted`). */
  readonly gripper: number;
  /** Velocidad del movimiento en %. */
  readonly speed: number;
}

/** Error de un programa, con el número de línea del archivo (desde 1). */
export interface ProgramError {
  readonly line: number;
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly points: ProgramPoint[] }
  | { readonly ok: false; readonly errors: ProgramError[] };

export interface SerializeOptions {
  /** Decimales máximos por valor; los ceros de sobra no se escriben. Por defecto 1. */
  readonly decimals?: number;
  /** Fin de línea. Por defecto CRLF (Windows), como el entorno original del laboratorio. */
  readonly lineEnding?: '\r\n' | '\n';
}

/** Número decimal con punto, sin exponente ni separador de miles. */
const NUMBER_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Lee un programa TXT. Si hay errores, los devuelve todos (con su número de línea)
 * y no devuelve puntos: el programa no se carga.
 */
export function parseProgram(text: string, robot: RobotConfig): ParseResult {
  const expected = valuesPerLine(robot);
  const points: ProgramPoint[] = [];
  const errors: ProgramError[] = [];

  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  lines.forEach((raw, index) => {
    const line = index + 1;
    const content = raw.trim();
    if (content === '' || content.startsWith('#')) return;

    const tokens = content.split(/\s+/);
    if (tokens.length !== expected) {
      errors.push({
        line,
        message: `Línea ${line}: se esperaban ${expected} valores, se encontraron ${tokens.length}.`,
      });
      return;
    }

    const invalid = tokens.findIndex((token) => !NUMBER_PATTERN.test(token));
    if (invalid !== -1) {
      errors.push({
        line,
        message: `Línea ${line}: el valor ${invalid + 1} ("${tokens[invalid]}") no es un número.`,
      });
      return;
    }

    const values = tokens.map(Number);
    const point: ProgramPoint = {
      joints: values.slice(0, robot.joints.length),
      gripper: values[expected - 2] as number,
      speed: values[expected - 1] as number,
    };
    const pointErrors = validatePoint(point, robot, line);
    if (pointErrors.length > 0) {
      errors.push(...pointErrors);
    } else {
      points.push(point);
    }
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, points };
}

/**
 * Valida un punto ya leído (por ejemplo, editado en la interfaz).
 * `line` es el número de línea que tendrá el punto en el archivo exportado.
 */
export function validatePoint(
  point: ProgramPoint,
  robot: RobotConfig,
  line: number,
): ProgramError[] {
  const errors: ProgramError[] = [];
  if (point.joints.length !== robot.joints.length) {
    const found = point.joints.length + 2;
    errors.push({
      line,
      message: `Línea ${line}: se esperaban ${valuesPerLine(robot)} valores, se encontraron ${found}.`,
    });
    return errors;
  }
  point.joints.forEach((value, i) => {
    if (!inRange(value, 0)) {
      const id = robot.joints[i]?.id ?? `${i + 1}`;
      errors.push({
        line,
        message: `Línea ${line}: la articulación ${id} vale ${value}; debe estar entre 0 y 100.`,
      });
    }
  });
  if (!inRange(point.gripper, 0)) {
    errors.push({
      line,
      message: `Línea ${line}: la pinza vale ${point.gripper}; debe estar entre 0 y 100.`,
    });
  }
  if (!inRange(point.speed, 1)) {
    errors.push({
      line,
      message: `Línea ${line}: la velocidad vale ${point.speed}; debe estar entre 1 y 100.`,
    });
  }
  return errors;
}

/**
 * Valida un programa en memoria con los mismos mensajes que `parseProgram`.
 * El punto i (desde 0) corresponde a la línea i + 1 del archivo exportado.
 */
export function validateProgram(
  points: readonly ProgramPoint[],
  robot: RobotConfig,
): ProgramError[] {
  return points.flatMap((point, index) => validatePoint(point, robot, index + 1));
}

/** Escribe el programa en formato TXT: una línea por punto, valores separados por un espacio. */
export function serializeProgram(
  points: readonly ProgramPoint[],
  options: SerializeOptions = {},
): string {
  const decimals = options.decimals ?? 1;
  const eol = options.lineEnding ?? '\r\n';
  return points
    .map((point) =>
      [...point.joints, point.gripper, point.speed]
        .map((value) => formatNumber(value, decimals))
        .join(' '),
    )
    .map((line) => line + eol)
    .join('');
}

/**
 * Redondea los valores de un punto como al exportar (por defecto 1 decimal), para que lo que
 * se ve en el editor sea lo mismo que queda en el archivo.
 */
export function roundPoint(point: ProgramPoint, decimals = 1): ProgramPoint {
  const round = (value: number): number => Number(formatNumber(value, decimals));
  return {
    joints: point.joints.map(round),
    gripper: round(point.gripper),
    speed: round(point.speed),
  };
}

function inRange(value: number, min: number): boolean {
  return Number.isFinite(value) && value >= min && value <= 100;
}

/**
 * Redondea a `decimals` y quita los ceros de sobra: 50.0 → "50", 12.50 → "12.5", −0 → "0".
 * Se redondea sobre la representación decimal (vía exponente) y no con `toFixed`,
 * porque 7.05 en binario es 7.0499… y `toFixed(1)` daría "7.0" en lugar de "7.1".
 */
function formatNumber(value: number, decimals: number): string {
  const rounded = Number(`${Math.round(Number(`${value}e${decimals}`))}e-${decimals}`);
  return String(rounded === 0 ? 0 : rounded);
}
