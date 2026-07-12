import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL no está definida en .env. Añádela antes de ejecutar los tests.');
}

export const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.TEST_DATABASE_URL },
  },
});
