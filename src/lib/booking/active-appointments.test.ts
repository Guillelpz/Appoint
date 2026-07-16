import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { releaseExpiredPendingSlot } from './active-appointments';

const NOW = new Date('2026-07-14T13:00:00.000Z');
const SLOT_START = new Date('2026-07-14T16:00:00.000Z');

async function createStalePending(overrides: { emailVerifiedAt?: Date } = {}) {
  const seed = await seedDemoBusiness(prisma);
  const customer = await prisma.customer.create({
    data: { businessId: seed.business.id, name: 'Cliente', phone: '+34611000200', email: 'stale@example.com' },
  });
  const appointment = await prisma.appointment.create({
    data: {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      start: SLOT_START,
      end: new Date(SLOT_START.getTime() + 35 * 60 * 1000),
      status: 'PENDING',
      createdAt: new Date(NOW.getTime() - 40 * 60 * 1000), // caducada por tiempo (> 30 min)
      emailVerifiedAt: overrides.emailVerifiedAt ?? null,
    },
  });
  return { seed, appointment };
}

describe('releaseExpiredPendingSlot', () => {
  it('cancela una PENDING caducada por tiempo sin emailVerifiedAt', async () => {
    const { appointment } = await createStalePending();

    await releaseExpiredPendingSlot(prisma, {
      employeeId: appointment.employeeId,
      start: appointment.start,
      now: NOW,
    });

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('CANCELLED');
  });

  it('NO cancela una PENDING caducada por tiempo si tiene emailVerifiedAt fijado', async () => {
    const { appointment } = await createStalePending({ emailVerifiedAt: new Date(NOW.getTime() - 35 * 60 * 1000) });

    await releaseExpiredPendingSlot(prisma, {
      employeeId: appointment.employeeId,
      start: appointment.start,
      now: NOW,
    });

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('PENDING');
  });

  it('no toca una PENDING que aún no ha caducado (createdAt reciente)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customer = await prisma.customer.create({
      data: { businessId: seed.business.id, name: 'Cliente reciente', phone: '+34611000201', email: 'reciente@example.com' },
    });
    const appointment = await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: SLOT_START,
        end: new Date(SLOT_START.getTime() + 35 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(NOW.getTime() - 5 * 60 * 1000),
      },
    });

    await releaseExpiredPendingSlot(prisma, {
      employeeId: appointment.employeeId,
      start: appointment.start,
      now: NOW,
    });

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('PENDING');
  });
});
