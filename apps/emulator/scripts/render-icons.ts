/**
 * Genera los íconos PNG a partir de assets/icon.svg con Chrome (Playwright):
 * - public/icons/icon-192.png e icon-512.png (PWA; el dibujo está en la zona segura, sirve
 *   como ícono "maskable");
 * - android/.../mipmap-*dpi/ic_launcher.png y ic_launcher_round.png (Android 7, sin íconos
 *   adaptativos; en Android 8+ se usa drawable/ic_launcher_foreground.xml).
 *
 * Uso (desde WSL, en apps/emulator): npm run icons   (ejecuta este archivo con el Node de Windows)
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(resolve(APP, 'assets/icon.svg'), 'utf8');
const RES = resolve(APP, 'android/app/src/main/res');

interface Target {
  readonly file: string;
  readonly size: number;
  readonly shape: 'square' | 'rounded' | 'circle';
}

const targets: Target[] = [
  { file: resolve(APP, 'public/icons/icon-192.png'), size: 192, shape: 'square' },
  { file: resolve(APP, 'public/icons/icon-512.png'), size: 512, shape: 'square' },
];
for (const [density, size] of [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
] as const) {
  targets.push({ file: resolve(RES, `mipmap-${density}/ic_launcher.png`), size, shape: 'rounded' });
  targets.push({
    file: resolve(RES, `mipmap-${density}/ic_launcher_round.png`),
    size,
    shape: 'circle',
  });
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage();
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  for (const t of targets) {
    const radius = t.shape === 'circle' ? '50%' : t.shape === 'rounded' ? '18%' : '0';
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
        `<img src="${src}" width="${t.size}" height="${t.size}" style="display:block;border-radius:${radius}">` +
        `</body></html>`,
    );
    await page.waitForLoadState('load');
    mkdirSync(dirname(t.file), { recursive: true });
    await page.screenshot({ path: t.file, omitBackground: true });
    console.log(`✓ ${t.size}px ${t.shape}: ${t.file}`);
  }
} finally {
  await browser.close();
}
