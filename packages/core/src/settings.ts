/**
 * Configuración del emulador (workunit C6): cómo se interpretan y se exportan los programas.
 * El TXT no guarda la configuración; por eso la interfaz debe mostrarla junto al programa.
 *
 * Formato JSON (para guardarla, compartirla o adjuntarla como anexo):
 * { "type": "ujap-emulador-brazo/settings", "version": 1,
 *   "gripperInverted": false, "exportDecimals": 1, "lineEnding": "CRLF" }
 */
import type { SerializeOptions } from './txt-format';

export type ExportDecimals = 0 | 1 | 2;
export type LineEnding = 'CRLF' | 'LF';

export interface EmulatorSettings {
  /** "Invertir pinza": `false` → 0 % = abierta, 100 % = cerrada; `true` → al revés. */
  readonly gripperInverted: boolean;
  /** Decimales al exportar el TXT. */
  readonly exportDecimals: ExportDecimals;
  /** Fin de línea al exportar el TXT. */
  readonly lineEnding: LineEnding;
}

export const DEFAULT_SETTINGS: EmulatorSettings = {
  gripperInverted: false,
  exportDecimals: 1,
  lineEnding: 'CRLF',
};

const SETTINGS_TYPE = 'ujap-emulador-brazo/settings';
const SETTINGS_VERSION = 1;

export interface SettingsResult {
  /** Configuración leída; los valores inválidos o ausentes quedan con su valor por defecto. */
  readonly settings: EmulatorSettings;
  /** Problemas encontrados, en español, para mostrar al usuario. */
  readonly errors: string[];
}

/** Lee una configuración desde un objeto ya decodificado (tolerante: nunca falla). */
export function readSettings(value: unknown): SettingsResult {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { settings: DEFAULT_SETTINGS, errors: ['La configuración no es un objeto JSON.'] };
  }
  const data = value as Record<string, unknown>;
  if (data['type'] !== undefined && data['type'] !== SETTINGS_TYPE) {
    errors.push(
      `El archivo no es una configuración del emulador (type = "${String(data['type'])}").`,
    );
  }
  if (typeof data['version'] === 'number' && data['version'] > SETTINGS_VERSION) {
    errors.push(
      `La configuración es de una versión más nueva (${data['version']}); se leyó lo que se pudo.`,
    );
  }

  const pick = <T>(key: string, valid: readonly T[], fallback: T, describe: string): T => {
    if (!(key in data)) return fallback;
    const raw = data[key];
    if (valid.includes(raw as T)) return raw as T;
    errors.push(
      `"${key}" vale ${JSON.stringify(raw)}; debe ser ${describe}. Se usa ${JSON.stringify(fallback)}.`,
    );
    return fallback;
  };

  return {
    settings: {
      gripperInverted: pick(
        'gripperInverted',
        [true, false],
        DEFAULT_SETTINGS.gripperInverted,
        'true o false',
      ),
      exportDecimals: pick(
        'exportDecimals',
        [0, 1, 2] as const,
        DEFAULT_SETTINGS.exportDecimals,
        '0, 1 o 2',
      ),
      lineEnding: pick(
        'lineEnding',
        ['CRLF', 'LF'] as const,
        DEFAULT_SETTINGS.lineEnding,
        '"CRLF" o "LF"',
      ),
    },
    errors,
  };
}

/** Lee una configuración desde texto JSON. */
export function parseSettings(text: string): SettingsResult {
  try {
    return readSettings(JSON.parse(text));
  } catch {
    return { settings: DEFAULT_SETTINGS, errors: ['El archivo no es JSON válido.'] };
  }
}

/** Configuración como texto JSON legible. */
export function settingsToJson(settings: EmulatorSettings): string {
  return `${JSON.stringify({ type: SETTINGS_TYPE, version: SETTINGS_VERSION, ...settings }, null, 2)}\n`;
}

/** Opciones de exportación del TXT según la configuración. */
export function serializeOptions(settings: EmulatorSettings): SerializeOptions {
  return {
    decimals: settings.exportDecimals,
    lineEnding: settings.lineEnding === 'CRLF' ? '\r\n' : '\n',
  };
}
