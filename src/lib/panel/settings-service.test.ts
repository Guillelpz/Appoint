import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getBusinessSettings, updateBusinessSettings, type BusinessSettingsInput } from './settings-service';

const VALID_INPUT: BusinessSettingsInput = {
  name: 'Salón Aura Renovado',
  address: 'Calle Nueva 20',
  phone: '+34600999000',
  email: 'contacto@salonaura.example',
  themePreset: 'VIBRANT',
  accentColor: '#E23E7A',
  maxBookingWindowDays: 45,
  minAdvanceNoticeMinutes: 30,
  cancellationPolicy: 'Cancela con 24h de antelación.',
  manualApproval: true,
  slotGranularityMinutes: 30,
};

describe('updateBusinessSettings', () => {
  it('actualiza todos los campos indicados', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await updateBusinessSettings(prisma, seed.business.id, VALID_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.business.name).toBe('Salón Aura Renovado');
      expect(result.business.themePreset).toBe('VIBRANT');
      expect(result.business.manualApproval).toBe(true);
      expect(result.business.slotGranularityMinutes).toBe(30);
    }
  });

  it('devuelve INVALID_INPUT si el nombre está vacío', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await updateBusinessSettings(prisma, seed.business.id, { ...VALID_INPUT, name: '  ' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT si el color de acento no es un hex válido', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await updateBusinessSettings(prisma, seed.business.id, { ...VALID_INPUT, accentColor: 'rosa' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT si la granularidad no es una de las permitidas', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await updateBusinessSettings(prisma, seed.business.id, { ...VALID_INPUT, slotGranularityMinutes: 7 });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });
});

describe('getBusinessSettings', () => {
  it('devuelve el negocio por id', async () => {
    const seed = await seedDemoBusiness(prisma);
    const business = await getBusinessSettings(prisma, seed.business.id);
    expect(business?.id).toBe(seed.business.id);
  });
});
