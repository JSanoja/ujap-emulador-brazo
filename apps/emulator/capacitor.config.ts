import type { CapacitorConfig } from '@capacitor/cli';

// El appId es definitivo una vez publicado el APK; revisarlo en C5.
const config: CapacitorConfig = {
  appId: 'io.github.jsanoja.emulador',
  appName: 'Emulador Brazo UJAP',
  webDir: 'dist',
  // Fondo del WebView antes de pintar el HTML: sin esto se ve blanco al terminar el splash.
  backgroundColor: '#405c81',
  plugins: {
    SystemBars: {
      // index.html usa viewport-fit=cover; avisarlo desde el inicio evita que la cabecera
      // quede bajo la barra de estado mientras carga y luego salte a su lugar.
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
