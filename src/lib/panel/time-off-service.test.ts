import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { listTimeOffForEmployee, createTimeOffForEmployee, deleteTimeOffForBusiness } from './time-off-service';

const NOW = new Date('2026-08-01T00:00:00.000Z');

describe('createTimeOffForEmployee', () => {
  it('crea la ausencia si el empleado pertenece al negocio', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: 'Vacaciones',
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });

  it('devuelve INVALID_INPUT si start >= end', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T18:00:00.000Z'),
      end: new Date('2026-09-01T08:00:00.000Z'),
      reason: null,
      now: NOW,
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
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('createTimeOffForEmployee — límites de fecha', () => {
  it('devuelve START_IN_PAST si la fecha de inicio es anterior a ahora', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-07-01T08:00:00.000Z'),
      end: new Date('2026-07-01T18:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'START_IN_PAST' });
  });

  it('devuelve DURATION_TOO_LONG si la ausencia dura más de 90 días', async () => {
    const seed = await seedDemoBusiness(prisma);
    const start = new Date('2026-08-02T00:00:00.000Z');
    const end = new Date(start.getTime() + 91 * 24 * 60 * 60 * 1000);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start,
      end,
      reason: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'DURATION_TOO_LONG' });
  });

  it('acepta una ausencia de exactamente 90 días', async () => {
    const seed = await seedDemoBusiness(prisma);
    const start = new Date('2026-08-02T00:00:00.000Z');
    const end = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start,
      end,
      reason: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });

  it('devuelve TOO_FAR_IN_FUTURE si empieza más de 2 años vista', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2028-08-02T00:00:00.000Z'),
      end: new Date('2028-08-03T00:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'TOO_FAR_IN_FUTURE' });
  });

  it('acepta una ausencia que empieza exactamente 2 años después de ahora', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2028-08-01T00:00:00.000Z'),
      end: new Date('2028-08-01T08:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });

  it('devuelve OVERLAPPING si se solapa con otra ausencia del mismo empleado', async () => {
    const seed = await seedDemoBusiness(prisma);
    await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-08-10T08:00:00.000Z'),
      end: new Date('2026-08-10T18:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-08-10T12:00:00.000Z'),
      end: new Date('2026-08-10T20:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'OVERLAPPING' });
  });

  it('acepta dos ausencias contiguas que solo se tocan en el límite (no se solapan)', async () => {
    const seed = await seedDemoBusiness(prisma);
    await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-08-10T08:00:00.000Z'),
      end: new Date('2026-08-10T18:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-08-10T18:00:00.000Z'),
      end: new Date('2026-08-10T20:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });
});

describe('listTimeOffForEmployee', () => {
  it('devuelve las ausencias del empleado, vacío si pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: null,
      now: NOW,
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
      now: NOW,
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
      now: NOW,
    });
    if (!created.ok) throw new Error('setup falló');
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-ausencia-3', name: 'Otro', type: 'OTHER' } });

    const result = await deleteTimeOffForBusiness(prisma, otherBusiness.id, created.timeOff.id);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    const stillThere = await prisma.timeOff.findUnique({ where: { id: created.timeOff.id } });
    expect(stillThere).not.toBeNull();
  });
});
