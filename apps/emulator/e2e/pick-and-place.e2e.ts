/**
 * Prueba E2E del pick and place (C3, C7) con Chrome (Playwright): carga el ejemplo, lo
 * reproduce y verifica que la pieza termine en la zona B sin caerse en el trayecto. Se hace
 * con la pinza normal y, con "Invertir pinza" activada, con el ejemplo equivalente.
 *
 * La ejecuta `e2e/run.ts` con el Node de Windows.
 * Uso directo: node pick-and-place.e2e.ts <url> [carpeta de capturas]
 */
import { chromium, type Page } from 'playwright-core';

interface TestWindow {
  EMULATOR: { runner: { state: string; index: number; program: unknown[] } };
  WORKCELL: { holding: boolean; resetPiece(): void };
  BABYLON_SCENE?: {
    isReady(): boolean;
    getMeshByName(name: string): { getAbsolutePosition(): { x: number; y: number; z: number } };
  };
}

const [url = 'http://localhost:4180/?e2e', captures] = process.argv.slice(2);
const ZONE_B = { x: -0.28, z: 0.28 };
const TOLERANCE = 0.01; // m
const TIMEOUT_MS = 90_000;

const failures: string[] = [];
const logs: string[] = [];

/**
 * Reproduce un ejemplo y verifica el resultado. `shots` asocia índices de punto con nombres
 * de captura (solo se toman si se pidió la carpeta de capturas).
 */
async function cycle(
  page: Page,
  file: string,
  label: string,
  shots: Record<number, string> = {},
): Promise<void> {
  await page.evaluate(() => (window as unknown as TestWindow).WORKCELL.resetPiece());
  await page.selectOption('#programa select', `examples/${file}`);
  await page.waitForFunction(
    () => (window as unknown as TestWindow).EMULATOR.runner.program.length === 10,
  );
  const start = Date.now();
  await page.click('button[title^="Reproducir"]');

  // Se sigue la ejecución y se registra en qué puntos la pieza está tomada.
  const holdingAt = new Set<number>();
  const pending = { ...shots };
  let state = 'running';
  while (Date.now() - start < TIMEOUT_MS) {
    const s = await page.evaluate(() => {
      const w = window as unknown as TestWindow;
      return {
        state: w.EMULATOR.runner.state,
        index: w.EMULATOR.runner.index,
        holding: w.WORKCELL.holding,
      };
    });
    state = s.state;
    if (s.holding) holdingAt.add(s.index);
    const name = pending[s.index];
    if (name && captures) {
      delete pending[s.index];
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${captures}\\${name}.png` });
    }
    if (state === 'idle') break;
    await page.waitForTimeout(50);
  }
  const elapsed = (Date.now() - start) / 1000;
  await page.waitForTimeout(800);

  const piece = await page.evaluate(() => {
    const scene = (window as unknown as TestWindow).BABYLON_SCENE;
    const p = scene?.getMeshByName('pieza').getAbsolutePosition();
    return { x: p?.x ?? NaN, y: p?.y ?? NaN, z: p?.z ?? NaN };
  });
  const offset = Math.hypot(piece.x - ZONE_B.x, piece.z - ZONE_B.z);

  if (state !== 'idle')
    failures.push(`${label}: el programa no terminó en ${TIMEOUT_MS / 1000} s.`);
  if (![3, 4, 5, 6].every((i) => holdingAt.has(i))) {
    failures.push(
      `${label}: la pieza debía ir tomada en los puntos 4 a 7; lo estuvo en: ${[...holdingAt].map((i) => i + 1).join(', ') || 'ninguno'}.`,
    );
  }
  if (offset > TOLERANCE)
    failures.push(`${label}: la pieza quedó a ${(offset * 1000).toFixed(1)} mm de la zona B.`);
  if (Math.abs(piece.y - 0.02) > 0.001) {
    failures.push(`${label}: la pieza no quedó apoyada en la mesa (y = ${piece.y.toFixed(3)} m).`);
  }
  console.log(
    `${label}: ciclo en ${elapsed.toFixed(1)} s; pieza a ${(offset * 1000).toFixed(1)} mm del centro de B.`,
  );
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto(url);
  // La escena está lista cuando se compilaron los shaders (Babylon lo hace de forma asíncrona).
  await page.waitForFunction(
    () => {
      const w = window as unknown as Partial<TestWindow>;
      return w.EMULATOR !== undefined && (w.BABYLON_SCENE?.isReady() ?? false);
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(300);
  if (captures) await page.screenshot({ path: `${captures}\\app2-c3-inicio.png` });

  await cycle(page, 'pick-and-place.txt', 'Pinza normal', {
    3: 'app2-c3-tomando',
    6: 'app2-c3-llevando',
    8: 'app2-c3-soltando',
  });
  if (captures) await page.screenshot({ path: `${captures}\\app2-c3-fin.png` });

  // Con "Invertir pinza" activada, el ejemplo equivalente hace el mismo ciclo.
  await page.click('button[title="Configuración"]');
  await page.check('#config-invertir-pinza');
  await page.click('dialog.configuracion button.primario');
  await cycle(page, 'pick-and-place-pinza-invertida.txt', 'Pinza invertida', {
    6: 'app2-c7-pinza-invertida-llevando',
  });

  if (logs.length > 0)
    failures.push(`La consola tiene errores o advertencias:\n  ${logs.join('\n  ')}`);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`✖ ${failures.length} fallo(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(
  '✓ Pick and place: la pieza pasó de A a B con la pinza normal e invertida; consola limpia.',
);
