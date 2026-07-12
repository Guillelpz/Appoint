import { describe, it, expect } from 'vitest';
import { prisma } from './prisma-client';

describe('entorno de test', () => {
  it('conecta con la base de datos de test y persiste un registro', async () => {
    const business = await prisma.business.create({
      data: {
        slug: 'smoke-test',
        name: 'Negocio de prueba',
      },
    });

    const found = await prisma.business.findUnique({ where: { id: business.id } });
    expect(found?.slug).toBe('smoke-test');
  });

  it('limpia las tablas entre tests (no debería ver el negocio del test anterior)', async () => {
    const count = await prisma.business.count();
    expect(count).toBe(0);
  });
});
