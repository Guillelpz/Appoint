import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { bookAppointmentBySlug } from './booking-service';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z');

describe('bookAppointmentBySlug', () => {
  it('crea la cita y devuelve los tokens cuando todo es correcto', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente servicio',
      customerPhone: '+34699000001',
      customerEmail: 'servicio@example.com',
      ipAddress: '198.51.100.60',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmToken).toBeTruthy();
      expect(result.cancelToken).toBeTruthy();
      expect(result.pendingApproval).toBe(false);
    }
  });

  it('marca pendingApproval en true si el negocio tiene manualApproval activado', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.business.update({ where: { id: seed.business.id }, data: { manualApproval: true } });

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente aprobación',
      customerPhone: '+34699000002',
      customerEmail: 'aprobacion@example.com',
      ipAddress: '198.51.100.61',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pendingApproval).toBe(true);
    }
  });

  it('devuelve mensaje amable y sin alternativas para BLACKLISTED', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.blacklistEntry.create({
      data: { businessId: seed.business.id, email: 'vetado-servicio@example.com', reason: 'No presentado' },
    });

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Vetado',
      customerPhone: '+34699000003',
      customerEmail: 'vetado-servicio@example.com',
      ipAddress: '198.51.100.62',
      now: NOW,
    });

    expect(result).toEqual({
      ok: false,
      message: 'No podemos completar tu reserva en este negocio. Si crees que es un error, contacta directamente con ellos.',
      alternativeSlots: [],
    });
  });

  it('devuelve huecos alternativos ese mismo día cuando el hueco se acaba de ocupar (SLOT_TAKEN)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const raceStart = new Date('2026-07-14T14:00:00.000Z'); // 16:00 local, bloque de Carlos

    const attempt = (phone: string, email: string) =>
      bookAppointmentBySlug(prisma, {
        slug: 'salon-aura',
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.carlos.id,
        start: raceStart,
        customerName: 'Cliente carrera servicio',
        customerPhone: phone,
        customerEmail: email,
        ipAddress: '198.51.100.63',
        now: NOW,
      });

    const [resultA, resultB] = await Promise.all([
      attempt('+34699000004', 'carrera-servicio-a@example.com'),
      attempt('+34699000005', 'carrera-servicio-b@example.com'),
    ]);

    const failed = [resultA, resultB].find((r) => !r.ok);
    expect(failed).toBeDefined();
    if (failed && !failed.ok) {
      expect(failed.message).toBe('Vaya, ese hueco se acaba de ocupar. Te proponemos otras horas disponibles:');
      expect(failed.alternativeSlots.length).toBeGreaterThan(0);
    }
  });

  it('devuelve el mensaje de BUSINESS_NOT_FOUND si el slug no existe', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'no-existe',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Sin negocio',
      customerPhone: '+34699000006',
      customerEmail: 'sinnegocio-servicio@example.com',
      ipAddress: '198.51.100.64',
      now: NOW,
    });

    expect(result).toEqual({
      ok: false,
      message: 'No encontramos este negocio. Puede que el enlace ya no esté disponible.',
      alternativeSlots: [],
    });
  });
});
