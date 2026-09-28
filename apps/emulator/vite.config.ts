import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const WSL_WINDOWS_DRIVE =
  Boolean(process.env['WSL_DISTRO_NAME']) && process.cwd().startsWith('/mnt/');

// En GitHub Pages la base se pasa por línea de comandos: vite build --base=/<repo>/
// Para Capacitor la base debe quedar en './' (archivos locales dentro del APK).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Babylon.js pesa varios MB sin tree-shaking fino.
    chunkSizeWarningLimit: 6000,
  },
  plugins: [
    // PWA: se puede instalar desde el navegador y funciona sin conexión (todo queda en caché).
    // El registro del service worker se hace en main.ts, solo en la web (no dentro del APK).
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Emulador de brazo robótico',
        short_name: 'Emulador brazo',
        description:
          'Emulador programable de brazo robótico inspirado en el LabVolt 5250 (tesis UJAP): programas TXT, editor y pinza.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1b1d22',
        theme_color: '#1b1d22',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,glb,txt}'],
        // El bundle de Babylon.js pesa ≈ 4,5 MB y el modelo ≈ 2,3 MB.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  server: {
    // Permite abrir el servidor de desarrollo desde el teléfono en la misma red.
    host: true,
    // En WSL, los archivos de /mnt/<unidad> no avisan sus cambios (inotify): sin sondeo,
    // Vite sirve módulos viejos y no recarga al editar desde Windows.
    watch: { usePolling: WSL_WINDOWS_DRIVE, interval: 300 },
  },
});
