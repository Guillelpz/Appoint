import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getPublicBusinessBySlug } from './business-lookup';

describe('getPublicBusinessBySlug', () => {
  it('devuelve el negocio con sus servicios y empleados activos', async () => {
    const seed = await seedDemoBusiness(prisma);

    const business = await getPublicBusinessBySlug(prisma, 'salon-aura');

    expect(business).not.toBeNull();
    expect(business?.id).toBe(seed.business.id);
    expect(business?.name).toBe('Salón Aura');
    expect(business?.services.length).toBe(4);
    expect(business?.employees.length).toBe(2);
    expect(business?.maxBookingWindowDays).toBe(30);
    expect(business?.imageUrls).toEqual(seed.business.imageUrls);
    expect(business?.imageUrls.length).toBeGreaterThan(0);
  });

  it('devuelve null si el slug no existe', async () => {
    const business = await getPublicBusinessBySlug(prisma, 'no-existe');
    expect(business).toBeNull();
  });

  it('devuelve null si el negocio está inactivo', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.business.update({ where: { id: seed.business.id }, data: { active: false } });

    const business = await getPublicBusinessBySlug(prisma, 'salon-aura');

    expect(business).toBeNull();
  });

  it('excluye servicios y empleados inactivos', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.service.update({ where: { id: seed.services.coloracion.id }, data: { active: false } });
    await prisma.employee.update({ where: { id: seed.employees.carlos.id }, data: { active: false } });

    const business = await getPublicBusinessBySlug(prisma, 'salon-aura');

    expect(business?.services.some((s) => s.id === seed.services.coloracion.id)).toBe(false);
    expect(business?.employees.some((e) => e.id === seed.employees.carlos.id)).toBe(false);
  });
});
