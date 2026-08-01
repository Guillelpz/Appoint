import 'dotenv/config';
import { execSync } from 'node:child_process';
import { assertDestinoLocal } from './assert-destino-local';

export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL no está definida en .env. Añádela antes de ejecutar los tests.');
  }
  // src/test/setup.ts hace TRUNCATE de todas las tablas antes de CADA test:
  // esta suite es tan destructiva como la e2e y necesita la misma guardia.
  assertDestinoLocal('TEST_DATABASE_URL', testDatabaseUrl);

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
    stdio: 'inherit',
  });
}
