/**
 * Prueba E2E del ciclo de C3 con Chrome (Playwright): carga el ejemplo pick and place,
 * lo reproduce y verifica que la pieza termine en la zona B y que la consola quede limpia.
 *
 * La ejecuta `e2e/run.ts` con el Node de Windows (ver ese archivo).
 * Uso directo: node pick-and-place.e2e.ts <url> [carpeta de capturas]
 */
import { chromium } from 'playwright-core';

interface Snapshot {
  readonly state: string;
  readonly index: number;
  readonly holding: boolean;
}

const [url = 'http://localhost:4180/', captures] = process.argv.slice(2);
const ZONE_B = { x: -0.28, z: 0.28 };
const TOLERANCE = 0.01; // m
const TIMEOUT_MS = 90_000;

const failures: string[] = [];
const logs: string[] = [];
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
  const shot = async (name: string): Promise<void> => {
    if (captures) await page.screenshot({ path: `${captures}\\app2-c3-${name}.png` });
  };

  await page.goto(url);
  // La escena está lista cuando se compilaron los shaders (Babylon lo hace de forma asíncrona).
  await page.waitForFunction(
    () => {
      const w = window as unknown as { EMULATOR?: unknown; BABYLON_SCENE?: { isReady(): boolean } };
      return w.EMULATOR !== undefined && (w.BABYLON_SCENE?.isReady() ?? false);
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(300);
  await shot('inicio');

  await page.selectOption('#programa select', 'examples/pick-and-place.txt');
  await page.waitForFunction(
    () =>
      (window as unknown as { EMULATOR: { runner: { program: unknown[] } } }).EMULATOR.runner
        .program.length === 10,
  );
  const start = Date.now();
  await page.click('button[title^="Reproducir"]');

  // Se sigue la ejecución y se registra en qué puntos la pieza está tomada.
  const holdingAt = new Set<number>();
  const shots: Record<number, string> = { 3: 'tomando', 6: 'llevando', 8: 'soltando' };
  let last: Snapshot = { state: 'running', index: 0, holding: false };
  while (Date.now() - start < TIMEOUT_MS) {
    last = await page.evaluate(() => {
      const w = window as unknown as {
        EMULATOR: { runner: { state: string; index: number } };
        WORKCELL: { holding: boolean };
      };
      return {
        state: w.EMULATOR.runner.state,
        index: w.EMULATOR.runner.index,
        holding: w.WORKCELL.holding,
      };
    });
    if (last.holding) holdingAt.add(last.index);
    const name = shots[last.index];
    if (name) {
      delete shots[last.index];
      await page.waitForTimeout(250);
      await shot(name);
    }
    if (last.state === 'idle') break;
    await page.waitForTimeout(50);
  }
  const elapsed = (Date.now() - start) / 1000;
  await page.waitForTimeout(800);
  await shot('fin');

  const piece = await page.evaluate(() => {
    const scene = (
      window as unknown as {
        BABYLON_SCENE: {
          getMeshByName(n: string): { getAbsolutePosition(): { x: number; y: number; z: number } };
        };
      }
    ).BABYLON_SCENE;
    const p = scene.getMeshByName('pieza').getAbsolutePosition();
    return { x: p.x, y: p.y, z: p.z };
  });

  if (last.state !== 'idle') failures.push(`El programa no terminó en ${TIMEOUT_MS / 1000} s.`);
  if (![3, 4, 5, 6].every((i) => holdingAt.has(i))) {
    failures.push(
      `La pieza debía ir tomada en los puntos 4 a 7; lo estuvo en: ${[...holdingAt].map((i) => i + 1).join(', ') || 'ninguno'}.`,
    );
  }
  const offset = Math.hypot(piece.x - ZONE_B.x, piece.z - ZONE_B.z);
  if (offset > TOLERANCE)
    failures.push(`La pieza quedó a ${(offset * 1000).toFixed(1)} mm de la zona B.`);
  if (Math.abs(piece.y - 0.02) > 0.001)
    failures.push(`La pieza no quedó apoyada en la mesa (y = ${piece.y.toFixed(3)} m).`);
  if (logs.length > 0)
    failures.push(`La consola tiene errores o advertencias:\n  ${logs.join('\n  ')}`);

  console.log(
    `Ciclo completo en ${elapsed.toFixed(1)} s; pieza a ${(offset * 1000).toFixed(1)} mm del centro de B.`,
  );
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`✖ ${failures.length} fallo(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('✓ Pick and place: la pieza pasó de A a B y la consola quedó limpia.');
