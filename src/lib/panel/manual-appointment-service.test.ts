import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createManualAppointmentForBusiness } from './manual-appointment-service';
import { FakeEmailSender } from '../../test/fake-email-sender';

const NOW = new Date('2026-07-13T08:00:00.000Z');
// Martes: dentro del horario laboral de Marta en el seed (10:00-14:00 y 16:00-20:00 hora de Madrid).
const VALID_START = new Date('2026-07-14T09:00:00.000Z');

describe('createManualAppointmentForBusiness', () => {
  it('crea la cita como CONFIRMED con origen MANUAL sin teléfono ni email', async () => {
    const seed = await seedDemoBusiness(prisma);
    const emailSender = new FakeEmailSender();

    const result = await createManualAppointmentForBusiness(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente manual sin contacto',
      now: NOW,
      emailSender,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('CONFIRMED');
      expect(result.appointment.source).toBe('MANUAL');
      expect(result.appointment.customerPhone).toBeNull();
      expect(result.appointment.customerEmail).toBeNull();
    }
    expect(emailSender.sent).toHaveLength(0);
  });

  it('crea la cita y envía el email de aprobación si se indica email', async () => {
    const seed = await seedDemoBusiness(prisma);
    const emailSender = new FakeEmailSender();

    const result = await createManualAppointmentForBusiness(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente manual con email',
      customerEmail: 'manual@example.com',
      now: NOW,
      emailSender,
    });

    expect(result.ok).toBe(true);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('manual@example.com');
  });

  it('omite el anti-fraude: permite una tercera cita activa para el mismo teléfono en el mismo negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const phone = '+34688000050';
    for (let i = 0; i < 2; i++) {
      const start = new Date(VALID_START.getTime() + i * 60 * 60 * 1000);
      const result = await createManualAppointmentForBusiness(prisma, {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        start,
        customerName: `Cliente manual ${i}`,
        customerPhone: phone,
        now: NOW,
        emailSender: new FakeEmailSender(),
      });
      expect(result.ok).toBe(true);
    }

    // Una tercera cita activa para el mismo teléfono superaría el límite de
    // 2 citas activas del motor público (checkActiveAppointmentLimit), pero
    // el alta manual lo omite a propósito.
    const third = await createManualAppointmentForBusiness(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: new Date(VALID_START.getTime() + 2 * 60 * 60 * 1000),
      customerName: 'Cliente manual 2',
      customerPhone: phone,
      now: NOW,
      emailSender: new FakeEmailSender(),
    });
    expect(third.ok).toBe(true);
  });

  it('reutiliza el Customer existente por email igual que el flujo público', async () => {
    const seed = await seedDemoBusiness(prisma);
    const email = 'cliente-repetido@example.com';
    await createManualAppointmentForBusiness(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente Repetido',
      customerEmail: email,
      now: NOW,
      emailSender: new FakeEmailSender(),
    });

    const second = await createManualAppointmentForBusiness(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: new Date(VALID_START.getTime() + 60 * 60 * 1000),
      customerName: 'Cliente Repetido',
      customerEmail: email,
      now: NOW,
      emailSender: new FakeEmailSender(),
    });

    expect(second.ok).toBe(true);
    const customers = await prisma.customer.findMany({ where: { businessId: seed.business.id, email } });
    expect(customers).toHaveLength(1);
  });

  it('devuelve INVALID_INPUT si el nombre está vacío', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createManualAppointmentForBusiness(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: '   ',
      now: NOW,
      emailSender: new FakeEmailSender(),
    });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve EMPLOYEE_UNAVAILABLE si el empleado no ofrece ese servicio', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createManualAppointmentForBusiness(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.coloracion.id,
      employeeId: seed.employees.carlos.id, // Carlos no ofrece coloración en el seed
      start: VALID_START,
      customerName: 'Cliente sin hueco',
      now: NOW,
      emailSender: new FakeEmailSender(),
    });

    expect(result).toEqual({ ok: false, reason: 'EMPLOYEE_UNAVAILABLE' });
  });

  it('devuelve EMPLOYEE_UNAVAILABLE si el hueco cae fuera del horario laboral', async () => {
    const seed = await seedDemoBusiness(prisma);
    const outsideWorkingHours = new Date('2026-07-14T23:00:00.000Z');

    const result = await createManualAppointmentForBusiness(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: outsideWorkingHours,
      customerName: 'Cliente fuera de horario',
      now: NOW,
      emailSender: new FakeEmailSender(),
    });

    expect(result).toEqual({ ok: false, reason: 'EMPLOYEE_UNAVAILABLE' });
  });

  it('devuelve EMPLOYEE_UNAVAILABLE si el hueco ya está ocupado por otra cita activa (comprobación previa de disponibilidad)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const first = await createManualAppointmentForBusiness(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Primer cliente',
      now: NOW,
      emailSender: new FakeEmailSender(),
    });
    expect(first.ok).toBe(true);

    // Igual que en createAppointment (flujo público): para una segunda
    // llamada secuencial, la comprobación previa de disponibilidad
    // (isEmployeeAvailableAt, fuera de la transacción) ya ve el hueco
    // ocupado por la primera cita CONFIRMED y lo rechaza antes de llegar al
    // INSERT, así que el motivo determinista es EMPLOYEE_UNAVAILABLE, no
    // SLOT_TAKEN. SLOT_TAKEN es la red de seguridad del índice único para
    // una condición de carrera real (ver el siguiente test).
    const second = await createManualAppointmentForBusiness(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Segundo cliente',
      now: NOW,
      emailSender: new FakeEmailSender(),
    });
    expect(second).toEqual({ ok: false, reason: 'EMPLOYEE_UNAVAILABLE' });
  });

  it('detecta colisión de hueco ante una condición de carrera (red de seguridad del índice único)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const raceStart = new Date('2026-07-14T14:00:00.000Z'); // 16:00 local, bloque de Carlos

    const attempt = (customerName: string) =>
      createManualAppointmentForBusiness(prisma, {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.carlos.id,
        start: raceStart,
        customerName,
        now: NOW,
        emailSender: new FakeEmailSender(),
      });

    const [resultA, resultB] = await Promise.all([attempt('Cliente carrera A'), attempt('Cliente carrera B')]);

    const results = [resultA, resultB];
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    if (!failed[0].ok) {
      // Igual que en el test homólogo de create-appointment.test.ts: la
      // petición perdedora puede recibir dos motivos igual de legítimos
      // según el entrelazado real de E/S entre las dos conexiones
      // concurrentes (no determinista y no se puede forzar desde el test).
      expect(['SLOT_TAKEN', 'EMPLOYEE_UNAVAILABLE']).toContain(failed[0].reason);
    }
  });
});
