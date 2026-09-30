/**
 * Prueba en un dispositivo Android real (C5, mediciones para V1). Se conecta al WebView de la
 * app por CDP (depuración remota de la build de desarrollo) y:
 * 1. recarga la app y mide el tiempo hasta que la escena está lista;
 * 2. mide los FPS en reposo y durante el pick and place, y verifica que la pieza llegue a B;
 * 3. exporta un TXT y verifica que quede en Documentos/Emulador Brazo UJAP/;
 * 4. activa "Invertir pinza", reinicia la app y verifica que la opción se conserve.
 *
 * La ejecuta `e2e/device.ts` (WSL) con el Node de Windows. Las capturas de pantalla se toman
 * con `adb screencap` (a través de wsl.exe), porque la captura por CDP no incluye el WebGL.
 * Uso directo: node device.e2e.ts <url CDP> <serial adb> [carpeta de capturas]
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';

interface TestWindow {
  EMULATOR: {
    runner: { state: string; index: number; program: unknown[] };
    settings: { gripperInverted: boolean };
  };
  BABYLON_SCENE: {
    isReady(): boolean;
    getEngine(): {
      getFps(): number;
      getRenderWidth(): number;
      getRenderHeight(): number;
      getGlInfo(): { renderer: string };
    };
    getMeshByName(name: string): { getAbsolutePosition(): { x: number; z: number } };
  };
}

const [cdpUrl = 'http://localhost:9223', serial = '', captures] = process.argv.slice(2);
const APP_ID = 'io.github.jsanoja.emulador';
const ZONE_B = { x: -0.28, z: 0.28 };
const failures: string[] = [];
const logs: string[] = [];
const check = (ok: boolean, message: string): void => {
  if (!ok) failures.push(message);
};

/** adb de WSL, llamado desde el Node de Windows. */
function adb(...args: string[]): Buffer {
  const result = spawnSync('wsl.exe', ['adb', '-s', serial, ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.stdout;
}

const model = adb('shell', 'getprop', 'ro.product.model').toString().trim() || 'dispositivo';
const screenshot = (name: string): void => {
  if (captures)
    writeFileSync(`${captures}\\app2-c5-${model}-${name}.png`, adb('exec-out', 'screencap', '-p'));
};

async function connect(): Promise<{ page: Page; close: () => Promise<void> }> {
  // Se reenvía el socket de depuración del proceso actual de la app.
  const pid = adb('shell', 'pidof', APP_ID).toString().trim();
  spawnSync('wsl.exe', [
    'adb',
    '-s',
    serial,
    'forward',
    'tcp:9223',
    `localabstract:webview_devtools_remote_${pid}`,
  ]);
  // WSL tarda un momento en exponer a Windows el puerto recién reenviado: se reintenta.
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  for (let attempt = 1; !browser; attempt++) {
    try {
      browser = await chromium.connectOverCDP(cdpUrl);
    } catch (error) {
      if (attempt >= 10) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) throw new Error('No se encontró la página del WebView.');
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  return { page, close: () => browser.close() };
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as Partial<TestWindow>;
      return w.EMULATOR !== undefined && (w.BABYLON_SCENE?.isReady() ?? false);
    },
    null,
    { timeout: 60_000 },
  );
}

const fps = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as TestWindow).BABYLON_SCENE.getEngine().getFps());

async function resetSettings(page: Page): Promise<void> {
  await page.click('button[title="Configuración"]');
  await page.click('dialog.configuracion button:text("Restablecer")');
  await page.click('dialog.configuracion button.primario');
}

function restartApp(): void {
  adb('shell', 'am', 'force-stop', APP_ID);
  adb('shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`);
  spawnSync('powershell.exe', ['-Command', 'Start-Sleep -Seconds 5']);
}

const results: Record<string, unknown> = { dispositivo: model };
restartApp();
let { page, close } = await connect();
try {
  // 1. Carga
  const start = Date.now();
  await page.goto('https://localhost/?e2e');
  await waitReady(page);
  results['cargaMs'] = Date.now() - start;
  // La prueba parte de la configuración por defecto (la app la conserva entre ejecuciones).
  await resetSettings(page);
  await page.waitForTimeout(1500);
  results['fpsReposo'] = Math.round(await fps(page));
  Object.assign(
    results,
    await page.evaluate(() => {
      const engine = (window as unknown as TestWindow).BABYLON_SCENE.getEngine();
      return {
        pantallaCss: `${innerWidth}×${innerHeight} @${devicePixelRatio}`,
        render: `${engine.getRenderWidth()}×${engine.getRenderHeight()}`,
        gpu: engine.getGlInfo().renderer,
      };
    }),
  );
  screenshot('inicio');

  // 2. Pick and place con medición de FPS
  await page.selectOption('#programa select', 'examples/pick-and-place.txt');
  await page.waitForFunction(
    () => (window as unknown as TestWindow).EMULATOR.runner.program.length === 10,
  );
  await page.click('button[title^="Reproducir"]');
  const samples: number[] = [];
  const cycleStart = Date.now();
  let shot = false;
  while (Date.now() - cycleStart < 60_000) {
    const s = await page.evaluate(() => {
      const w = window as unknown as TestWindow;
      return {
        state: w.EMULATOR.runner.state,
        index: w.EMULATOR.runner.index,
        fps: w.BABYLON_SCENE.getEngine().getFps(),
      };
    });
    samples.push(s.fps);
    if (s.index === 5 && !shot) {
      screenshot('llevando');
      shot = true;
    }
    if (s.state === 'idle') break;
    await page.waitForTimeout(250);
  }
  results['cicloS'] = Number(((Date.now() - cycleStart) / 1000).toFixed(1));
  results['fpsPromedio'] = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  results['fpsMinimo'] = Math.round(Math.min(...samples));
  await page.waitForTimeout(800);
  const piece = await page.evaluate(() => {
    const p = (window as unknown as TestWindow).BABYLON_SCENE.getMeshByName(
      'pieza',
    ).getAbsolutePosition();
    return { x: p.x, z: p.z };
  });
  const offset = Math.hypot(piece.x - ZONE_B.x, piece.z - ZONE_B.z);
  results['piezaAMmDeB'] = Number((offset * 1000).toFixed(1));
  check(offset < 0.01, `La pieza quedó a ${(offset * 1000).toFixed(1)} mm de la zona B.`);
  screenshot('fin');

  // 3. Exportar a Documentos
  await page.click('button[title^="Exportar"]');
  await page.waitForSelector('dialog.dialogo[open]', { timeout: 15_000 });
  const message = (await page.textContent('dialog.dialogo[open]')) ?? '';
  await page.click('dialog.dialogo[open] button.primario');
  const saved = adb(
    'shell',
    'ls',
    "'/sdcard/Documents/Emulador Brazo UJAP/pick-and-place.txt'",
  ).toString();
  check(
    message.includes('Se guardó en Documentos/Emulador Brazo UJAP/pick-and-place.txt'),
    `Diálogo inesperado al exportar: ${message}`,
  );
  check(
    saved.includes('pick-and-place.txt'),
    'El TXT exportado no está en Documentos/Emulador Brazo UJAP/.',
  );

  // 4. La configuración se conserva al reiniciar la app
  await page.click('button[title="Configuración"]');
  await page.check('#config-invertir-pinza');
  await page.click('dialog.configuracion button.primario');
  await close();
  restartApp();
  ({ page, close } = await connect());
  if (!page.url().includes('e2e')) await page.goto('https://localhost/?e2e');
  await waitReady(page);
  const kept = await page.evaluate(
    () => (window as unknown as TestWindow).EMULATOR.settings.gripperInverted,
  );
  check(kept, '"Invertir pinza" no se conservó al reiniciar la app.');
  // Se deja la configuración por defecto.
  await resetSettings(page);

  check(logs.length === 0, `La consola tiene errores o advertencias:\n  ${logs.join('\n  ')}`);
} finally {
  await close();
}

console.log(JSON.stringify(results, null, 2));
if (failures.length > 0) {
  console.error(`✖ ${failures.length} fallo(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `✓ ${model}: carga, rendimiento, pick and place, exportar y configuración persistente.`,
);
