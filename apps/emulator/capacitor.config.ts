import type { CapacitorConfig } from '@capacitor/cli';

// El appId es definitivo una vez publicado el APK; revisarlo en C5.
const config: CapacitorConfig = {
  appId: 'io.github.jsanoja.emulador',
  appName: 'Emulador Brazo UJAP',
  webDir: 'dist',
};

export default config;
