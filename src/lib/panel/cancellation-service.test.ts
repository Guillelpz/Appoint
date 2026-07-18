import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from '@/lib/booking/create-appointment';
import { cancelAppointmentFromPanel } from './cancellation-service';
import { FakeEmailSender } from '../../test/fake-email-sender';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z');

async function createTestAppointment(overrides: { customerEmail?: string } = {}) {
  const seed = await seedDemoBusiness(prisma);
  const result = await createAppointment(prisma, {
    businessId: seed.business.id,
    serviceId: seed.services.corteHombre.id,
    employeeId: seed.employees.marta.id,
    start: VALID_START,
    customerName: 'Cliente panel-cancel',
    customerPhone: '+34688000060',
    customerEmail: overrides.customerEmail ?? 'panel-cancel@example.com',
    source: 'WEB',
    ipAddress: '198.51.100.85',
    now: NOW,
  });
  if (!result.ok) {
    throw new Error(`No se pudo crear la cita de prueba: ${result.reason}`);
  }
  return { seed, appointment: result.appointment };
}

describe('cancelAppointmentFromPanel', () => {
  it('cancela la cita y envía el email de "cancelada por el negocio" al cliente', async () => {
    const { seed, appointment } = await createTestAppointment();
    const emailSender = new FakeEmailSender();

    const result = await cancelAppointmentFromPanel(prisma, {
      businessId: seed.business.id,
      appointmentId: appointment.id,
      emailSender,
    });

    expect(result.ok).toBe(true);
    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('CANCELLED');
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('panel-cancel@example.com');
  });

  it('devuelve NOT_FOUND si la cita pertenece a otro negocio (aislamiento multi-tenant)', async () => {
    const { appointment } = await createTestAppointment();
    const otherBusiness = await prisma.business.create({
      data: { slug: 'otro-negocio-panel-cancel', name: 'Otro Negocio', type: 'OTHER' },
    });

    const result = await cancelAppointmentFromPanel(prisma, {
      businessId: otherBusiness.id,
      appointmentId: appointment.id,
      emailSender: new FakeEmailSender(),
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('PENDING');
  });

  it('devuelve NOT_FOUND si la cita ya estaba COMPLETED (no cancelable)', async () => {
    const { seed, appointment } = await createTestAppointment();
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: 'COMPLETED' } });

    const result = await cancelAppointmentFromPanel(prisma, {
      businessId: seed.business.id,
      appointmentId: appointment.id,
      emailSender: new FakeEmailSender(),
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('con dos cancelaciones concurrentes de la misma cita, el email se envía una única vez', async () => {
    const { seed, appointment } = await createTestAppointment({ customerEmail: 'panel-cancel-concurrente@example.com' });
    const emailSender = new FakeEmailSender();

    const [first, second] = await Promise.all([
      cancelAppointmentFromPanel(prisma, { businessId: seed.business.id, appointmentId: appointment.id, emailSender }),
      cancelAppointmentFromPanel(prisma, { businessId: seed.business.id, appointmentId: appointment.id, emailSender }),
    ]);

    expect([first, second].filter((r) => r.ok)).toHaveLength(1);
    expect(emailSender.sent).toHaveLength(1);
  });
});
