/**
 * Diálogo de configuración (C6): "Invertir pinza", decimales y fin de línea al exportar.
 * Cada cambio se aplica al emulador y se guarda. Permite exportar e importar la
 * configuración como JSON y restablecer los valores por defecto.
 */
import {
  DEFAULT_SETTINGS,
  parseSettings,
  settingsToJson,
  type EmulatorSettings,
  type ExportDecimals,
  type LineEnding,
} from '@emulador/core';
import type { Emulator } from '../emulator';
import type { SettingsStore } from '../settings-store';
import { pickTextFile, saveTextFile } from './files';

function field(label: string, control: HTMLElement, help?: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'campo';
  const lab = document.createElement('label');
  lab.htmlFor = control.id;
  lab.textContent = label;
  div.append(lab, control);
  if (help) {
    const p = document.createElement('p');
    p.className = 'ayuda';
    p.textContent = help;
    div.append(p);
  }
  return div;
}

function select<T extends string | number>(
  id: string,
  options: readonly (readonly [T, string])[],
): HTMLSelectElement {
  const s = document.createElement('select');
  s.id = id;
  for (const [value, label] of options) s.append(new Option(label, String(value)));
  return s;
}

export function openSettingsDialog(emulator: Emulator, store: SettingsStore): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialogo configuracion';
  dialog.setAttribute('aria-labelledby', 'config-titulo');

  const title = document.createElement('h2');
  title.id = 'config-titulo';
  title.textContent = 'Configuración';

  const inverted = document.createElement('input');
  inverted.type = 'checkbox';
  inverted.id = 'config-invertir-pinza';
  const decimals = select<ExportDecimals>('config-decimales', [
    [0, '0 (enteros)'],
    [1, '1 decimal'],
    [2, '2 decimales'],
  ]);
  const lineEnding = select<LineEnding>('config-fin-de-linea', [
    ['CRLF', 'CRLF (Windows)'],
    ['LF', 'LF (Linux, macOS)'],
  ]);
  const busy = document.createElement('p');
  busy.className = 'ayuda';
  busy.textContent = 'Detén el programa para cambiar la configuración.';
  const problems = document.createElement('ul');
  problems.className = 'errores';

  const exportJson = document.createElement('button');
  exportJson.type = 'button';
  exportJson.textContent = 'Exportar JSON';
  const importJson = document.createElement('button');
  importJson.type = 'button';
  importJson.textContent = 'Importar JSON…';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Restablecer';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Cerrar';
  close.className = 'primario';
  const actions = document.createElement('div');
  actions.className = 'dialogo-acciones';
  actions.append(exportJson, importJson, reset, close);

  dialog.append(
    title,
    field(
      'Invertir pinza',
      inverted,
      'Desactivada: 0 % = abierta, 100 % = cerrada. Activada: 0 % = cerrada, 100 % = abierta. ' +
        'El TXT no guarda esta opción: el mismo archivo mueve la pinza al revés.',
    ),
    field('Decimales al exportar el TXT', decimals),
    field('Fin de línea al exportar el TXT', lineEnding),
    busy,
    problems,
    actions,
  );

  const show = (settings: EmulatorSettings, messages: readonly string[] = []): void => {
    const idle = emulator.runner.state === 'idle';
    inverted.checked = settings.gripperInverted;
    decimals.value = String(settings.exportDecimals);
    lineEnding.value = settings.lineEnding;
    for (const control of [inverted, decimals, lineEnding, importJson, reset]) {
      control.disabled = !idle;
    }
    busy.hidden = idle;
    problems.replaceChildren(
      ...messages.map((m) => {
        const li = document.createElement('li');
        li.textContent = m;
        return li;
      }),
    );
  };

  const apply = (settings: EmulatorSettings, messages: readonly string[] = []): void => {
    if (emulator.applySettings(settings)) void store.save(settings);
    show(emulator.settings, messages);
  };

  const fromControls = (): EmulatorSettings => ({
    gripperInverted: inverted.checked,
    exportDecimals: Number(decimals.value) as ExportDecimals,
    lineEnding: lineEnding.value as LineEnding,
  });

  for (const control of [inverted, decimals, lineEnding]) {
    control.addEventListener('change', () => apply(fromControls()));
  }
  exportJson.addEventListener('click', () =>
    saveTextFile(
      'configuracion-emulador.json',
      settingsToJson(emulator.settings),
      'application/json',
    ),
  );
  importJson.addEventListener('click', async () => {
    const file = await pickTextFile('.json,application/json');
    if (!file) return;
    const { settings, errors } = parseSettings(file.text);
    apply(
      settings,
      errors.length > 0
        ? [`Al importar "${file.name}":`, ...errors]
        : [`Se importó "${file.name}".`],
    );
  });
  reset.addEventListener('click', () => apply(DEFAULT_SETTINGS));
  const dismiss = (): void => {
    dialog.close();
    dialog.remove();
  };
  close.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dismiss();
  });

  document.body.append(dialog);
  show(emulator.settings);
  dialog.showModal();
  close.focus();
}
