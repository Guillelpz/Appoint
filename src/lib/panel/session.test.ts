import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getOwnerBusinessIdForUser, isBusinessActive } from './session';

describe('getOwnerBusinessIdForUser', () => {
  it('devuelve el businessId cuando el usuario tiene un Membership OWNER', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.membership.create({
      data: { userId: 'user-owner-1', businessId: seed.business.id, role: 'OWNER' },
    });

    const businessId = await getOwnerBusinessIdForUser(prisma, 'user-owner-1');

    expect(businessId).toBe(seed.business.id);
  });

  it('devuelve null si el usuario no tiene ningún Membership', async () => {
    const businessId = await getOwnerBusinessIdForUser(prisma, 'user-sin-membership');
    expect(businessId).toBeNull();
  });

  it('devuelve null si el usuario solo tiene un Membership STAFF (fuera de alcance en esta fase)', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.membership.create({
      data: { userId: 'user-staff-1', businessId: seed.business.id, role: 'STAFF' },
    });

    const businessId = await getOwnerBusinessIdForUser(prisma, 'user-staff-1');

    expect(businessId).toBeNull();
  });

  it('devuelve el negocio correcto si el usuario tiene memberships en varios negocios', async () => {
    const seedA = await seedDemoBusiness(prisma);
    const seedB = await prisma.business.create({
      data: { slug: 'otro-negocio-sesion', name: 'Otro Negocio', type: 'OTHER' },
    });
    await prisma.membership.create({ data: { userId: 'user-multi', businessId: seedA.business.id, role: 'STAFF' } });
    await prisma.membership.create({ data: { userId: 'user-multi', businessId: seedB.id, role: 'OWNER' } });

    const businessId = await getOwnerBusinessIdForUser(prisma, 'user-multi');

    expect(businessId).toBe(seedB.id);
  });
});

describe('isBusinessActive', () => {
  it('devuelve true si el negocio está activo', async () => {
    const seed = await seedDemoBusiness(prisma);

    expect(await isBusinessActive(prisma, seed.business.id)).toBe(true);
  });

  it('devuelve false si el negocio está suspendido', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.business.update({ where: { id: seed.business.id }, data: { active: false } });

    expect(await isBusinessActive(prisma, seed.business.id)).toBe(false);
  });

  it('devuelve false si el negocio no existe', async () => {
    expect(await isBusinessActive(prisma, 'business-inexistente')).toBe(false);
  });
});
