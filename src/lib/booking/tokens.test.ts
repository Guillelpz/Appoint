import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from './create-appointment';
import { confirmAppointment, cancelAppointment, isPendingAppointmentExpired } from './tokens';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z');

async function createPendingAppointment(overrides: { createdAt?: Date; manualApproval?: boolean } = {}) {
  const seed = await seedDemoBusiness(prisma);
  if (overrides.manualApproval) {
    await prisma.business.update({ where: { id: seed.business.id }, data: { manualApproval: true } });
  }

  const result = await createAppointment(prisma, {
    businessId: seed.business.id,
    serviceId: seed.services.corteHombre.id,
    employeeId: seed.employees.marta.id,
    start: VALID_START,
    customerName: 'Cliente token',
    customerPhone: '+34677000001',
    customerEmail: 'token@example.com',
    source: 'WEB',
    ipAddress: '198.51.100.20',
    now: NOW,
  });

  if (!result.ok) {
    throw new Error(`No se pudo crear la cita de prueba: ${result.reason}`);
  }

  if (overrides.createdAt) {
    await prisma.appointment.update({
      where: { id: result.appointment.id },
      data: { createdAt: overrides.createdAt },
    });
  }

  return result.appointment;
}

describe('isPendingAppointmentExpired', () => {
  it('es false justo antes de los 30 minutos', () => {
    const createdAt = new Date('2026-07-14T10:00:00.000Z');
    const now = new Date(createdAt.getTime() + 29 * 60 * 1000);
    expect(isPendingAppointmentExpired({ createdAt }, now)).toBe(false);
  });

  it('es true en el instante exacto de los 30 minutos (frontera de caducidad)', () => {
    const createdAt = new Date('2026-07-14T10:00:00.000Z');
    const now = new Date(createdAt.getTime() + 30 * 60 * 1000);
    expect(isPendingAppointmentExpired({ createdAt }, now)).toBe(true);
  });

  it('es true bastante después de los 30 minutos', () => {
    const createdAt = new Date('2026-07-14T10:00:00.000Z');
    const now = new Date(createdAt.getTime() + 60 * 60 * 1000);
    expect(isPendingAppointmentExpired({ createdAt }, now)).toBe(true);
  });
});

describe('confirmAppointment', () => {
  it('sin manualApproval: confirma una cita PENDING dentro de los 30 minutos y la deja CONFIRMED', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW });
    const confirmAt = new Date(NOW.getTime() + 10 * 60 * 1000); // 10 min después

    const result = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('CONFIRMED');
      expect(result.appointment.emailVerifiedAt).not.toBeNull();
      expect(result.pendingApproval).toBe(false);
    }
  });

  it('con manualApproval: confirmar fija emailVerifiedAt pero la cita SIGUE PENDING (pendiente de aprobación del negocio)', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW, manualApproval: true });
    const confirmAt = new Date(NOW.getTime() + 10 * 60 * 1000);

    const result = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('PENDING');
      expect(result.appointment.emailVerifiedAt).not.toBeNull();
      expect(result.pendingApproval).toBe(true);
    }
  });

  it('con manualApproval: reconfirmar 40 minutos después (ya habría caducado) sigue siendo ok (idempotente, no reevalúa la caducidad)', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW, manualApproval: true });

    const first = await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(first.ok).toBe(true);

    const second = await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 40 * 60 * 1000));

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.appointment.status).toBe('PENDING');
      expect(second.pendingApproval).toBe(true);
    }
  });

  it('sin manualApproval: reconfirmar tras ya CONFIRMED (segundo click, aunque hayan pasado más de 30 min) sigue siendo ok (idempotente)', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW });

    const first = await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 5 * 60 * 1000));
    expect(first.ok).toBe(true);

    const second = await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 40 * 60 * 1000));

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.appointment.status).toBe('CONFIRMED');
      expect(second.pendingApproval).toBe(false);
    }
  });

  it('devuelve EXPIRED si han pasado más de 30 minutos desde la creación y nunca se verificó el email', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW });
    const confirmAt = new Date(NOW.getTime() + 31 * 60 * 1000); // 31 min después

    const result = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('devuelve EXPIRED en el instante exacto de los 30 minutos (frontera de caducidad)', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW });
    const confirmAt = new Date(NOW.getTime() + 30 * 60 * 1000); // exactamente 30 min después

    const result = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('devuelve NOT_FOUND si el token no existe', async () => {
    const result = await confirmAppointment(prisma, 'token-inexistente', NOW);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('devuelve INVALID_STATE si la cita ya está en un estado terminal (nunca se llegó a verificar el email)', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW });
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: 'CANCELLED' } });

    const result = await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 5 * 60 * 1000));

    expect(result).toEqual({ ok: false, reason: 'INVALID_STATE' });
  });
});

describe('cancelAppointment', () => {
  it('cancela una cita PENDING', async () => {
    const appointment = await createPendingAppointment();

    const result = await cancelAppointment(prisma, appointment.cancelToken);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('CANCELLED');
    }
  });

  it('cancela una cita CONFIRMED', async () => {
    const appointment = await createPendingAppointment();
    await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 5 * 60 * 1000));

    const result = await cancelAppointment(prisma, appointment.cancelToken);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('CANCELLED');
    }
  });

  it('es idempotente si la cita ya estaba CANCELLED', async () => {
    const appointment = await createPendingAppointment();
    await cancelAppointment(prisma, appointment.cancelToken);

    const secondAttempt = await cancelAppointment(prisma, appointment.cancelToken);

    expect(secondAttempt.ok).toBe(true);
    if (secondAttempt.ok) {
      expect(secondAttempt.appointment.status).toBe('CANCELLED');
    }
  });

  it('devuelve NOT_FOUND si el token no existe', async () => {
    const result = await cancelAppointment(prisma, 'token-inexistente');

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('devuelve INVALID_STATE si la cita ya está COMPLETED', async () => {
    const appointment = await createPendingAppointment();
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: 'COMPLETED' } });

    const result = await cancelAppointment(prisma, appointment.cancelToken);

    expect(result).toEqual({ ok: false, reason: 'INVALID_STATE' });
  });
});
