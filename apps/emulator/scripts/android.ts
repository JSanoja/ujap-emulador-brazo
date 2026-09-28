/**
 * Compila el APK de depuración y lo instala en los dispositivos conectados por adb.
 *
 * Uso (desde WSL): npm run android            → compila, instala en todos y abre la app
 *                  npm run android -- --no-install   → solo compila
 *
 * Pasos: vite build → cap sync android → gradlew assembleDebug → adb install → abrir la app.
 *
 * Entorno (WSL + Windows, ver CLAUDE.md):
 * - Gradle corre con el Node/cmd de Windows y el SDK de Windows (android/local.properties),
 *   porque el SDK instalado por Android Studio tiene binarios de Windows.
 * - ANDROID_JAVA_HOME: JDK 21 de Windows (por defecto E:\Programas\jdk-21). Gradle 8.14 no
 *   corre con el JDK 25 que trae Android Studio.
 * - ANDROID_SERIAL: si se define, instala solo en ese dispositivo (IP:puerto de adb).
 * - adb es el de WSL; los dispositivos se conectan por Wi-Fi con `adb pair` / `adb connect`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = resolve(APP, 'android');
const APK = resolve(ANDROID, 'app/build/outputs/apk/debug/app-debug.apk');
const APP_ID = 'io.github.jsanoja.emulador';
const JAVA_HOME = process.env['ANDROID_JAVA_HOME'] ?? 'E:\\Programas\\jdk-21';
const install = !process.argv.includes('--no-install');

function run(title: string, command: string, args: string[], cwd = APP, env = process.env): void {
  console.log(`\n▶ ${title}`);
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`✖ Falló: ${title}`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(resolve(ANDROID, 'local.properties'))) {
  console.error(
    '✖ Falta android/local.properties con la ruta del SDK de Windows, por ejemplo:\n' +
      '  sdk.dir=E\\:\\\\androidsdk',
  );
  process.exit(1);
}

run('Compilar la web', 'npx', ['vite', 'build']);
run('Sincronizar con Capacitor', 'npx', ['cap', 'sync', 'android']);
// cmd.exe hereda como directorio de trabajo la carpeta android (D:\...), y JAVA_HOME pasa
// de WSL a Windows con WSLENV.
run(
  'Compilar el APK (Gradle de Windows)',
  'cmd.exe',
  ['/c', 'gradlew.bat', 'assembleDebug', '--console=plain'],
  ANDROID,
  {
    ...process.env,
    JAVA_HOME,
    WSLENV: [process.env['WSLENV'], 'JAVA_HOME/w'].filter(Boolean).join(':'),
  },
);
console.log(`\n✓ APK: ${APK}`);

if (install) {
  const serial = process.env['ANDROID_SERIAL'];
  const devices = serial
    ? [serial]
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
  for (const device of devices) {
    run(`Instalar en ${device}`, 'adb', ['-s', device, 'install', '-r', APK]);
    run(`Abrir en ${device}`, 'adb', [
      '-s',
      device,
      'shell',
      'am',
      'start',
      '-n',
      `${APP_ID}/.MainActivity`,
    ]);
  }
}
