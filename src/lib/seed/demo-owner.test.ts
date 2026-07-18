import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from './demo-business';
import { seedDemoOwnerMembership, getDemoOwnerCredentials } from './demo-owner';

describe('seedDemoOwnerMembership', () => {
  it('crea un Membership OWNER para el negocio y usuario indicados', async () => {
    const seed = await seedDemoBusiness(prisma);

    await seedDemoOwnerMembership(prisma, seed.business.id, 'user-demo-owner');

    const membership = await prisma.membership.findFirst({
      where: { userId: 'user-demo-owner', businessId: seed.business.id },
    });
    expect(membership?.role).toBe('OWNER');
  });

  it('es idempotente: llamarlo dos veces no crea Memberships duplicados', async () => {
    const seed = await seedDemoBusiness(prisma);

    await seedDemoOwnerMembership(prisma, seed.business.id, 'user-demo-owner-2');
    await seedDemoOwnerMembership(prisma, seed.business.id, 'user-demo-owner-2');

    const count = await prisma.membership.count({
      where: { userId: 'user-demo-owner-2', businessId: seed.business.id },
    });
    expect(count).toBe(1);
  });
});

describe('getDemoOwnerCredentials', () => {
  it('devuelve un email y contraseña no vacíos (por defecto o de variables de entorno)', () => {
    const { email, password } = getDemoOwnerCredentials();
    expect(email.length).toBeGreaterThan(0);
    expect(password.length).toBeGreaterThan(0);
  });
});
