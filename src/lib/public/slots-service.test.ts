import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getAvailableSlotsForBusiness, getDedupedAvailableSlotsForBusiness } from './slots-service';

const NOW = new Date('2026-07-13T08:00:00.000Z');

describe('getAvailableSlotsForBusiness', () => {
  it('devuelve huecos del empleado indicado resolviendo el slug', async () => {
    const seed = await seedDemoBusiness(prisma);

    const slots = await getAvailableSlotsForBusiness(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now: NOW,
    });

    expect(slots.length).toBe(28);
  });

  it('devuelve un array vacío si el slug no existe', async () => {
    const seed = await seedDemoBusiness(prisma);

    const slots = await getAvailableSlotsForBusiness(prisma, {
      slug: 'no-existe',
      serviceId: seed.services.corteHombre.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now: NOW,
    });

    expect(slots).toEqual([]);
  });
});

describe('getDedupedAvailableSlotsForBusiness', () => {
  it('deduplica por start cuando se piden huecos de "cualquier profesional"', async () => {
    const seed = await seedDemoBusiness(prisma);

    const slots = await getDedupedAvailableSlotsForBusiness(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now: NOW,
    });

    const teatime = slots.find((s) => s.start.toISOString() === '2026-07-14T14:00:00.000Z');
    expect(teatime).toBeDefined();
    expect(teatime?.employeeIds.sort()).toEqual([seed.employees.carlos.id, seed.employees.marta.id].sort());

    const startTimes = slots.map((s) => s.start.getTime());
    expect(new Set(startTimes).size).toBe(startTimes.length);
  });
});
