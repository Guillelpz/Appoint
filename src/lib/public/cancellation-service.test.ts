import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from '@/lib/booking/create-appointment';
import { cancelPublicAppointment } from './cancellation-service';
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
    customerName: 'Cliente cancelación',
    customerPhone: '+34688000010',
    customerEmail: overrides.customerEmail ?? 'cancelacion@example.com',
    source: 'WEB',
    ipAddress: '198.51.100.80',
    now: NOW,
  });
  if (!result.ok) {
    throw new Error(`No se pudo crear la cita de prueba: ${result.reason}`);
  }
  return { seed, appointment: result.appointment };
}

describe('cancelPublicAppointment', () => {
  it('cancela la cita y envía confirmación al cliente + aviso al negocio', async () => {
    const { seed, appointment } = await createTestAppointment();
    const emailSender = new FakeEmailSender();

    const result = await cancelPublicAppointment(prisma, { token: appointment.cancelToken, emailSender });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('CANCELLED');
    }
    expect(emailSender.sent).toHaveLength(2);
    expect(emailSender.sent.map((m) => m.to).sort()).toEqual(
      ['cancelacion@example.com', seed.business.email].sort()
    );
  });

  it('no reenvía emails si la cita ya estaba cancelada (idempotencia)', async () => {
    const { appointment } = await createTestAppointment({ customerEmail: 'cancelacion-idempotente@example.com' });
    const emailSender = new FakeEmailSender();

    const first = await cancelPublicAppointment(prisma, { token: appointment.cancelToken, emailSender });
    expect(first.ok).toBe(true);
    expect(emailSender.sent).toHaveLength(2);

    const second = await cancelPublicAppointment(prisma, { token: appointment.cancelToken, emailSender });
    expect(second.ok).toBe(true);
    expect(emailSender.sent).toHaveLength(2); // sin cambios: no se reenvía nada
  });

  it('devuelve NOT_FOUND sin enviar nada si el token no existe', async () => {
    const emailSender = new FakeEmailSender();

    const result = await cancelPublicAppointment(prisma, { token: 'token-inexistente', emailSender });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(emailSender.sent).toHaveLength(0);
  });

  it('con dos cancelaciones concurrentes del mismo token (doble click), los emails se envían una única vez', async () => {
    const { appointment } = await createTestAppointment({ customerEmail: 'cancelacion-concurrente@example.com' });
    const emailSender = new FakeEmailSender();

    const [first, second] = await Promise.all([
      cancelPublicAppointment(prisma, { token: appointment.cancelToken, emailSender }),
      cancelPublicAppointment(prisma, { token: appointment.cancelToken, emailSender }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok) expect(first.appointment.status).toBe('CANCELLED');
    if (second.ok) expect(second.appointment.status).toBe('CANCELLED');
    expect(emailSender.sent).toHaveLength(2);
  });
});
