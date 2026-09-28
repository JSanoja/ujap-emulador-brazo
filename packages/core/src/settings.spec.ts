import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  readSettings,
  serializeOptions,
  settingsToJson,
  type EmulatorSettings,
} from './settings';
import { serializeProgram } from './txt-format';

describe('configuración del emulador', () => {
  it('por defecto: pinza normal, 1 decimal y CRLF', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      gripperInverted: false,
      exportDecimals: 1,
      lineEnding: 'CRLF',
    });
  });

  it('ida y vuelta por JSON', () => {
    const settings: EmulatorSettings = {
      gripperInverted: true,
      exportDecimals: 0,
      lineEnding: 'LF',
    };
    const json = settingsToJson(settings);
    expect(JSON.parse(json)).toMatchObject({ type: 'ujap-emulador-brazo/settings', version: 1 });
    expect(parseSettings(json)).toEqual({ settings, errors: [] });
  });

  it('las claves ausentes toman su valor por defecto sin error', () => {
    expect(readSettings({ gripperInverted: true })).toEqual({
      settings: { ...DEFAULT_SETTINGS, gripperInverted: true },
      errors: [],
    });
  });

  it('valores inválidos: se informan y se usa el valor por defecto', () => {
    const result = readSettings({ gripperInverted: 'si', exportDecimals: 3, lineEnding: 'crlf' });
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.errors).toEqual([
      '"gripperInverted" vale "si"; debe ser true o false. Se usa false.',
      '"exportDecimals" vale 3; debe ser 0, 1 o 2. Se usa 1.',
      '"lineEnding" vale "crlf"; debe ser "CRLF" o "LF". Se usa "CRLF".',
    ]);
  });

  it('otro tipo de archivo, versión más nueva, JSON inválido o no objeto', () => {
    expect(readSettings({ type: 'otra-cosa' }).errors[0]).toContain('no es una configuración');
    expect(readSettings({ version: 2 }).errors[0]).toContain('versión más nueva');
    expect(parseSettings('{ no es json').errors).toEqual(['El archivo no es JSON válido.']);
    expect(readSettings([1, 2]).errors).toEqual(['La configuración no es un objeto JSON.']);
    expect(readSettings(null).settings).toBe(DEFAULT_SETTINGS);
  });

  it('serializeOptions aplica decimales y fin de línea al exportar', () => {
    const point = { joints: [12.34], gripper: 0, speed: 50 };
    expect(serializeProgram([point], serializeOptions(DEFAULT_SETTINGS))).toBe('12.3 0 50\r\n');
    const lf0 = serializeOptions({ ...DEFAULT_SETTINGS, exportDecimals: 0, lineEnding: 'LF' });
    expect(serializeProgram([point], lf0)).toBe('12 0 50\n');
  });
});
