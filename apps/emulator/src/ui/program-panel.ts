/**
 * Panel de programa: abrir un TXT o un ejemplo, reproducir, pausar, detener y paso a paso.
 * Muestra los puntos (el punto en curso resaltado) y los errores con su número de línea.
 * El editor completo (crear, editar y exportar) es parte de C4.
 */
import { serializeProgram } from '@emulador/core';
import type { Emulator } from '../emulator';

export interface ProgramPanelOptions {
  /** Programas de ejemplo: nombre visible y ruta del TXT (relativa a la app). */
  readonly examples: readonly { readonly label: string; readonly url: string }[];
  /** Devuelve la pieza a la zona A. */
  readonly onResetPiece: () => void;
}

function button(label: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  return b;
}

export function mountProgramPanel(
  container: HTMLElement,
  emulator: Emulator,
  options: ProgramPanelOptions,
): void {
  const title = document.createElement('h2');
  title.textContent = 'Programa';
  const name = document.createElement('p');
  name.className = 'nota';

  // Abrir archivo y ejemplos
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.txt,text/plain';
  fileInput.hidden = true;
  const open = button('Abrir TXT…', 'Abrir un programa TXT');
  open.addEventListener('click', () => fileInput.click());
  const examples = document.createElement('select');
  examples.setAttribute('aria-label', 'Programas de ejemplo');
  examples.append(new Option('Ejemplos…', ''));
  for (const example of options.examples) examples.append(new Option(example.label, example.url));
  const files = document.createElement('div');
  files.className = 'fila';
  files.append(open, examples, fileInput);

  // Controles de ejecución
  const play = button('▶', 'Reproducir (desde el punto seleccionado)');
  const pause = button('⏸', 'Pausar');
  const stop = button('⏹', 'Detener');
  const step = button('⏭', 'Paso a paso: ir al siguiente punto');
  const reset = button('↺ Pieza', 'Devolver la pieza a la zona A');
  const controls = document.createElement('div');
  controls.className = 'fila controles';
  controls.append(play, pause, stop, step, reset);

  const status = document.createElement('p');
  status.className = 'estado';
  status.setAttribute('role', 'status');
  const errors = document.createElement('ul');
  errors.className = 'errores';
  const list = document.createElement('ol');
  list.className = 'puntos';

  container.append(title, name, files, controls, status, errors, list);

  let selected = 0;

  const showErrors = (messages: readonly string[]): void => {
    errors.replaceChildren(
      ...messages.map((m) => {
        const li = document.createElement('li');
        li.textContent = m;
        return li;
      }),
    );
  };

  const load = (text: string, fileName: string): void => {
    const problems = emulator.loadProgram(text, fileName);
    showErrors(
      problems.length > 0 ? [`No se cargó "${fileName}":`, ...problems.map((p) => p.message)] : [],
    );
    selected = 0;
    render();
  };

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) load(await file.text(), file.name);
    fileInput.value = '';
  });
  examples.addEventListener('change', async () => {
    const url = examples.value;
    examples.value = '';
    if (!url) return;
    const response = await fetch(url);
    if (!response.ok) {
      showErrors([`No se pudo abrir el ejemplo (${response.status}).`]);
      return;
    }
    load(await response.text(), url.split('/').pop() ?? url);
  });

  play.addEventListener('click', () => {
    const { runner } = emulator;
    if (runner.program.length === 0) return;
    runner.play(runner.state === 'paused' ? undefined : selected);
  });
  pause.addEventListener('click', () => emulator.runner.pause());
  stop.addEventListener('click', () => emulator.runner.stop());
  step.addEventListener('click', () => emulator.runner.stepForward());
  reset.addEventListener('click', () => options.onResetPiece());

  const STATES = { idle: 'Detenido', running: 'Reproduciendo', paused: 'En pausa' } as const;

  const render = (): void => {
    const { runner, robot } = emulator;
    const points = runner.program;
    name.textContent = emulator.name
      ? `${emulator.name} · ${points.length} puntos · pinza ${robot.gripper.inverted ? 'invertida' : 'normal'}`
      : 'Sin programa. Abre un TXT o un ejemplo.';
    const idle = runner.state === 'idle';
    play.disabled = points.length === 0 || runner.state === 'running';
    pause.disabled = runner.state !== 'running';
    stop.disabled = idle;
    step.disabled = points.length === 0 || runner.state === 'running';
    open.disabled = !idle;
    examples.disabled = !idle;
    const current = runner.index >= 0 ? ` · punto ${runner.index + 1} de ${points.length}` : '';
    status.textContent = `${STATES[runner.state]}${current}`;

    const lines = serializeProgram(points, { lineEnding: '\n', decimals: 2 }).split('\n');
    list.replaceChildren(
      ...points.map((_, i) => {
        const li = document.createElement('li');
        li.textContent = lines[i] ?? '';
        li.classList.toggle('actual', i === runner.index);
        li.classList.toggle('seleccionado', idle && i === selected);
        li.addEventListener('click', () => {
          if (emulator.runner.state !== 'idle') return;
          selected = i;
          render();
        });
        return li;
      }),
    );
    list.querySelector('.actual')?.scrollIntoView({ block: 'nearest' });
  };

  emulator.subscribe(render);
  render();
}
