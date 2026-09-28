/**
 * Dónde se guarda la configuración del emulador. En la web, `localStorage`; en Android se
 * agregará una implementación con el plugin Preferences de Capacitor (C5) con la misma interfaz.
 */
import {
  DEFAULT_SETTINGS,
  parseSettings,
  settingsToJson,
  type EmulatorSettings,
} from '@emulador/core';

export interface SettingsStore {
  /** Configuración guardada, o la de por defecto si no hay o no se puede leer. */
  load(): Promise<EmulatorSettings>;
  save(settings: EmulatorSettings): Promise<void>;
}

const KEY = 'ujap-emulador-brazo/settings';

/** `localStorage` puede no estar disponible (modo privado, almacenamiento bloqueado). */
export class LocalSettingsStore implements SettingsStore {
  async load(): Promise<EmulatorSettings> {
    try {
      const text = localStorage.getItem(KEY);
      return text === null ? DEFAULT_SETTINGS : parseSettings(text).settings;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async save(settings: EmulatorSettings): Promise<void> {
    try {
      localStorage.setItem(KEY, settingsToJson(settings));
    } catch {
      // Sin almacenamiento, la configuración dura hasta que se cierre la app.
    }
  }
}
