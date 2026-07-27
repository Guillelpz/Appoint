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
    // Usa a Carlos, no a Marta: el fixture de seedDemoBusiness crea una
    // ausencia fija para Marta el 2026-08-15 (ver demo-business.ts), que
    // caería dentro de este rango de 90 días y daría OVERLAPPING en vez de
    // probar el límite de duración que este test quiere aislar.
    const seed = await seedDemoBusiness(prisma);
    const start = new Date('2026-08-02T00:00:00.000Z');
    const end = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.carlos.id, {
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

describe('createTimeOffForEmployee — START_IN_PAST usa el comienzo del día local (Europe/Madrid), no el instante exacto', () => {
  // Usa a Carlos, no a Marta: el fixture de seedDemoBusiness crea una
  // ausencia fija para Marta el 2026-08-15 (ver demo-business.ts). Aunque
  // estas fechas están lejos de esa, seguimos la misma convención que el
  // resto de este archivo para evitar sorpresas de OVERLAPPING.

  it('acepta una ausencia que empieza hoy a una hora ya pasada respecto a `now` (caso real: "se ha ido enferma hoy a las 09:00" registrado a las 11:00)', async () => {
    const seed = await seedDemoBusiness(prisma);
    // "Ahora" son las 11:00 en Madrid (CEST, UTC+2) del 1 de agosto de 2026 -> 09:00 UTC.
    const now = new Date('2026-08-01T09:00:00.000Z');
    // La ausencia empieza hoy a las 09:00 en Madrid (ya pasada respecto a `now`) -> 07:00 UTC.
    const start = new Date('2026-08-01T07:00:00.000Z');
    const end = new Date('2026-08-01T09:30:00.000Z');

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.carlos.id, {
      start,
      end,
      reason: 'Baja médica',
      now,
    });

    expect(result.ok).toBe(true);
  });

  it('sigue devolviendo START_IN_PAST si la ausencia empieza ayer', async () => {
    const seed = await seedDemoBusiness(prisma);
    // "Ahora" son las 11:00 en Madrid (CEST, UTC+2) del 1 de agosto de 2026 -> 09:00 UTC.
    const now = new Date('2026-08-01T09:00:00.000Z');
    // Empieza el día anterior (31 de julio) a las 20:00 en Madrid -> 18:00 UTC.
    const start = new Date('2026-07-31T18:00:00.000Z');
    const end = new Date('2026-07-31T20:00:00.000Z');

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.carlos.id, {
      start,
      end,
      reason: null,
      now,
    });

    expect(result).toEqual({ ok: false, reason: 'START_IN_PAST' });
  });

  it('en el borde de medianoche española: acepta un inicio a las 23:00 UTC del día anterior (ya es "hoy" en Madrid) y rechaza uno a las 21:59 UTC (todavía "ayer" en Madrid)', async () => {
    const seed = await seedDemoBusiness(prisma);
    // "Ahora" son las 10:00 en Madrid (CEST, UTC+2) del 2 de agosto de 2026 -> 08:00 UTC.
    // El comienzo del día local de hoy (2 de agosto, 00:00 Madrid) es 2026-08-01T22:00:00Z.
    const now = new Date('2026-08-02T08:00:00.000Z');

    // 2026-08-01T23:00:00Z son las 01:00 del 2 de agosto en Madrid: ya es "hoy".
    // Una comparación ingenua por fecha UTC (01/ago) lo confundiría con "ayer".
    const acceptedStart = new Date('2026-08-01T23:00:00.000Z');
    const acceptedEnd = new Date('2026-08-02T00:00:00.000Z');
    const accepted = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.carlos.id, {
      start: acceptedStart,
      end: acceptedEnd,
      reason: null,
      now,
    });
    expect(accepted.ok).toBe(true);

    // 2026-08-01T21:59:00Z son las 23:59 del 1 de agosto en Madrid: todavía "ayer".
    const rejectedStart = new Date('2026-08-01T21:59:00.000Z');
    const rejectedEnd = new Date('2026-08-01T22:30:00.000Z');
    const rejected = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.carlos.id, {
      start: rejectedStart,
      end: rejectedEnd,
      reason: null,
      now,
    });
    expect(rejected).toEqual({ ok: false, reason: 'START_IN_PAST' });
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
