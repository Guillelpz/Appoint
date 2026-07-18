import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { seedDemoBusiness } from '../src/lib/seed/demo-business';
import { ensureDemoOwnerAuthUser, seedDemoOwnerMembership } from '../src/lib/seed/demo-owner';

export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL no está definida en .env. Añádela antes de ejecutar los tests e2e.');
  }

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
  // tablas `public` que se truncan arriba), así que ensureDemoOwnerAuthUser
  // es idempotente entre ejecuciones de e2e: reutiliza el mismo usuario.
  // El Membership sí vive en `public` y se trunca cada vez, por eso se
  // vuelve a crear siempre.
  const owner = await ensureDemoOwnerAuthUser();
  await seedDemoOwnerMembership(prisma, seed.business.id, owner.userId);

  await prisma.$disconnect();
}
