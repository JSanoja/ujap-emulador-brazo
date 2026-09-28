/**
 * Panel de programa: crear, abrir, editar, exportar y ejecutar programas TXT.
 *
 * - Archivo: nuevo, abrir TXT, ejemplos y exportar (con aviso de cambios sin guardar).
 * - Ejecución: reproducir (desde el punto seleccionado), pausar, detener y paso a paso.
 * - Edición (en reposo): enseñar la pose actual, actualizar un punto con la pose, ir al punto,
 *   duplicar, mover, borrar, deshacer/rehacer y editar los valores del punto seleccionado.
 * - Validación en vivo con los mismos mensajes y números de línea que al importar.
 */
import type { ProgramPoint } from '@emulador/core';
import { defaultProgramName, type Emulator } from '../emulator';
import { showDialog } from './dialog';
import { saveTextFile } from './files';

export interface ProgramPanelOptions {
  /** Programas de ejemplo: nombre visible y ruta del TXT (relativa a la app). */
  readonly examples: readonly { readonly label: string; readonly url: string }[];
  /** Devuelve la pieza a la zona A. */
  readonly onResetPiece: () => void;
  /** Abre la configuración del emulador. */
  readonly onOpenSettings: () => void;
}

const STATES = { idle: 'Detenido', running: 'Reproduciendo', paused: 'En pausa' } as const;

function button(label: string, title: string, className = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  if (className) b.className = className;
  return b;
}

/**
 * Íconos de ejecución en SVG: los símbolos Unicode (⏸ ⏹) se dibujan como emoji de color en
 * Android (Samsung), aun con el selector de variación de texto.
 */
const ICONS = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  stop: 'M6 6h12v12H6z',
  step: 'M5 4.5v15l10-7.5zM16 4h3v16h-3z',
} as const;

function iconButton(icon: keyof typeof ICONS, title: string): HTMLButtonElement {
  const b = button('', title, 'icono');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[icon]);
  svg.append(path);
  b.append(svg);
  return b;
}

function row(className: string, ...children: HTMLElement[]): HTMLDivElement {
  const div = document.createElement('div');
  div.className = `fila ${className}`;
  div.append(...children);
  return div;
}

function formatValue(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function mountProgramPanel(
  container: HTMLElement,
  emulator: Emulator,
  options: ProgramPanelOptions,
): void {
  const { editor, robot } = emulator;

  // ---- Encabezado y archivo ----
  const title = document.createElement('h2');
  title.textContent = 'Programa';
  const settingsButton = button('⚙', 'Configuración', 'engranaje');
  settingsButton.addEventListener('click', () => options.onOpenSettings());
  const header = row('encabezado', title, settingsButton);
  const name = document.createElement('p');
  name.className = 'nota';
  // Indicador de "Invertir pinza": el TXT no guarda la opción, así que se muestra junto al programa.
  const gripperMode = document.createElement('span');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.txt,text/plain';
  fileInput.hidden = true;
  const create = button('Nuevo', 'Crear un programa vacío');
  const open = button('Abrir…', 'Abrir un programa TXT');
  const exportButton = button('Exportar', 'Exportar el programa a TXT');
  const examples = document.createElement('select');
  examples.setAttribute('aria-label', 'Programas de ejemplo');
  examples.append(new Option('Ejemplos…', ''));
  for (const example of options.examples) examples.append(new Option(example.label, example.url));

  // ---- Ejecución ----
  const play = iconButton('play', 'Reproducir (desde el punto seleccionado)');
  const pause = iconButton('pause', 'Pausar');
  const stop = iconButton('stop', 'Detener');
  const step = iconButton('step', 'Paso a paso: ir al siguiente punto');
  const reset = button('↺ Pieza', 'Devolver la pieza a la zona A');
  const status = document.createElement('p');
  status.className = 'estado';
  status.setAttribute('role', 'status');
  const errors = document.createElement('ul');
  errors.className = 'errores';
  errors.setAttribute('aria-live', 'polite');

  // ---- Lista y edición ----
  const list = document.createElement('ol');
  list.className = 'puntos';
  list.setAttribute('aria-label', 'Puntos del programa');
  const teach = button(
    '+ Enseñar',
    'Agregar la pose actual del robot después del punto seleccionado',
    'primario',
  );
  const reteach = button('⟳ Pose', 'Reemplazar el punto seleccionado por la pose actual');
  const goTo = button('Ir', 'Llevar el robot al punto seleccionado');
  const duplicate = button('⧉', 'Duplicar el punto seleccionado');
  const up = button('↑', 'Subir el punto seleccionado');
  const down = button('↓', 'Bajar el punto seleccionado');
  const remove = button('✕', 'Borrar el punto seleccionado');
  const undo = button('↶', 'Deshacer');
  const redo = button('↷', 'Rehacer');
  const teachSpeed = document.createElement('input');
  teachSpeed.type = 'number';
  teachSpeed.min = '1';
  teachSpeed.max = '100';
  teachSpeed.value = '50';
  teachSpeed.id = 'velocidad-nuevos';
  const teachSpeedLabel = document.createElement('label');
  teachSpeedLabel.htmlFor = teachSpeed.id;
  teachSpeedLabel.textContent = 'Vel. nuevos puntos (%)';
  const form = document.createElement('fieldset');
  form.className = 'punto-form';

  container.append(
    header,
    name,
    gripperMode,
    row('archivo', create, open, examples, exportButton, fileInput),
    row('controles', play, pause, stop, step, reset),
    status,
    errors,
    list,
    row('edicion', teach, reteach, goTo, duplicate, up, down, remove, undo, redo),
    row('velocidad-nuevos', teachSpeedLabel, teachSpeed),
    form,
  );

  let selected = -1;
  let importErrors: string[] = [];

  const select = (index: number): void => {
    selected = Math.min(index, editor.points.length - 1);
    render();
  };

  // ---- Archivo ----
  const doExport = async (): Promise<void> => {
    const file = emulator.exportProgram();
    await saveTextFile(file.name, file.text);
  };

  /** Si hay cambios sin guardar, pregunta qué hacer. Devuelve `false` para cancelar. */
  const confirmDiscard = async (): Promise<boolean> => {
    if (!editor.dirty) return true;
    const choice = await showDialog({
      title: 'Cambios sin guardar',
      message: `"${emulator.name ?? 'Programa nuevo'}" tiene cambios sin exportar. ¿Qué quieres hacer?`,
      actions: [
        { id: 'export', label: 'Exportar y continuar', primary: true },
        { id: 'discard', label: 'Descartar cambios' },
        { id: 'cancel', label: 'Cancelar' },
      ],
    });
    if (choice === 'export') await doExport();
    return choice === 'export' || choice === 'discard';
  };

  const load = (text: string, fileName: string): void => {
    const problems = emulator.loadProgram(text, fileName);
    importErrors =
      problems.length > 0 ? [`No se abrió "${fileName}":`, ...problems.map((p) => p.message)] : [];
    select(problems.length > 0 ? selected : editor.points.length > 0 ? 0 : -1);
  };

  create.addEventListener('click', async () => {
    if (!(await confirmDiscard())) return;
    importErrors = [];
    emulator.newProgram();
    select(-1);
  });
  open.addEventListener('click', async () => {
    if (await confirmDiscard()) fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) load(await file.text(), file.name);
  });
  examples.addEventListener('change', async () => {
    const url = examples.value;
    examples.value = '';
    if (!url || !(await confirmDiscard())) return;
    const response = await fetch(url);
    if (!response.ok) {
      importErrors = [`No se pudo abrir el ejemplo (${response.status}).`];
      render();
      return;
    }
    load(await response.text(), url.split('/').pop() ?? url);
  });
  exportButton.addEventListener('click', doExport);

  // ---- Ejecución ----
  play.addEventListener('click', () => {
    emulator.play(emulator.runner.state === 'paused' ? undefined : Math.max(selected, 0));
  });
  pause.addEventListener('click', () => emulator.runner.pause());
  stop.addEventListener('click', () => emulator.runner.stop());
  step.addEventListener('click', () => {
    if (emulator.runnable) emulator.runner.stepForward();
  });
  reset.addEventListener('click', () => options.onResetPiece());

  // ---- Edición ----
  teach.addEventListener('click', () => {
    const at = selected + 1;
    emulator.teach(at, Math.min(Math.max(Number(teachSpeed.value) || 50, 1), 100));
    select(at);
  });
  reteach.addEventListener('click', () => emulator.reteach(selected));
  goTo.addEventListener('click', () => emulator.goToPoint(selected));
  duplicate.addEventListener('click', () => {
    editor.duplicate(selected);
    select(selected + 1);
  });
  up.addEventListener('click', () => {
    editor.move(selected, selected - 1);
    select(selected - 1);
  });
  down.addEventListener('click', () => {
    editor.move(selected, selected + 1);
    select(selected + 1);
  });
  remove.addEventListener('click', () => {
    editor.remove(selected);
    select(Math.min(selected, editor.points.length - 1));
  });
  undo.addEventListener('click', () => {
    editor.undo();
    select(selected);
  });
  redo.addEventListener('click', () => {
    editor.redo();
    select(selected);
  });

  // Formulario del punto seleccionado: un campo por valor; cada cambio es un paso de deshacer.
  const fields = [...robot.joints.map((j) => j.id), 'Pinza', 'Vel.'].map((label, i) => {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.id = `punto-valor-${i}`;
    input.inputMode = 'decimal';
    const lab = document.createElement('label');
    lab.htmlFor = input.id;
    lab.textContent = label;
    const cell = document.createElement('div');
    cell.append(lab, input);
    form.append(cell);
    input.addEventListener('change', () => {
      const point = editor.points[selected];
      const value = Number(input.value);
      if (!point || input.value.trim() === '') return;
      const n = robot.joints.length;
      const updated: ProgramPoint =
        i < n
          ? { ...point, joints: point.joints.map((v, k) => (k === i ? value : v)) }
          : i === n
            ? { ...point, gripper: value }
            : { ...point, speed: value };
      editor.update(selected, updated);
    });
    return input;
  });
  const legend = document.createElement('legend');
  form.prepend(legend);

  // ---- Presentación ----
  const render = (): void => {
    const { runner } = emulator;
    const points = editor.points;
    const idle = runner.state === 'idle';
    if (selected >= points.length) selected = points.length - 1;
    const hasPoint = idle && selected >= 0;

    const fileName = emulator.name ?? `${defaultProgramName().replace(/\.txt$/, '')} (nuevo)`;
    name.textContent = `${fileName}${editor.dirty ? ' • sin guardar' : ''} · ${points.length} puntos`;
    const inverted = emulator.settings.gripperInverted;
    gripperMode.className = `modo-pinza${inverted ? ' invertida' : ''}`;
    gripperMode.textContent = inverted
      ? 'Pinza invertida: 0 % = cerrada, 100 % = abierta'
      : 'Pinza normal: 0 % = abierta, 100 % = cerrada';

    for (const b of [create, open, exportButton]) b.disabled = !idle;
    examples.disabled = !idle;
    exportButton.disabled = !idle || points.length === 0;
    play.disabled = !emulator.runnable || runner.state === 'running';
    pause.disabled = runner.state !== 'running';
    stop.disabled = idle;
    step.disabled = !emulator.runnable || runner.state === 'running';
    teach.disabled = !idle;
    teachSpeed.disabled = !idle;
    for (const b of [reteach, goTo, duplicate, remove]) b.disabled = !hasPoint;
    up.disabled = !hasPoint || selected === 0;
    down.disabled = !hasPoint || selected === points.length - 1;
    undo.disabled = !idle || !editor.canUndo;
    redo.disabled = !idle || !editor.canRedo;

    const current = runner.index >= 0 ? ` · punto ${runner.index + 1} de ${points.length}` : '';
    status.textContent =
      editor.errors.length > 0 && idle
        ? 'Corrige los errores para ejecutar el programa'
        : `${STATES[runner.state]}${current}`;

    const messages = [...importErrors, ...editor.errors.map((e) => e.message)];
    errors.replaceChildren(
      ...messages.map((m) => {
        const li = document.createElement('li');
        li.textContent = m;
        return li;
      }),
    );

    const errorLines = new Set(editor.errors.map((e) => e.line));
    list.replaceChildren(
      ...points.map((point, i) => {
        const li = document.createElement('li');
        li.textContent = [...point.joints, point.gripper, point.speed].map(formatValue).join(' ');
        li.classList.toggle('actual', i === runner.index && !idle);
        li.classList.toggle('seleccionado', i === selected);
        li.classList.toggle('con-error', errorLines.has(i + 1));
        li.setAttribute('aria-selected', String(i === selected));
        li.addEventListener('click', () => {
          if (emulator.runner.state === 'idle') select(i);
        });
        return li;
      }),
    );
    if (points.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'vacio';
      empty.textContent = 'Sin puntos: mueve el robot y pulsa "+ Enseñar".';
      list.append(empty);
    }
    list.querySelector(idle ? '.seleccionado' : '.actual')?.scrollIntoView({ block: 'nearest' });

    const point = points[selected];
    form.hidden = !point;
    form.disabled = !hasPoint;
    legend.textContent = `Punto ${selected + 1}`;
    if (point) {
      const values = [...point.joints, point.gripper, point.speed];
      fields.forEach((input, i) => {
        if (document.activeElement !== input) input.value = formatValue(values[i] as number);
      });
    }
  };

  emulator.subscribe(render);
  render();
}
