import { PrismaClient } from '@prisma/client';
import { seedDemoBusiness } from '../src/lib/seed/demo-business';
import { ensureDemoOwnerAuthUser, seedDemoOwnerMembership, getDemoOwnerCredentials } from '../src/lib/seed/demo-owner';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const seed = await seedDemoBusiness(prisma);
  const owner = await ensureDemoOwnerAuthUser();
  await seedDemoOwnerMembership(prisma, seed.business.id, owner.userId);
  const { password } = getDemoOwnerCredentials();

  console.log(`Negocio demo creado: ${seed.business.name} (${seed.business.slug})`);
  console.log(`Dueño demo del panel: ${owner.email} / ${password}`);
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
