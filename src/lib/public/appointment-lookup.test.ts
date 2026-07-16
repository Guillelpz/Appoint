import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from '../booking/create-appointment';
import { getAppointmentByConfirmToken, getAppointmentByCancelToken } from './appointment-lookup';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z');

async function createTestAppointment() {
  const seed = await seedDemoBusiness(prisma);
  const result = await createAppointment(prisma, {
    businessId: seed.business.id,
    serviceId: seed.services.corteHombre.id,
    employeeId: seed.employees.marta.id,
    start: VALID_START,
    customerName: 'Cliente lookup',
    customerPhone: '+34688000001',
    customerEmail: 'lookup@example.com',
    source: 'WEB',
    ipAddress: '198.51.100.50',
    now: NOW,
  });
  if (!result.ok) {
    throw new Error(`No se pudo crear la cita de prueba: ${result.reason}`);
  }
  return { seed, appointment: result.appointment };
}

describe('getAppointmentByConfirmToken', () => {
  it('devuelve el resumen de la cita cuando el token existe', async () => {
    const { seed, appointment } = await createTestAppointment();

    const summary = await getAppointmentByConfirmToken(prisma, appointment.confirmToken);

    expect(summary).not.toBeNull();
    expect(summary?.serviceName).toBe('Corte de hombre');
    expect(summary?.employeeName).toBe('Marta Ruiz');
    expect(summary?.businessName).toBe(seed.business.name);
    expect(summary?.businessSlug).toBe(seed.business.slug);
    expect(summary?.status).toBe('PENDING');
  });

  it('incluye createdAt y emailVerifiedAt (null si aún no se ha confirmado)', async () => {
    const { appointment } = await createTestAppointment();

    const summary = await getAppointmentByConfirmToken(prisma, appointment.confirmToken);

    expect(summary?.createdAt).toBeInstanceOf(Date);
    expect(summary?.emailVerifiedAt).toBeNull();
  });

  it('devuelve null si el token no existe', async () => {
    const summary = await getAppointmentByConfirmToken(prisma, 'token-inexistente');
    expect(summary).toBeNull();
  });
});

describe('getAppointmentByCancelToken', () => {
  it('devuelve el resumen de la cita cuando el token existe', async () => {
    const { appointment } = await createTestAppointment();

    const summary = await getAppointmentByCancelToken(prisma, appointment.cancelToken);

    expect(summary).not.toBeNull();
    expect(summary?.status).toBe('PENDING');
  });

  it('devuelve null si el token no existe', async () => {
    const summary = await getAppointmentByCancelToken(prisma, 'token-inexistente');
    expect(summary).toBeNull();
  });
});
