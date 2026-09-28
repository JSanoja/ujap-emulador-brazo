/**
 * Lanzador de la prueba en dispositivos Android (WSL): ejecuta `device.e2e.ts` con el Node de
 * Windows en cada dispositivo conectado a adb (o en ANDROID_SERIAL). La app ya debe estar
 * instalada (`npm run android`).
 *
 * Uso: npm run e2e:device [-- --capturas]  (con --capturas guarda las imágenes en ../docs/capturas)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const toWindows = (path: string): string => execFileSync('wslpath', ['-w', path]).toString().trim();
const capturesDir = resolve(HERE, '../../../../docs/capturas');
const captures =
  process.argv.includes('--capturas') && existsSync(capturesDir) ? capturesDir : undefined;

const devices = process.env['ANDROID_SERIAL']
  ? [process.env['ANDROID_SERIAL']]
  : execFileSync('adb', ['devices'])
      .toString()
      .split('\n')
      .slice(1)
      .map((line) => line.split('\t'))
      .filter(([, state]) => state?.trim() === 'device')
      .map(([id]) => id as string);
if (devices.length === 0) {
  console.error(
    '✖ No hay dispositivos conectados (adb devices). Conéctalos con adb connect IP:puerto.',
  );
  process.exit(1);
}

let failed = false;
for (const device of devices) {
  console.log(`\n▶ ${device}`);
  const args = [
    toWindows(resolve(HERE, 'device.e2e.ts')),
    'http://localhost:9223',
    device,
    ...(captures ? [toWindows(captures)] : []),
  ];
  const result = spawnSync('cmd.exe', ['/c', 'node', ...args], { cwd: '/mnt/c', stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
