import { PrismaClient } from '@prisma/client';
import { seedDemoBusiness } from '../src/lib/seed/demo-business';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const seed = await seedDemoBusiness(prisma);
  console.log(`Negocio demo creado: ${seed.business.name} (${seed.business.slug})`);
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
