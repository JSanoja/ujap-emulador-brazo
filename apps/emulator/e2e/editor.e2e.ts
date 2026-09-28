/**
 * Prueba E2E de aceptación de C4: un programa hecho desde cero, exportado, reimportado,
 * editado y vuelto a exportar se reproduce igual que en el editor. También cubre el aviso
 * de cambios sin guardar (diálogo propio), la validación en vivo y la vista de teléfono.
 *
 * La ejecuta `e2e/run.ts` con el Node de Windows.
 * Uso directo: node editor.e2e.ts <url> [carpeta de capturas]
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

interface Point {
  readonly joints: readonly number[];
  readonly gripper: number;
  readonly speed: number;
}

interface TestWindow {
  EMULATOR: {
    editor: { points: Point[]; dirty: boolean };
    runner: { state: string };
    planner: { isAtTarget(): boolean; toPoint(speed: number): Point };
  };
}

const [url = 'http://localhost:4180/?e2e', captures] = process.argv.slice(2);
const failures: string[] = [];
const logs: string[] = [];
const check = (ok: boolean, message: string): void => {
  if (!ok) failures.push(message);
};

const points = (page: Page): Promise<Point[]> =>
  page.evaluate(() => (window as unknown as TestWindow).EMULATOR.editor.points);

/** Como `serializeProgram` del núcleo con 1 decimal y CRLF. */
const serialize = (list: readonly Point[]): string =>
  list
    .map((p) =>
      [...p.joints, p.gripper, p.speed]
        .map((v) => String(Number(`${Math.round(Number(`${v}e1`))}e-1`) || 0))
        .join(' '),
    )
    .map((line) => `${line}\r\n`)
    .join('');

async function jog(page: Page, sliders: Record<string, number>): Promise<void> {
  await page.evaluate((values) => {
    for (const [id, value] of Object.entries(values)) {
      const input = document.getElementById(id) as HTMLInputElement;
      input.value = String(value);
      input.dispatchEvent(new Event('input'));
    }
  }, sliders);
  await page.waitForFunction(() => (window as unknown as TestWindow).EMULATOR.planner.isAtTarget());
}

async function exportProgram(page: Page): Promise<{ name: string; text: string; path: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[title^="Exportar"]'),
  ]);
  // Se guarda con su nombre para que al reimportarlo la app muestre ese nombre.
  const name = download.suggestedFilename();
  const path = join(mkdtempSync(join(tmpdir(), 'emulador-e2e-')), name);
  await download.saveAs(path);
  return { name, text: readFileSync(path, 'utf8'), path };
}

/**
 * Espera a que la app cargue y a que la escena esté lista: Babylon compila los shaders de
 * forma asíncrona y no dibuja una malla hasta que su material está listo.
 */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { EMULATOR?: unknown; BABYLON_SCENE?: { isReady(): boolean } };
      return w.EMULATOR !== undefined && (w.BABYLON_SCENE?.isReady() ?? false);
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(300);
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const shot = async (target: Page, name: string): Promise<void> => {
    if (captures) await target.screenshot({ path: `${captures}\\app2-c4-${name}.png` });
  };

  await page.goto(url);
  await ready(page);

  // 1. Programa desde cero con "Enseñar" (teach).
  await page.click('button[title="Crear un programa vacío"]');
  check((await points(page)).length === 0, 'El programa nuevo no está vacío.');
  await jog(page, { 'eje-A1': 40, 'eje-A2': 35 });
  await page.click('button[title^="Agregar la pose actual"]');
  await page.fill('#velocidad-nuevos', '70');
  await jog(page, { 'eje-A1': 60, 'eje-A3': 70, 'eje-pinza': 30 });
  await page.click('button[title^="Agregar la pose actual"]');
  await jog(page, { 'eje-A4': 70, 'eje-A5': 60 });
  await page.click('button[title^="Agregar la pose actual"]');
  const taught = await points(page);
  check(taught.length === 3, `Se esperaban 3 puntos enseñados; hay ${taught.length}.`);
  check(
    taught[0]?.speed === 50 && taught[1]?.speed === 70,
    'La velocidad de los puntos enseñados no es la indicada.',
  );
  check(Math.abs((taught[0]?.joints[0] ?? 0) - 40) < 0.11, 'El punto 1 no tiene A1 = 40 %.');

  // 2. Exportar: nombre sugerido y contenido.
  const first = await exportProgram(page);
  check(
    /^programa-\d{8}-\d{4}\.txt$/.test(first.name),
    `Nombre exportado inesperado: ${first.name}.`,
  );
  check(
    first.text === serialize(taught),
    'El TXT exportado no coincide con los puntos del editor.',
  );
  check(
    !(await page.evaluate(() => (window as unknown as TestWindow).EMULATOR.editor.dirty)),
    'Tras exportar sigue marcado "sin guardar".',
  );

  // 3. Reimportar el archivo exportado.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('button[title="Abrir un programa TXT"]'),
  ]);
  await chooser.setFiles(first.path);
  await page.waitForTimeout(300);
  check(
    JSON.stringify(await points(page)) === JSON.stringify(taught),
    'El programa reimportado no es igual al exportado.',
  );

  // 4. Editar: velocidad del punto 2, duplicarlo, borrar el punto 1.
  await page.click('.puntos li:nth-child(2)');
  await page.fill('#punto-valor-6', '25');
  await page.press('#punto-valor-6', 'Enter');
  await page.click('button[title="Duplicar el punto seleccionado"]');
  await page.click('.puntos li:nth-child(1)');
  await page.click('button[title="Borrar el punto seleccionado"]');
  const edited = await points(page);
  check(
    edited.length === 3 && edited[0]?.speed === 25 && edited[1]?.speed === 25,
    'La edición (velocidad, duplicar, borrar) no dio el resultado esperado.',
  );
  await shot(page, 'editor');

  // 5. Cambios sin guardar: "Nuevo" muestra el diálogo propio; Cancelar conserva el programa.
  await page.click('button[title="Crear un programa vacío"]');
  await page.waitForSelector('dialog.dialogo[open]');
  await shot(page, 'dialogo');
  await page.click('dialog.dialogo button[data-action="cancel"]');
  check((await points(page)).length === 3, 'Cancelar en el diálogo no conservó el programa.');

  // 6. Validación en vivo: A1 = 120 en el punto 1 da el mismo mensaje que al importar.
  await page.click('.puntos li:nth-child(1)');
  await page.fill('#punto-valor-0', '120');
  await page.press('#punto-valor-0', 'Enter');
  const errorText = await page.textContent('.errores');
  check(
    errorText?.includes('Línea 1: la articulación A1 vale 120; debe estar entre 0 y 100.') ?? false,
    'No se mostró el error de rango en vivo.',
  );
  check(await page.isDisabled('button[title^="Reproducir"]'), 'Con errores se puede reproducir.');
  await page.click('button[title="Deshacer"]');
  check((await page.textContent('.errores'))?.trim() === '', 'Deshacer no quitó el error.');

  // 7. Exportar de nuevo, reimportar y reproducir: termina en el último punto.
  const second = await exportProgram(page);
  check(second.text === serialize(edited), 'El segundo TXT no coincide con el programa editado.');
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('button[title="Abrir un programa TXT"]'),
  ]);
  await chooser2.setFiles(second.path);
  await page.waitForTimeout(300);
  await page.click('.puntos li:nth-child(1)');
  await page.click('button[title^="Reproducir"]');
  await page.waitForFunction(
    () => (window as unknown as TestWindow).EMULATOR.runner.state === 'idle',
    null,
    { timeout: 60_000 },
  );
  const final = await page.evaluate(() =>
    (window as unknown as TestWindow).EMULATOR.planner.toPoint(0),
  );
  const last = edited[edited.length - 1] as Point;
  const deviation = Math.max(
    ...[...final.joints, final.gripper].map((v, i) =>
      Math.abs(v - ([...last.joints, last.gripper][i] as number)),
    ),
  );
  check(
    deviation < 1e-6,
    `Al reproducir, el robot terminó a ${deviation.toFixed(4)} % del último punto.`,
  );

  // 8. Teléfono: pestañas; un panel a la vez.
  await page.close();
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(url);
  await ready(phone);
  check(
    (await phone.isVisible('#programa')) && !(await phone.isVisible('#ejes')),
    'En el teléfono no se muestra solo el panel de programa.',
  );
  await shot(phone, 'movil-programa');
  await phone.click('#pestanas button[data-tab="ejes"]');
  check(
    (await phone.isVisible('#ejes')) && !(await phone.isVisible('#programa')),
    'La pestaña Ejes no cambia el panel.',
  );
  await shot(phone, 'movil-ejes');

  check(logs.length === 0, `La consola tiene errores o advertencias:\n  ${logs.join('\n  ')}`);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`✖ ${failures.length} fallo(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('✓ Editor: desde cero → exportar → reimportar → editar → exportar → reproducir.');
