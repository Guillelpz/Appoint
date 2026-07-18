import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { replaceWeeklyWorkingHours } from './working-hours-service';

describe('replaceWeeklyWorkingHours', () => {
  it('sustituye por completo el horario semanal del empleado', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await replaceWeeklyWorkingHours(prisma, seed.business.id, seed.employees.marta.id, [
      { weekday: 1, startMinute: 540, endMinute: 780 },
      { weekday: 1, startMinute: 900, endMinute: 1080 },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workingHours).toHaveLength(2);
    }
    const stored = await prisma.workingHours.findMany({ where: { employeeId: seed.employees.marta.id } });
    // El seed le da a Marta 10 tramos (5 días x 2); tras el reemplazo, solo 2.
    expect(stored).toHaveLength(2);
  });

  it('devuelve INVALID_INPUT si un tramo tiene start >= end', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await replaceWeeklyWorkingHours(prisma, seed.business.id, seed.employees.marta.id, [
      { weekday: 1, startMinute: 800, endMinute: 600 },
    ]);

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve NOT_FOUND si el empleado pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-horario', name: 'Otro', type: 'OTHER' } });

    const result = await replaceWeeklyWorkingHours(prisma, otherBusiness.id, seed.employees.marta.id, []);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('permite vaciar el horario (array vacío = sin disponibilidad ningún día)', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await replaceWeeklyWorkingHours(prisma, seed.business.id, seed.employees.marta.id, []);

    expect(result.ok).toBe(true);
    const stored = await prisma.workingHours.findMany({ where: { employeeId: seed.employees.marta.id } });
    expect(stored).toHaveLength(0);
  });

  it('devuelve INVALID_INPUT si dos tramos del mismo día se solapan, y no persiste nada', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await replaceWeeklyWorkingHours(prisma, seed.business.id, seed.employees.marta.id, [
      { weekday: 1, startMinute: 540, endMinute: 700 },
      { weekday: 1, startMinute: 600, endMinute: 780 },
    ]);

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
    const stored = await prisma.workingHours.findMany({ where: { employeeId: seed.employees.marta.id } });
    // El horario existente del seed (10 tramos) no debe verse afectado.
    expect(stored).toHaveLength(10);
  });

  it('permite tramos con el mismo rango en días distintos (no hay solape entre días)', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await replaceWeeklyWorkingHours(prisma, seed.business.id, seed.employees.marta.id, [
      { weekday: 1, startMinute: 540, endMinute: 700 },
      { weekday: 2, startMinute: 540, endMinute: 700 },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workingHours).toHaveLength(2);
    }
  });

  it('permite tramos contiguos en el mismo día (fin = inicio siguiente)', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await replaceWeeklyWorkingHours(prisma, seed.business.id, seed.employees.marta.id, [
      { weekday: 1, startMinute: 540, endMinute: 600 },
      { weekday: 1, startMinute: 600, endMinute: 660 },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workingHours).toHaveLength(2);
    }
  });
});
