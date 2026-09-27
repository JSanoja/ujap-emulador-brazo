import { defineConfig } from 'vite';

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
  },
});
