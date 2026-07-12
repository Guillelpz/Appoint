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
});
