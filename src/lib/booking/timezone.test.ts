import { describe, it, expect } from 'vitest';
import {
  getLocalDateString,
  localMinutesToUtc,
  addDaysToLocalDateString,
  parseLocalWallTimeToUtc,
  getWeekStartLocalDateString,
  BUSINESS_TIMEZONE,
} from './timezone';

describe('timezone', () => {
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

describe('parseLocalWallTimeToUtc', () => {
  it('interpreta un string de datetime-local como hora de Europe/Madrid en horario de verano (CEST, UTC+2)', () => {
    const utc = parseLocalWallTimeToUtc('2026-08-15T09:00');
    expect(utc.toISOString()).toBe('2026-08-15T07:00:00.000Z');
  });

  it('interpreta un string de datetime-local como hora de Europe/Madrid en horario de invierno (CET, UTC+1)', () => {
    const utc = parseLocalWallTimeToUtc('2026-01-15T09:00');
    expect(utc.toISOString()).toBe('2026-01-15T08:00:00.000Z');
  });
});

describe('getWeekStartLocalDateString', () => {
  it('devuelve el lunes de la semana cuando la fecha es un miércoles', () => {
    // 2026-07-15 es miércoles
    expect(getWeekStartLocalDateString('2026-07-15')).toBe('2026-07-13');
  });

  it('devuelve la misma fecha cuando ya es lunes', () => {
    // 2026-07-13 es lunes
    expect(getWeekStartLocalDateString('2026-07-13')).toBe('2026-07-13');
  });

  it('devuelve el lunes anterior cuando la fecha es domingo (fin de la semana ISO)', () => {
    // 2026-07-19 es domingo, pertenece a la semana que empezó el 2026-07-13
    expect(getWeekStartLocalDateString('2026-07-19')).toBe('2026-07-13');
  });

  it('cruza correctamente un cambio de mes', () => {
    // 2026-08-01 es sábado, la semana empezó el 2026-07-27 (lunes)
    expect(getWeekStartLocalDateString('2026-08-01')).toBe('2026-07-27');
  });
});
