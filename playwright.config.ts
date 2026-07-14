import 'dotenv/config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    // Siempre false: si reutilizara un `pnpm dev` arrancado a mano, ese
    // servidor apuntaría a la BD de desarrollo (DATABASE_URL) y el e2e
    // leería/escribiría datos fuera de appoint_test. Antes de ejecutar
    // `pnpm test:e2e`, asegúrate de que no hay ningún dev server en el
    // puerto 3000 (para el de las verificaciones visuales con Ctrl+C).
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      DIRECT_URL: process.env.TEST_DATABASE_URL ?? '',
    },
  },
});
