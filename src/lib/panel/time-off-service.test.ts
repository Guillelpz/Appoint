import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { listTimeOffForEmployee, createTimeOffForEmployee, deleteTimeOffForBusiness } from './time-off-service';

describe('createTimeOffForEmployee', () => {
  it('crea la ausencia si el empleado pertenece al negocio', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: 'Vacaciones',
    });

    expect(result.ok).toBe(true);
  });

  it('devuelve INVALID_INPUT si start >= end', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T18:00:00.000Z'),
      end: new Date('2026-09-01T08:00:00.000Z'),
      reason: null,
    });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve NOT_FOUND si el empleado pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-ausencia', name: 'Otro', type: 'OTHER' } });

    const result = await createTimeOffForEmployee(prisma, otherBusiness.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: null,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('listTimeOffForEmployee', () => {
  it('devuelve las ausencias del empleado, vacío si pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: null,
    });

    const list = await listTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id);
    expect(list.length).toBeGreaterThan(0);

    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-ausencia-2', name: 'Otro', type: 'OTHER' } });
    const listFromOther = await listTimeOffForEmployee(prisma, otherBusiness.id, seed.employees.marta.id);
    expect(listFromOther).toEqual([]);
  });
});

describe('deleteTimeOffForBusiness', () => {
  it('elimina la ausencia si pertenece (por su empleado) al negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const created = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: null,
    });
    if (!created.ok) throw new Error('setup falló');

    const result = await deleteTimeOffForBusiness(prisma, seed.business.id, created.timeOff.id);

    expect(result).toEqual({ ok: true });
    const remaining = await prisma.timeOff.findUnique({ where: { id: created.timeOff.id } });
    expect(remaining).toBeNull();
  });

  it('devuelve NOT_FOUND y no borra nada si pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const created = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: null,
    });
    if (!created.ok) throw new Error('setup falló');
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-ausencia-3', name: 'Otro', type: 'OTHER' } });

    const result = await deleteTimeOffForBusiness(prisma, otherBusiness.id, created.timeOff.id);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    const stillThere = await prisma.timeOff.findUnique({ where: { id: created.timeOff.id } });
    expect(stillThere).not.toBeNull();
  });
});
