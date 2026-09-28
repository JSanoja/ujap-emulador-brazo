/**
 * Prueba E2E de aceptación de C6 (configuración):
 * - el mismo TXT, con "Invertir pinza" desactivada y activada, mueve la pinza en sentidos opuestos;
 * - la opción se conserva al recargar la página;
 * - exportar/importar la configuración como JSON, restablecer, y decimales/fin de línea al exportar.
 *
 * La ejecuta `e2e/run.ts` con el Node de Windows.
 * Uso directo: node settings.e2e.ts <url> [carpeta de capturas]
 */
import { readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';

interface TestWindow {
  EMULATOR: {
    settings: { gripperInverted: boolean; exportDecimals: number; lineEnding: string };
    runner: { state: string };
    planner: { pose: { gripper: number } };
  };
  BABYLON_SCENE?: { isReady(): boolean };
}

const [url = 'http://localhost:4180/?e2e', captures] = process.argv.slice(2);
const failures: string[] = [];
const logs: string[] = [];
const check = (ok: boolean, message: string): void => {
  if (!ok) failures.push(message);
};

/** Un punto con la pinza al 100 % (el resto en la pose cero). */
const PROGRAM = '50 26.7 58.1 58.3 50 100 100\r\n';

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as Partial<TestWindow>;
      return w.EMULATOR !== undefined && (w.BABYLON_SCENE?.isReady() ?? false);
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(300);
}

const settings = (page: Page): Promise<TestWindow['EMULATOR']['settings']> =>
  page.evaluate(() => (window as unknown as TestWindow).EMULATOR.settings);

/** Abre el TXT de prueba, lo reproduce y devuelve la apertura final de la pinza (mm). */
async function runProgram(page: Page): Promise<number> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('button[title="Abrir un programa TXT"]'),
  ]);
  await chooser.setFiles({
    name: 'pinza-100.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(PROGRAM),
  });
  await page.waitForTimeout(200);
  await page.click('button[title^="Reproducir"]');
  await page.waitForFunction(
    () => (window as unknown as TestWindow).EMULATOR.runner.state === 'idle',
    null,
    { timeout: 30_000 },
  );
  return page.evaluate(() => (window as unknown as TestWindow).EMULATOR.planner.pose.gripper);
}

async function openSettings(page: Page): Promise<void> {
  await page.click('button[title="Configuración"]');
  await page.waitForSelector('dialog.configuracion[open]');
}

async function closeSettings(page: Page): Promise<void> {
  await page.click('dialog.configuracion button.primario');
  await page.waitForSelector('dialog.configuracion', { state: 'detached' });
}

async function download(
  page: Page,
  action: () => Promise<void>,
): Promise<{ name: string; text: string }> {
  const [file] = await Promise.all([page.waitForEvent('download'), action()]);
  return { name: file.suggestedFilename(), text: readFileSync(await file.path(), 'utf8') };
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
  const shot = async (name: string): Promise<void> => {
    if (captures) await page.screenshot({ path: `${captures}\\app2-c6-${name}.png` });
  };

  await page.goto(url);
  await ready(page);
  check(
    !(await settings(page)).gripperInverted,
    'La configuración inicial no es la de por defecto.',
  );

  // 1. Pinza normal: 100 % = cerrada (0 mm).
  const normal = await runProgram(page);
  check(
    normal === 0,
    `Con la pinza normal, 100 % debía cerrar la pinza (0 mm); quedó en ${normal} mm.`,
  );

  // 2. Invertir pinza: el mismo archivo abre la pinza (74 mm).
  await openSettings(page);
  await page.check('#config-invertir-pinza');
  await shot('configuracion');
  await closeSettings(page);
  check(
    (await page.textContent('.modo-pinza'))?.includes('Pinza invertida') ?? false,
    'El indicador no muestra la pinza invertida.',
  );
  const inverted = await runProgram(page);
  check(
    inverted === 74,
    `Con la pinza invertida, 100 % debía abrir la pinza (74 mm); quedó en ${inverted} mm.`,
  );
  await shot('pinza-invertida');

  // 3. La opción se conserva al recargar.
  await page.reload();
  await ready(page);
  check(
    (await settings(page)).gripperInverted,
    'La opción "Invertir pinza" no se conservó al recargar.',
  );

  // 4. Decimales y fin de línea al exportar el TXT.
  await openSettings(page);
  await page.selectOption('#config-decimales', '0');
  await page.selectOption('#config-fin-de-linea', 'LF');
  const json = await download(page, () =>
    page.click('dialog.configuracion button:text("Exportar JSON")'),
  );
  await closeSettings(page);
  const exported = JSON.parse(json.text) as Record<string, unknown>;
  check(
    json.name === 'configuracion-emulador.json' &&
      exported['gripperInverted'] === true &&
      exported['exportDecimals'] === 0 &&
      exported['lineEnding'] === 'LF',
    `El JSON exportado no refleja la configuración: ${json.text}`,
  );
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('button[title="Abrir un programa TXT"]'),
  ]);
  await chooser.setFiles({
    name: 'decimales.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('12.34 50 50 50 50 0 50\r\n'),
  });
  await page.waitForTimeout(200);
  const txt = await download(page, () => page.click('button[title^="Exportar"]'));
  check(
    txt.text === '12 50 50 50 50 0 50\n',
    `El TXT no se exportó con 0 decimales y LF: ${JSON.stringify(txt.text)}`,
  );

  // 5. Restablecer y luego importar el JSON exportado (con un valor inválido agregado).
  await openSettings(page);
  await page.click('dialog.configuracion button:text("Restablecer")');
  const reset = await settings(page);
  check(
    !reset.gripperInverted && reset.exportDecimals === 1 && reset.lineEnding === 'CRLF',
    'Restablecer no volvió a los valores por defecto.',
  );
  const broken = JSON.stringify({ ...exported, exportDecimals: 5 });
  const [jsonChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('dialog.configuracion button:text("Importar JSON")'),
  ]);
  await jsonChooser.setFiles({
    name: 'config.json',
    mimeType: 'application/json',
    buffer: Buffer.from(broken),
  });
  await page.waitForTimeout(300);
  const imported = await settings(page);
  check(
    imported.gripperInverted && imported.lineEnding === 'LF' && imported.exportDecimals === 1,
    'Importar JSON no aplicó los valores válidos.',
  );
  const problems = await page.textContent('dialog.configuracion .errores');
  check(
    problems?.includes('"exportDecimals" vale 5; debe ser 0, 1 o 2. Se usa 1.') ?? false,
    'Importar JSON no informó el valor inválido.',
  );
  await shot('importar-json');
  await closeSettings(page);

  check(logs.length === 0, `La consola tiene errores o advertencias:\n  ${logs.join('\n  ')}`);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`✖ ${failures.length} fallo(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(
  '✓ Configuración: pinza normal/invertida, persistencia, JSON y opciones de exportación.',
);
