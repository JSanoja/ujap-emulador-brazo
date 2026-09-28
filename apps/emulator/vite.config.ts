import { defineConfig } from 'vite';

const WSL_WINDOWS_DRIVE =
  Boolean(process.env['WSL_DISTRO_NAME']) && process.cwd().startsWith('/mnt/');

// En GitHub Pages la base se pasa por línea de comandos: vite build --base=/<repo>/
// Para Capacitor la base debe quedar en './' (archivos locales dentro del APK).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Babylon.js pesa varios MB sin tree-shaking fino; se optimiza en C1/C5.
    chunkSizeWarningLimit: 6000,
  },
  server: {
    // Permite abrir el servidor de desarrollo desde el teléfono en la misma red.
    host: true,
    // En WSL, los archivos de /mnt/<unidad> no avisan sus cambios (inotify): sin sondeo,
    // Vite sirve módulos viejos y no recarga al editar desde Windows.
    watch: { usePolling: WSL_WINDOWS_DRIVE, interval: 300 },
  },
});
