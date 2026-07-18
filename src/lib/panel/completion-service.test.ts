import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { completeAppointmentFromPanel, markNoShowFromPanel } from './completion-service';

async function createConfirmedAppointment() {
  const seed = await seedDemoBusiness(prisma);
  const customer = await prisma.customer.create({
    data: { businessId: seed.business.id, name: 'Cliente completar', phone: '+34688000070', email: 'completar@example.com' },
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
      start: new Date('2026-07-14T08:00:00.000Z'),
      end: new Date('2026-07-14T08:35:00.000Z'),
      status: 'CONFIRMED',
    },
  });
  return { seed, appointment };
}

describe('completeAppointmentFromPanel', () => {
  it('marca la cita como COMPLETED', async () => {
    const { seed, appointment } = await createConfirmedAppointment();

    const result = await completeAppointmentFromPanel(prisma, { businessId: seed.business.id, appointmentId: appointment.id });

    expect(result.ok).toBe(true);
    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('COMPLETED');
  });

  it('devuelve NOT_FOUND si la cita pertenece a otro negocio', async () => {
    const { appointment } = await createConfirmedAppointment();
    const otherBusiness = await prisma.business.create({
      data: { slug: 'otro-negocio-completar', name: 'Otro Negocio', type: 'OTHER' },
    });

    const result = await completeAppointmentFromPanel(prisma, { businessId: otherBusiness.id, appointmentId: appointment.id });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('devuelve NOT_FOUND si la cita está PENDING (solo CONFIRMED puede completarse)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customer = await prisma.customer.create({
      data: { businessId: seed.business.id, name: 'Cliente pendiente', phone: '+34688000071', email: 'pendiente-completar@example.com' },
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
        start: new Date('2026-07-14T08:00:00.000Z'),
        end: new Date('2026-07-14T08:35:00.000Z'),
        status: 'PENDING',
      },
    });

    const result = await completeAppointmentFromPanel(prisma, { businessId: seed.business.id, appointmentId: appointment.id });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('markNoShowFromPanel', () => {
  it('marca la cita como NO_SHOW', async () => {
    const { seed, appointment } = await createConfirmedAppointment();

    const result = await markNoShowFromPanel(prisma, { businessId: seed.business.id, appointmentId: appointment.id });

    expect(result.ok).toBe(true);
    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('NO_SHOW');
  });
});
