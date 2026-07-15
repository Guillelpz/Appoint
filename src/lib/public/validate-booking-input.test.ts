import { describe, it, expect } from 'vitest';
import { validateBookingInput } from './validate-booking-input';

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
