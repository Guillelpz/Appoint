import { PrismaClient } from '@prisma/client';
import { seedDemoBusiness } from '../src/lib/seed/demo-business';
import { ensureDemoOwnerAuthUser, seedDemoOwnerMembership, getDemoOwnerCredentials } from '../src/lib/seed/demo-owner';
import {
  ensureDemoSuperAdminAuthUser,
  seedDemoSuperAdminRecord,
  getDemoSuperAdminCredentials,
} from '../src/lib/seed/demo-superadmin';
import { assertSeedDestinoLocal } from '../src/lib/seed/assert-seed-local';

// Antes de crear el cliente y de tocar nada: el seed solo puede correr contra el
// stack local (ver assert-seed-local.ts y el incidente que lo motivó).
assertSeedDestinoLocal(process.env);

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const seed = await seedDemoBusiness(prisma);
  const owner = await ensureDemoOwnerAuthUser();
  await seedDemoOwnerMembership(prisma, seed.business.id, owner.userId);
  const { password } = getDemoOwnerCredentials();

  const superAdmin = await ensureDemoSuperAdminAuthUser();
  await seedDemoSuperAdminRecord(prisma, superAdmin.userId);
  const { password: superAdminPassword } = getDemoSuperAdminCredentials();

  console.log(`Negocio demo creado: ${seed.business.name} (${seed.business.slug})`);
  console.log(`Dueño demo del panel: ${owner.email} / ${password}`);
  console.log(`Super-admin demo: ${superAdmin.email} / ${superAdminPassword}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
