import { describe, it, expect } from 'vitest';
import { dedupeSlotsByStart } from './dedupe-slots';
import type { AvailableSlot } from '@/lib/booking/slots';

describe('dedupeSlotsByStart', () => {
  it('agrupa varios huecos del mismo start en una sola entrada con todos los employeeIds', () => {
    const start = new Date('2026-07-14T08:00:00.000Z');
    const end = new Date('2026-07-14T08:35:00.000Z');
    const slots: AvailableSlot[] = [
      { start, end, employeeId: 'empleado-1' },
      { start, end, employeeId: 'empleado-2' },
    ];

    const result = dedupeSlotsByStart(slots);

    expect(result.length).toBe(1);
    expect(result[0].employeeIds.sort()).toEqual(['empleado-1', 'empleado-2']);
  });

  it('mantiene huecos con distinto start como entradas separadas, ordenadas cronológicamente', () => {
    const earlier = new Date('2026-07-14T08:00:00.000Z');
    const later = new Date('2026-07-14T09:00:00.000Z');
    const slots: AvailableSlot[] = [
      { start: later, end: later, employeeId: 'empleado-1' },
      { start: earlier, end: earlier, employeeId: 'empleado-1' },
    ];

    const result = dedupeSlotsByStart(slots);

    expect(result.length).toBe(2);
    expect(result[0].start).toEqual(earlier);
    expect(result[1].start).toEqual(later);
  });

  it('devuelve un array vacío si no hay huecos', () => {
    expect(dedupeSlotsByStart([])).toEqual([]);
  });
});
