import { describe, it, expect } from 'vitest';
import { generateAppointmentIcs } from './ics';

const baseInput = {
  uid: 'appt-123@appoint.example',
  businessName: 'Salón Aura',
  serviceName: 'Corte de mujer',
  employeeName: 'Marta Ruiz',
  address: 'Calle Mayor 10, Madrid',
  start: new Date('2026-07-14T08:00:00.000Z'),
  end: new Date('2026-07-14T08:45:00.000Z'),
  now: new Date('2026-07-13T08:00:00.000Z'),
};

describe('generateAppointmentIcs', () => {
  it('genera un VEVENT válido con las fechas en UTC sin separadores', () => {
    const ics = generateAppointmentIcs(baseInput);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:appt-123@appoint.example');
    expect(ics).toContain('DTSTAMP:20260713T080000Z');
    expect(ics).toContain('DTSTART:20260714T080000Z');
    expect(ics).toContain('DTEND:20260714T084500Z');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('incluye el resumen con el servicio y el negocio', () => {
    const ics = generateAppointmentIcs(baseInput);
    expect(ics).toContain('SUMMARY:Corte de mujer — Salón Aura');
  });

  it('incluye LOCATION cuando hay dirección y la omite si no hay', () => {
    const withAddress = generateAppointmentIcs(baseInput);
    expect(withAddress).toContain('LOCATION:Calle Mayor 10\\, Madrid');

    const withoutAddress = generateAppointmentIcs({ ...baseInput, address: null });
    expect(withoutAddress).not.toContain('LOCATION:');
  });

  it('escapa comas y punto y coma en los campos de texto', () => {
    const ics = generateAppointmentIcs({ ...baseInput, businessName: 'Salón; Aura, S.L.' });
    expect(ics).toContain('Salón\\; Aura\\, S.L.');
  });

  it('usa saltos de línea CRLF (RFC 5545)', () => {
    const ics = generateAppointmentIcs(baseInput);
    expect(ics.includes('\r\n')).toBe(true);
    expect(ics.split('\r\n').length).toBeGreaterThan(5);
  });
});
