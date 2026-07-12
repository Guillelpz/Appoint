import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getAvailableSlots } from './slots';

describe('getAvailableSlots — huecos base', () => {
  it('genera huecos de 15 en 15 minutos dentro de los dos tramos del martes', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z'); // lunes, antes del martes de prueba

    const slots = await getAvailableSlots(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id, // 30 min + 5 min buffer = 35 min
      employeeId: seed.employees.marta.id,
      dateFrom: '2026-07-14', // martes
      dateTo: '2026-07-14',
      now,
    });

    // Tramo 10:00-14:00 (600-840): cursores 600..795 cada 15 -> 14 huecos
    // Tramo 16:00-20:00 (960-1200): cursores 960..1155 cada 15 -> 14 huecos
    expect(slots.length).toBe(28);

    expect(slots[0].start.toISOString()).toBe('2026-07-14T08:00:00.000Z'); // 10:00 local
    expect(slots[0].end.toISOString()).toBe('2026-07-14T08:35:00.000Z');
    expect(slots[0].employeeId).toBe(seed.employees.marta.id);

    expect(slots[13].start.toISOString()).toBe('2026-07-14T11:15:00.000Z'); // último del tramo 1
    expect(slots[14].start.toISOString()).toBe('2026-07-14T14:00:00.000Z'); // primero del tramo 2 (16:00 local)
    expect(slots[27].start.toISOString()).toBe('2026-07-14T17:15:00.000Z'); // último del tramo 2
  });

  it('excluye los huecos que solapan con una ausencia (TimeOff) del empleado', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    await prisma.timeOff.create({
      data: {
        employeeId: seed.employees.marta.id,
        start: new Date('2026-07-14T08:00:00.000Z'), // 10:00 local
        end: new Date('2026-07-14T09:00:00.000Z'), // 11:00 local
        reason: 'Cita médica',
      },
    });

    const slots = await getAvailableSlots(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now,
    });

    // Se eliminan los 4 huecos del tramo 1 que solapan [08:00,09:00)Z: 08:00,08:15,08:30,08:45
    expect(slots.length).toBe(24);
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T08:00:00.000Z')).toBe(false);
    // El hueco que empieza justo cuando termina la ausencia sí está disponible
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T09:00:00.000Z')).toBe(true);
  });

  it('excluye citas CONFIRMED y PENDING no caducadas, pero ignora las PENDING caducadas (expiración perezosa)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-14T13:00:00.000Z'); // 15:00 local, mismo día de prueba

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente de prueba',
        phone: '+34611000000',
        email: 'cliente-fixture@example.com',
      },
    });

    // Cita CONFIRMED que bloquea el primer hueco del tramo de tarde (16:00 local = 14:00Z)
    await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: new Date('2026-07-14T14:00:00.000Z'),
        end: new Date('2026-07-14T14:35:00.000Z'),
        status: 'CONFIRMED',
      },
    });

    // Cita PENDING creada hace 5 minutos (no caducada): bloquea el hueco de 15:00Z
    await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: new Date('2026-07-14T15:00:00.000Z'),
        end: new Date('2026-07-14T15:35:00.000Z'),
        status: 'PENDING',
        createdAt: new Date('2026-07-14T12:55:00.000Z'), // now - 5 min
      },
    });

    // Cita PENDING creada hace 40 minutos (caducada): NO debe bloquear el hueco de 16:00Z
    await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: new Date('2026-07-14T16:00:00.000Z'),
        end: new Date('2026-07-14T16:35:00.000Z'),
        status: 'PENDING',
        createdAt: new Date('2026-07-14T12:20:00.000Z'), // now - 40 min
      },
    });

    const slots = await getAvailableSlots(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now,
    });

    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T14:00:00.000Z')).toBe(false); // CONFIRMED
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T15:00:00.000Z')).toBe(false); // PENDING activa
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T16:00:00.000Z')).toBe(true); // PENDING caducada, se ignora
  });
});
