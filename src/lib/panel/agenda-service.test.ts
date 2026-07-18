import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getAgendaForBusiness } from './agenda-service';
import { localMinutesToUtc, addDaysToLocalDateString } from '../booking/timezone';

async function createAppointmentDirect(params: {
  businessId: string;
  serviceId: string;
  employeeId: string;
  start: Date;
  status?: 'PENDING' | 'CONFIRMED';
  emailVerifiedAt?: Date | null;
  email?: string;
  phone?: string;
}) {
  const customer = await prisma.customer.create({
    data: {
      businessId: params.businessId,
      name: 'Cliente agenda',
      phone: params.phone ?? '+34688000080',
      email: params.email ?? 'agenda@example.com',
    },
  });
  return prisma.appointment.create({
    data: {
      businessId: params.businessId,
      serviceId: params.serviceId,
      employeeId: params.employeeId,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      start: params.start,
      end: new Date(params.start.getTime() + 30 * 60 * 1000),
      status: params.status ?? 'CONFIRMED',
      emailVerifiedAt: params.emailVerifiedAt ?? null,
    },
  });
}

describe('getAgendaForBusiness', () => {
  it('devuelve empleados activos y citas dentro del rango, marcando manualApprovalPending', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.business.update({ where: { id: seed.business.id }, data: { manualApproval: true } });

    const inRange = await createAppointmentDirect({
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: new Date('2026-07-14T09:00:00.000Z'),
      status: 'PENDING',
      emailVerifiedAt: new Date('2026-07-13T00:00:00.000Z'),
    });
    await createAppointmentDirect({
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: new Date('2026-07-20T09:00:00.000Z'), // fuera de rango
      email: 'agenda-fuera-rango@example.com',
      phone: '+34688000081',
    });

    const agenda = await getAgendaForBusiness(prisma, {
      businessId: seed.business.id,
      dateFromUtc: new Date('2026-07-14T00:00:00.000Z'),
      dateToUtc: new Date('2026-07-15T00:00:00.000Z'),
    });

    expect(agenda.employees.map((e) => e.name).sort()).toEqual(['Carlos Núñez', 'Marta Ruiz']);
    expect(agenda.appointments).toHaveLength(1);
    expect(agenda.appointments[0].id).toBe(inRange.id);
    expect(agenda.appointments[0].manualApprovalPending).toBe(true);
  });

  it('no marca manualApprovalPending si el negocio no tiene manualApproval activo', async () => {
    const seed = await seedDemoBusiness(prisma);
    await createAppointmentDirect({
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: new Date('2026-07-14T09:00:00.000Z'),
      status: 'PENDING',
    });

    const agenda = await getAgendaForBusiness(prisma, {
      businessId: seed.business.id,
      dateFromUtc: new Date('2026-07-14T00:00:00.000Z'),
      dateToUtc: new Date('2026-07-15T00:00:00.000Z'),
    });

    expect(agenda.appointments[0].manualApprovalPending).toBe(false);
  });

  it('no mezcla citas de otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({
      data: { slug: 'otro-negocio-agenda', name: 'Otro Negocio', type: 'OTHER' },
    });
    const otherEmployee = await prisma.employee.create({ data: { businessId: otherBusiness.id, name: 'Ajeno', active: true } });
    const otherService = await prisma.service.create({
      data: { businessId: otherBusiness.id, name: 'Servicio ajeno', durationMinutes: 30, priceCents: 1000 },
    });
    await createAppointmentDirect({
      businessId: otherBusiness.id,
      serviceId: otherService.id,
      employeeId: otherEmployee.id,
      start: new Date('2026-07-14T09:00:00.000Z'),
    });

    const agenda = await getAgendaForBusiness(prisma, {
      businessId: seed.business.id,
      dateFromUtc: new Date('2026-07-14T00:00:00.000Z'),
      dateToUtc: new Date('2026-07-15T00:00:00.000Z'),
    });

    expect(agenda.appointments).toHaveLength(0);
  });

  it('respeta los límites del día local: incluye 00:00 y 23:45, excluye el día siguiente', async () => {
    const seed = await seedDemoBusiness(prisma);
    const localDay = '2026-07-14';
    const nextLocalDay = addDaysToLocalDateString(localDay, 1);

    const startOfDay = await createAppointmentDirect({
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: localMinutesToUtc(localDay, 0), // 00:00 hora local
      email: 'agenda-inicio-dia@example.com',
      phone: '+34688000082',
    });
    const endOfDay = await createAppointmentDirect({
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: localMinutesToUtc(localDay, 23 * 60 + 45), // 23:45 hora local
      email: 'agenda-fin-dia@example.com',
      phone: '+34688000083',
    });
    await createAppointmentDirect({
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: localMinutesToUtc(nextLocalDay, 0), // 00:00 del día siguiente, justo fuera de rango
      email: 'agenda-dia-siguiente@example.com',
      phone: '+34688000084',
    });

    const agenda = await getAgendaForBusiness(prisma, {
      businessId: seed.business.id,
      dateFromUtc: localMinutesToUtc(localDay, 0),
      dateToUtc: localMinutesToUtc(nextLocalDay, 0),
    });

    expect(agenda.appointments.map((a) => a.id).sort()).toEqual([startOfDay.id, endOfDay.id].sort());
  });
});
