import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { listServicesForBusiness, createServiceForBusiness, updateServiceForBusiness, setServiceActive } from './services-service';

const VALID_INPUT = {
  name: 'Manicura',
  description: 'Manicura completa',
  durationMinutes: 45,
  priceCents: 2000,
  bufferAfterMinutes: 5,
  active: true,
  sortOrder: 10,
};

describe('createServiceForBusiness', () => {
  it('crea el servicio con los datos indicados', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createServiceForBusiness(prisma, seed.business.id, VALID_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.service.name).toBe('Manicura');
      expect(result.service.businessId).toBe(seed.business.id);
    }
  });

  it('devuelve INVALID_INPUT si el nombre está vacío', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createServiceForBusiness(prisma, seed.business.id, { ...VALID_INPUT, name: '  ' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT si la duración es 0 o negativa', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createServiceForBusiness(prisma, seed.business.id, { ...VALID_INPUT, durationMinutes: 0 });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT si sortOrder no es un entero', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createServiceForBusiness(prisma, seed.business.id, { ...VALID_INPUT, sortOrder: 1.5 });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT si sortOrder es NaN', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createServiceForBusiness(prisma, seed.business.id, { ...VALID_INPUT, sortOrder: NaN });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });
});

describe('listServicesForBusiness', () => {
  it('devuelve solo los servicios del negocio indicado, ordenados por sortOrder', async () => {
    const seed = await seedDemoBusiness(prisma);
    const services = await listServicesForBusiness(prisma, seed.business.id);

    expect(services.length).toBeGreaterThan(0);
    expect(services.every((s) => s.businessId === seed.business.id)).toBe(true);
  });
});

describe('updateServiceForBusiness', () => {
  it('actualiza el servicio si pertenece al negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const created = await createServiceForBusiness(prisma, seed.business.id, VALID_INPUT);
    if (!created.ok) throw new Error('setup falló');

    const result = await updateServiceForBusiness(prisma, seed.business.id, created.service.id, {
      ...VALID_INPUT,
      name: 'Manicura semipermanente',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.service.name).toBe('Manicura semipermanente');
  });

  it('devuelve NOT_FOUND si el servicio pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const created = await createServiceForBusiness(prisma, seed.business.id, VALID_INPUT);
    if (!created.ok) throw new Error('setup falló');
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-servicios', name: 'Otro', type: 'OTHER' } });

    const result = await updateServiceForBusiness(prisma, otherBusiness.id, created.service.id, VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('setServiceActive', () => {
  it('desactiva y reactiva un servicio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const created = await createServiceForBusiness(prisma, seed.business.id, VALID_INPUT);
    if (!created.ok) throw new Error('setup falló');

    const deactivated = await setServiceActive(prisma, seed.business.id, created.service.id, false);
    expect(deactivated.ok).toBe(true);
    if (deactivated.ok) expect(deactivated.service.active).toBe(false);

    const reactivated = await setServiceActive(prisma, seed.business.id, created.service.id, true);
    if (reactivated.ok) expect(reactivated.service.active).toBe(true);
  });
});
