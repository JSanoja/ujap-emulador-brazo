/**
 * Dónde se guarda la configuración del emulador: `localStorage` en la web y el plugin
 * Preferences de Capacitor en Android, detrás de la misma interfaz.
 */
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
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

/** Android: plugin Preferences de Capacitor (sobrevive a cerrar la app y a limpiar la caché). */
export class PreferencesSettingsStore implements SettingsStore {
  async load(): Promise<EmulatorSettings> {
    const { value } = await Preferences.get({ key: KEY });
    return value === null ? DEFAULT_SETTINGS : parseSettings(value).settings;
  }

  async save(settings: EmulatorSettings): Promise<void> {
    await Preferences.set({ key: KEY, value: settingsToJson(settings) });
  }
}

/** Almacén según la plataforma: Preferences en Android, `localStorage` en la web. */
export function createSettingsStore(): SettingsStore {
  return Capacitor.isNativePlatform() ? new PreferencesSettingsStore() : new LocalSettingsStore();
}

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
