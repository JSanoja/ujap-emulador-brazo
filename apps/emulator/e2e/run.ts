/**
 * Lanzador de las pruebas E2E: sirve la build con `vite preview` y ejecuta cada prueba.
 *
 * En WSL, Chrome y el Node que lo controla son los de Windows (Windows ve los servidores
 * de WSL en localhost); por eso la prueba se ejecuta con `cmd.exe /c node`. Fuera de WSL,
 * con el Node local y el Chrome instalado.
 *
 * Uso: npm run e2e [-- --capturas]  (con --capturas guarda las imágenes en ../docs/capturas)
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');
const PORT = 4180;
const URL = `http://localhost:${PORT}/?e2e`;
const TESTS = ['pick-and-place.e2e.ts', 'editor.e2e.ts', 'settings.e2e.ts'];
const WSL = Boolean(process.env['WSL_DISTRO_NAME']);

const toWindows = (path: string): string => execFileSync('wslpath', ['-w', path]).toString().trim();

const capturesDir = resolve(APP, '../../../docs/capturas');
const captures =
  process.argv.includes('--capturas') && existsSync(capturesDir) ? capturesDir : undefined;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: APP,
  stdio: 'ignore',
});

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {
      // todavía no responde
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`El servidor de vista previa no respondió en ${URL}.`);
}

let failed = false;
try {
  await waitForServer();
  for (const test of TESTS) {
    const file = resolve(HERE, test);
    const args = [file, URL, ...(captures ? [captures] : [])];
    console.log(`\n▶ ${test}`);
    const result = WSL
      ? spawnSync(
          'cmd.exe',
          ['/c', 'node', ...args.map((a) => (a.startsWith('/') ? toWindows(a) : a))],
          {
            cwd: '/mnt/c',
            stdio: 'inherit',
          },
        )
      : spawnSync(process.execPath, args, { stdio: 'inherit' });
    if (result.status !== 0) failed = true;
  }
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);
