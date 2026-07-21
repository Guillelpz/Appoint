import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getPlatformMetrics } from './platform-metrics-service';

// 2026-07-15 es miércoles; la semana [lunes 00:00, lunes siguiente 00:00)
// en Europe/Madrid es [2026-07-13T00:00 CEST, 2026-07-20T00:00 CEST) =
// [2026-07-12T22:00Z, 2026-07-19T22:00Z).
const NOW = new Date('2026-07-15T10:00:00.000Z');

describe('getPlatformMetrics', () => {
  it('cuenta solo los negocios activos', async () => {
    await seedDemoBusiness(prisma);
    const inactive = await prisma.business.create({
      data: { slug: 'negocio-inactivo-metrics', name: 'Negocio Inactivo', type: 'OTHER', active: false },
    });
    await prisma.business.create({
      data: { slug: 'negocio-activo-metrics', name: 'Negocio Activo', type: 'OTHER', active: true },
    });

    const metrics = await getPlatformMetrics(prisma, NOW);

    expect(metrics.activeBusinessCount).toBeGreaterThanOrEqual(2); // salon-aura + negocio-activo-metrics
    expect(inactive.active).toBe(false); // documenta el fixture, no cuenta
  });

  it('cuenta las citas dentro de la semana [lunes 00:00, lunes siguiente 00:00) en Europe/Madrid', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customer = await prisma.customer.create({
      data: { businessId: seed.business.id, name: 'Cliente Métricas', email: 'metrics@example.com' },
    });

    async function createAppointmentAt(start: Date) {
      await prisma.appointment.create({
        data: {
          businessId: seed.business.id,
          serviceId: seed.services.corteMujer.id,
          employeeId: seed.employees.marta.id,
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          start,
          end: new Date(start.getTime() + 30 * 60 * 1000),
          status: 'CONFIRMED',
        },
      });
    }

    // Dentro de la semana: lunes 00:01 y domingo 23:59 locales.
    await createAppointmentAt(new Date('2026-07-12T22:01:00.000Z')); // lunes 00:01 CEST
    await createAppointmentAt(new Date('2026-07-19T21:59:00.000Z')); // domingo 23:59 CEST
    // Fuera de la semana: domingo anterior 23:59 y el lunes siguiente 00:00.
    await createAppointmentAt(new Date('2026-07-12T21:59:00.000Z')); // domingo anterior 23:59 CEST
    await createAppointmentAt(new Date('2026-07-19T22:00:00.000Z')); // lunes siguiente 00:00 CEST

    const metrics = await getPlatformMetrics(prisma, NOW);

    expect(metrics.appointmentsThisWeekCount).toBe(2);
  });
});
