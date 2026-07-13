import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import {
  checkActiveAppointmentLimit,
  checkNoOverlapForCustomer,
  checkBlacklist,
  checkRateLimit,
  recordBookingAttempt,
} from './anti-fraud';

describe('checkActiveAppointmentLimit', () => {
  it('permite reservar si el cliente tiene menos de 2 citas activas', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente límite',
        phone: '+34633000000',
        email: 'cliente-limite@example.com',
      },
    });

    await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: new Date('2026-07-14T08:00:00.000Z'),
        end: new Date('2026-07-14T08:35:00.000Z'),
        status: 'CONFIRMED',
      },
    });

    const allowed = await checkActiveAppointmentLimit(prisma, {
      businessId: seed.business.id,
      phone: customer.phone,
      email: customer.email,
      now,
    });

    expect(allowed).toBe(true);
  });

  it('bloquea la reserva si el cliente ya tiene 2 citas activas (por teléfono o por email)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente límite',
        phone: '+34633000001',
        email: 'cliente-limite-2@example.com',
      },
    });

    await prisma.appointment.createMany({
      data: [
        {
          businessId: seed.business.id,
          serviceId: seed.services.corteHombre.id,
          employeeId: seed.employees.marta.id,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email,
          start: new Date('2026-07-14T08:00:00.000Z'),
          end: new Date('2026-07-14T08:35:00.000Z'),
          status: 'CONFIRMED',
        },
        {
          businessId: seed.business.id,
          serviceId: seed.services.corteHombre.id,
          employeeId: seed.employees.carlos.id,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email,
          start: new Date('2026-07-14T14:00:00.000Z'),
          end: new Date('2026-07-14T14:35:00.000Z'),
          status: 'PENDING',
          createdAt: new Date(now.getTime() - 5 * 60 * 1000),
        },
      ],
    });

    const allowed = await checkActiveAppointmentLimit(prisma, {
      businessId: seed.business.id,
      phone: customer.phone,
      email: customer.email,
      now,
    });

    expect(allowed).toBe(false);
  });
});

describe('checkNoOverlapForCustomer', () => {
  it('permite reservar si el nuevo horario no solapa con otra cita activa del mismo cliente', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente solape',
        phone: '+34644000000',
        email: 'cliente-solape@example.com',
      },
    });

    await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: new Date('2026-07-14T08:00:00.000Z'),
        end: new Date('2026-07-14T08:35:00.000Z'),
        status: 'CONFIRMED',
      },
    });

    const allowed = await checkNoOverlapForCustomer(prisma, {
      businessId: seed.business.id,
      phone: customer.phone,
      email: customer.email,
      start: new Date('2026-07-14T14:00:00.000Z'),
      end: new Date('2026-07-14T14:35:00.000Z'),
      now,
    });

    expect(allowed).toBe(true);
  });

  it('bloquea la reserva si el nuevo horario solapa con otra cita activa del mismo cliente', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente solape',
        phone: '+34644000001',
        email: 'cliente-solape-2@example.com',
      },
    });

    await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: new Date('2026-07-14T08:00:00.000Z'),
        end: new Date('2026-07-14T08:35:00.000Z'),
        status: 'CONFIRMED',
      },
    });

    const allowed = await checkNoOverlapForCustomer(prisma, {
      businessId: seed.business.id,
      phone: customer.phone,
      email: customer.email,
      start: new Date('2026-07-14T08:20:00.000Z'), // solapa con 08:00-08:35
      end: new Date('2026-07-14T08:55:00.000Z'),
      now,
    });

    expect(allowed).toBe(false);
  });
});

describe('checkBlacklist', () => {
  it('permite reservar si el cliente no está en la lista negra', async () => {
    const seed = await seedDemoBusiness(prisma);

    const allowed = await checkBlacklist(prisma, {
      businessId: seed.business.id,
      phone: '+34655000000',
      email: 'cliente-limpio@example.com',
    });

    expect(allowed).toBe(true);
  });

  it('bloquea la reserva si el teléfono o el email están en la lista negra del negocio', async () => {
    const seed = await seedDemoBusiness(prisma);

    await prisma.blacklistEntry.create({
      data: {
        businessId: seed.business.id,
        phone: '+34655000001',
        reason: 'Faltas repetidas sin avisar',
      },
    });

    const allowed = await checkBlacklist(prisma, {
      businessId: seed.business.id,
      phone: '+34655000001',
      email: 'otro-email@example.com',
    });

    expect(allowed).toBe(false);
  });
});

describe('checkRateLimit', () => {
  it('permite el intento si hay menos de 5 registrados en la última hora para esa IP', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T10:00:00.000Z');

    for (let i = 0; i < 4; i++) {
      await prisma.bookingAttempt.create({
        data: {
          businessId: seed.business.id,
          ipAddress: '203.0.113.10',
          createdAt: new Date(now.getTime() - i * 60 * 1000),
        },
      });
    }

    const allowed = await checkRateLimit(prisma, {
      businessId: seed.business.id,
      ipAddress: '203.0.113.10',
      now,
    });

    expect(allowed).toBe(true);
  });

  it('permite el intento al llegar exactamente a 5 registrados en la última hora (el 5º intento pasa)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T10:00:00.000Z');

    // recordBookingAttempt inserta antes de contar, así que en el flujo real
    // estos 5 registros incluyen el propio intento actual: el 5º debe pasar.
    for (let i = 0; i < 5; i++) {
      await prisma.bookingAttempt.create({
        data: {
          businessId: seed.business.id,
          ipAddress: '203.0.113.11',
          createdAt: new Date(now.getTime() - i * 60 * 1000),
        },
      });
    }

    const allowed = await checkRateLimit(prisma, {
      businessId: seed.business.id,
      ipAddress: '203.0.113.11',
      now,
    });

    expect(allowed).toBe(true);
  });

  it('bloquea el intento al llegar a 6 registrados en la última hora para esa IP (el 6º intento no pasa)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T10:00:00.000Z');

    for (let i = 0; i < 6; i++) {
      await prisma.bookingAttempt.create({
        data: {
          businessId: seed.business.id,
          ipAddress: '203.0.113.14',
          createdAt: new Date(now.getTime() - i * 60 * 1000),
        },
      });
    }

    const allowed = await checkRateLimit(prisma, {
      businessId: seed.business.id,
      ipAddress: '203.0.113.14',
      now,
    });

    expect(allowed).toBe(false);
  });

  it('ignora intentos de hace más de una hora', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T10:00:00.000Z');

    for (let i = 0; i < 5; i++) {
      await prisma.bookingAttempt.create({
        data: {
          businessId: seed.business.id,
          ipAddress: '203.0.113.12',
          createdAt: new Date(now.getTime() - 90 * 60 * 1000), // hace 90 minutos
        },
      });
    }

    const allowed = await checkRateLimit(prisma, {
      businessId: seed.business.id,
      ipAddress: '203.0.113.12',
      now,
    });

    expect(allowed).toBe(true);
  });

  it('recordBookingAttempt persiste un nuevo intento', async () => {
    const seed = await seedDemoBusiness(prisma);

    await recordBookingAttempt(prisma, { businessId: seed.business.id, ipAddress: '203.0.113.13' });

    const count = await prisma.bookingAttempt.count({
      where: { businessId: seed.business.id, ipAddress: '203.0.113.13' },
    });

    expect(count).toBe(1);
  });
});
