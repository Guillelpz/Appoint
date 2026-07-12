import { describe, it, expect } from 'vitest';
import {
  getLocalWeekday,
  getLocalDateString,
  localMinutesToUtc,
  addDaysToLocalDateString,
  BUSINESS_TIMEZONE,
} from './timezone';

describe('timezone', () => {
  it('convierte una fecha UTC al día de la semana local correcto (horario de verano)', () => {
    // 2026-07-13T00:00:00Z son las 02:00 del lunes en Madrid (CEST, UTC+2)
    const utcDate = new Date('2026-07-13T00:00:00.000Z');
    expect(getLocalWeekday(utcDate, BUSINESS_TIMEZONE)).toBe(1); // 1 = lunes
  });

  it('obtiene la fecha local en formato YYYY-MM-DD cruzando medianoche', () => {
    // 2026-07-13T22:30:00Z son las 00:30 del martes en Madrid (CEST)
    const utcDate = new Date('2026-07-13T22:30:00.000Z');
    expect(getLocalDateString(utcDate, BUSINESS_TIMEZONE)).toBe('2026-07-14');
  });

  it('convierte minutos locales a UTC en horario de verano (CEST, UTC+2)', () => {
    const utc = localMinutesToUtc('2026-07-13', 600, BUSINESS_TIMEZONE); // 10:00 local
    expect(utc.toISOString()).toBe('2026-07-13T08:00:00.000Z');
  });

  it('convierte minutos locales a UTC en horario de invierno (CET, UTC+1)', () => {
    const utc = localMinutesToUtc('2026-01-13', 600, BUSINESS_TIMEZONE); // 10:00 local
    expect(utc.toISOString()).toBe('2026-01-13T09:00:00.000Z');
  });

  it('suma días a una fecha local en formato YYYY-MM-DD cruzando el fin de mes', () => {
    expect(addDaysToLocalDateString('2026-07-30', 3)).toBe('2026-08-02');
  });
});
