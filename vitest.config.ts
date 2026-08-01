import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
    // e2e/ contiene specs de Playwright (test.afterAll de @playwright/test
    // choca con el runner de Vitest si se recogen aquí).
    // .claude/ puede contener worktrees de git anidados: sus copias de los
    // tests son de otra rama y se ejecutarían contra la misma BD appoint_test,
    // duplicando la suite y colando sus specs de Playwright.
    exclude: [...configDefaults.exclude, 'e2e/**', '**/.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
