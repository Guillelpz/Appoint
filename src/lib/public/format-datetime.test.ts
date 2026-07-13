import { describe, it, expect } from 'vitest';
import {
  formatAppointmentDateTime,
  formatSlotTime,
  formatPriceCents,
  formatDurationMinutes,
  buildDayOptions,
} from './format-datetime';

describe('formatAppointmentDateTime', () => {
  it('formatea una fecha UTC en hora local de Madrid en español', () => {
    const utcDate = new Date('2026-07-14T08:00:00.000Z'); // martes, 10:00 en Madrid (verano, UTC+2)
    expect(formatAppointmentDateTime(utcDate)).toBe('martes, 14 de julio a las 10:00');
  });
});

describe('formatSlotTime', () => {
  it('formatea una hora UTC de mañana como HH:mm en hora de Madrid', () => {
    expect(formatSlotTime(new Date('2026-07-14T08:00:00.000Z'))).toBe('10:00'); // verano, UTC+2
  });

  it('formatea una hora UTC de tarde con relleno de ceros', () => {
    expect(formatSlotTime(new Date('2026-07-14T14:05:00.000Z'))).toBe('16:05');
  });
});

describe('formatPriceCents', () => {
  it('formatea céntimos como euros con formato español', () => {
    expect(formatPriceCents(2800)).toBe('28,00 €');
  });

  it('formatea cero correctamente', () => {
    expect(formatPriceCents(0)).toBe('0,00 €');
  });
});

describe('formatDurationMinutes', () => {
  it('formatea minutos por debajo de una hora', () => {
    expect(formatDurationMinutes(45)).toBe('45 min');
  });

  it('formatea horas exactas', () => {
    expect(formatDurationMinutes(60)).toBe('1 h');
  });

  it('formatea horas con minutos', () => {
    expect(formatDurationMinutes(90)).toBe('1 h 30 min');
  });
});

describe('buildDayOptions', () => {
  it('genera N días consecutivos empezando por la fecha local de "now"', () => {
    const now = new Date('2026-07-14T08:00:00.000Z'); // martes en Madrid
    const options = buildDayOptions(now, 5);

    expect(options.length).toBe(5);
    expect(options[0].localDate).toBe('2026-07-14');
    expect(options[0].label).toBe('mar 14 jul');
    expect(options[1].localDate).toBe('2026-07-15');
    expect(options[1].label).toBe('mié 15 jul');
  });
});
