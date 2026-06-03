import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.dinexpos.owner',
  appName: 'Plato Owner',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
