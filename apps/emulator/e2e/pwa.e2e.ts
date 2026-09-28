/**
 * Prueba E2E de la PWA (C5): el manifiesto es válido, el service worker se registra y, una
 * vez visitada, la app vuelve a cargar sin conexión (robot, modelo y ejemplos desde la caché).
 *
 * La ejecuta `e2e/run.ts` con el Node de Windows.
 * Uso directo: node pwa.e2e.ts <url>
 */
import { chromium } from 'playwright-core';

const [url = 'http://localhost:4180/?e2e'] = process.argv.slice(2);
const failures: string[] = [];
const check = (ok: boolean, message: string): void => {
  if (!ok) failures.push(message);
};

interface TestWindow {
  EMULATOR?: unknown;
  BABYLON_SCENE?: { isReady(): boolean };
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(url);

  // Manifiesto
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    return link ? ((await (await fetch(link.href)).json()) as Record<string, unknown>) : null;
  });
  const icons = (manifest?.['icons'] as { sizes: string; purpose?: string }[] | undefined) ?? [];
  check(manifest?.['display'] === 'standalone', 'El manifiesto no declara display "standalone".');
  check(
    icons.some((i) => i.sizes === '192x192') && icons.some((i) => i.sizes === '512x512'),
    'El manifiesto no tiene íconos de 192 y 512 px.',
  );
  check(
    icons.some((i) => i.purpose === 'maskable'),
    'El manifiesto no tiene un ícono "maskable".',
  );

  // Service worker: se espera a que tome el control y termine de guardar la caché.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(2000);

  // Sin conexión: la app debe cargar igual, con el modelo y un ejemplo.
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(
    () => {
      const w = window as unknown as TestWindow;
      return w.EMULATOR !== undefined && (w.BABYLON_SCENE?.isReady() ?? false);
    },
    null,
    { timeout: 60_000 },
  );
  await page.selectOption('#programa select', 'examples/rangos.txt');
  await page.waitForTimeout(500);
  const errors = await page.textContent('.errores');
  check(!errors?.includes('No se pudo abrir'), `Sin conexión no se abrió el ejemplo: ${errors}`);
  check(
    (await page.textContent('#programa .nota'))?.includes('rangos.txt') ?? false,
    'Sin conexión no se cargó el ejemplo rangos.txt.',
  );
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`✖ ${failures.length} fallo(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('✓ PWA: manifiesto válido, service worker activo y la app funciona sin conexión.');
