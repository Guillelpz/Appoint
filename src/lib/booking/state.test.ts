import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { canTransition, completeAppointment, markNoShow, CANCELLABLE_STATUSES } from './state';

async function createConfirmedAppointment() {
  const seed = await seedDemoBusiness(prisma);
  const customer = await prisma.customer.create({
    data: {
      businessId: seed.business.id,
      name: 'Cliente estado',
      phone: '+34688000001',
      email: 'estado@example.com',
    },
  });

  return prisma.appointment.create({
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
}

describe('canTransition', () => {
  it('permite las transiciones válidas', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'NO_SHOW')).toBe(true);
  });

  it('rechaza las transiciones inválidas', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false);
    expect(canTransition('COMPLETED', 'CONFIRMED')).toBe(false);
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransition('NO_SHOW', 'COMPLETED')).toBe(false);
  });
});

describe('CANCELLABLE_STATUSES', () => {
  it('incluye exactamente los estados desde los que canTransition permite pasar a CANCELLED', () => {
    expect([...CANCELLABLE_STATUSES].sort()).toEqual(['CONFIRMED', 'PENDING'].sort());
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'CANCELLED')).toBe(false);
    expect(canTransition('NO_SHOW', 'CANCELLED')).toBe(false);
  });
});

describe('completeAppointment', () => {
  it('marca como COMPLETED una cita CONFIRMED', async () => {
    const appointment = await createConfirmedAppointment();

    const result = await completeAppointment(prisma, appointment.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('COMPLETED');
    }
  });

  it('devuelve INVALID_TRANSITION si la cita está PENDING', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente pendiente',
        phone: '+34688000002',
        email: 'pendiente@example.com',
      },
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

    const result = await completeAppointment(prisma, appointment.id);

    expect(result).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
  });

  it('devuelve NOT_FOUND si el id no existe', async () => {
    const result = await completeAppointment(prisma, 'id-inexistente');

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('markNoShow', () => {
  it('marca como NO_SHOW una cita CONFIRMED', async () => {
    const appointment = await createConfirmedAppointment();

    const result = await markNoShow(prisma, appointment.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('NO_SHOW');
    }
  });
});
