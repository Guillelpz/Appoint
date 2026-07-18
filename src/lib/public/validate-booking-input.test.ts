import { describe, it, expect } from 'vitest';
import { validateBookingInput, validateManualAppointmentInput } from './validate-booking-input';

const VALID_START = new Date('2026-07-14T08:00:00.000Z');

describe('validateBookingInput', () => {
  it('normaliza nombre, email y teléfono cuando la entrada es válida', () => {
    const result = validateBookingInput({
      customerName: '  Ana García  ',
      customerPhone: '+34 612 34-56-78',
      customerEmail: 'Ana.Garcia@Example.com',
      start: VALID_START,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.customerName).toBe('Ana García');
      expect(result.value.customerPhone).toBe('+34612345678');
      expect(result.value.customerEmail).toBe('ana.garcia@example.com');
    }
  });

  it('rechaza un nombre vacío', () => {
    const result = validateBookingInput({
      customerName: '',
      customerPhone: '+34612345678',
      customerEmail: 'ana@example.com',
      start: VALID_START,
    });

    expect(result.ok).toBe(false);
  });

  it('rechaza un nombre que solo contiene espacios', () => {
    const result = validateBookingInput({
      customerName: '     ',
      customerPhone: '+34612345678',
      customerEmail: 'ana@example.com',
      start: VALID_START,
    });

    expect(result.ok).toBe(false);
  });

  it('rechaza un nombre de más de 120 caracteres', () => {
    const result = validateBookingInput({
      customerName: 'a'.repeat(121),
      customerPhone: '+34612345678',
      customerEmail: 'ana@example.com',
      start: VALID_START,
    });

    expect(result.ok).toBe(false);
  });

  it('rechaza un email sin @', () => {
    const result = validateBookingInput({
      customerName: 'Ana',
      customerPhone: '+34612345678',
      customerEmail: 'ana-example.com',
      start: VALID_START,
    });

    expect(result.ok).toBe(false);
  });

  it('rechaza un email sin punto en el dominio', () => {
    const result = validateBookingInput({
      customerName: 'Ana',
      customerPhone: '+34612345678',
      customerEmail: 'ana@examplecom',
      start: VALID_START,
    });

    expect(result.ok).toBe(false);
  });

  it('rechaza un teléfono con letras', () => {
    const result = validateBookingInput({
      customerName: 'Ana',
      customerPhone: '+346123ABC78',
      customerEmail: 'ana@example.com',
      start: VALID_START,
    });

    expect(result.ok).toBe(false);
  });

  it('rechaza un teléfono de 8 dígitos', () => {
    const result = validateBookingInput({
      customerName: 'Ana',
      customerPhone: '12345678',
      customerEmail: 'ana@example.com',
      start: VALID_START,
    });

    expect(result.ok).toBe(false);
  });

  it('acepta un teléfono de 9 dígitos sin +', () => {
    const result = validateBookingInput({
      customerName: 'Ana',
      customerPhone: '612345678',
      customerEmail: 'ana@example.com',
      start: VALID_START,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.customerPhone).toBe('612345678');
    }
  });

  it('rechaza una fecha de inicio inválida', () => {
    const result = validateBookingInput({
      customerName: 'Ana',
      customerPhone: '+34612345678',
      customerEmail: 'ana@example.com',
      start: new Date('garbage'),
    });

    expect(result.ok).toBe(false);
  });
});

describe('validateManualAppointmentInput', () => {
  it('acepta solo el nombre, sin teléfono ni email', () => {
    const result = validateManualAppointmentInput({ customerName: '  Ana López  ' });
    expect(result).toEqual({ ok: true, value: { customerName: 'Ana López', customerPhone: null, customerEmail: null } });
  });

  it('acepta nombre + teléfono válido, sin email', () => {
    const result = validateManualAppointmentInput({ customerName: 'Ana López', customerPhone: '+34 600 111 222' });
    expect(result).toEqual({
      ok: true,
      value: { customerName: 'Ana López', customerPhone: '+34600111222', customerEmail: null },
    });
  });

  it('acepta nombre + email válido, sin teléfono', () => {
    const result = validateManualAppointmentInput({ customerName: 'Ana López', customerEmail: 'ANA@Example.com' });
    expect(result).toEqual({
      ok: true,
      value: { customerName: 'Ana López', customerPhone: null, customerEmail: 'ana@example.com' },
    });
  });

  it('rechaza un nombre vacío', () => {
    const result = validateManualAppointmentInput({ customerName: '   ' });
    expect(result).toEqual({ ok: false });
  });

  it('rechaza un teléfono con formato inválido si se indica', () => {
    const result = validateManualAppointmentInput({ customerName: 'Ana López', customerPhone: 'abc' });
    expect(result).toEqual({ ok: false });
  });

  it('rechaza un email con formato inválido si se indica', () => {
    const result = validateManualAppointmentInput({ customerName: 'Ana López', customerEmail: 'no-es-un-email' });
    expect(result).toEqual({ ok: false });
  });

  it('trata una cadena vacía de teléfono/email como "no indicado"', () => {
    const result = validateManualAppointmentInput({ customerName: 'Ana López', customerPhone: '', customerEmail: '' });
    expect(result).toEqual({
      ok: true,
      value: { customerName: 'Ana López', customerPhone: null, customerEmail: null },
    });
  });
});
