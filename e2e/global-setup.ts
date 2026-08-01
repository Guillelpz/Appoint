import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { seedDemoBusiness } from '../src/lib/seed/demo-business';
import { ensureDemoOwnerAuthUser, seedDemoOwnerMembership } from '../src/lib/seed/demo-owner';
import { ensureDemoSuperAdminAuthUser, seedDemoSuperAdminRecord } from '../src/lib/seed/demo-superadmin';
import { assertDestinoLocal } from '../src/test/assert-destino-local';

// Esta suite TRUNCA todas las tablas y da de alta cuentas en Supabase Auth, así
// que solo puede correr contra el stack local: comprobamos los dos destinos
// (base de datos y Auth) antes de tocar nada. Ver assert-destino-local.ts para
// el porqué y para el incidente real que lo motivó.

export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL no está definida en .env. Añádela antes de ejecutar los tests e2e.');
  }
  assertDestinoLocal('TEST_DATABASE_URL', testDatabaseUrl);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL no está definida en .env. Añádela antes de ejecutar los tests e2e.');
  }
  assertDestinoLocal('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl);

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
    stdio: 'inherit',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations';
  `;
  if (tables.length > 0) {
    const quoted = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
  }

  const seed = await seedDemoBusiness(prisma);
  // El usuario de Supabase Auth vive en el schema `auth` (fuera de las
  // tablas `public` que se truncan arriba), así que ensureDemoOwnerAuthUser /
  // ensureDemoSuperAdminAuthUser son idempotentes entre ejecuciones de e2e:
  // reutilizan el mismo usuario. Los registros en `public` (Membership,
  // PlatformAdmin) sí se truncan cada vez, por eso se vuelven a crear siempre.
  const owner = await ensureDemoOwnerAuthUser();
  await seedDemoOwnerMembership(prisma, seed.business.id, owner.userId);

  const superAdmin = await ensureDemoSuperAdminAuthUser();
  await seedDemoSuperAdminRecord(prisma, superAdmin.userId);

  await prisma.$disconnect();
}
