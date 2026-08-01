import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { approvePendingAppointment, rejectPendingAppointment } from './approval-service';
import { FakeEmailSender } from '../../test/fake-email-sender';
import { FakeDeferredTaskRunner, RecordingDeferredTaskRunner } from '../../test/fake-deferred-task-runner';

async function createPendingAppointment(
  overrides: { customerEmail?: string | null; emailVerifiedAt?: Date | null } = {}
) {
  const seed = await seedDemoBusiness(prisma);
  await prisma.business.update({ where: { id: seed.business.id }, data: { manualApproval: true } });
  const customer = await prisma.customer.create({
    data: {
      businessId: seed.business.id,
      name: 'Cliente pendiente',
      phone: '+34688000040',
      email: overrides.customerEmail === undefined ? 'pendiente-aprobacion@example.com' : overrides.customerEmail,
    },
  });
  const appointment = await prisma.appointment.create({
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
      status: 'PENDING',
      emailVerifiedAt:
        overrides.emailVerifiedAt === undefined ? new Date('2026-07-13T08:00:00.000Z') : overrides.emailVerifiedAt,
    },
  });
  return { seed, appointment };
}

describe('approvePendingAppointment', () => {
  it('confirma la cita y envía el email de aprobación al cliente', async () => {
    const { seed, appointment } = await createPendingAppointment();
    const emailSender = new FakeEmailSender();

    const result = await approvePendingAppointment(prisma, {
      businessId: seed.business.id,
      appointmentId: appointment.id,
      emailSender,
      taskScheduler: new FakeDeferredTaskRunner(),
    });

    expect(result.ok).toBe(true);
    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('CONFIRMED');
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('pendiente-aprobacion@example.com');
  });

  it('aprueba también una cita sin emailVerifiedAt (la spec permite confirmar manualmente siempre)', async () => {
    const { seed, appointment } = await createPendingAppointment({ emailVerifiedAt: null });

    const result = await approvePendingAppointment(prisma, {
      businessId: seed.business.id,
      appointmentId: appointment.id,
      emailSender: new FakeEmailSender(),
      taskScheduler: new FakeDeferredTaskRunner(),
    });

    expect(result.ok).toBe(true);
    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('CONFIRMED');
  });

  it('no envía email si la cita no tiene email de cliente', async () => {
    const { seed, appointment } = await createPendingAppointment({ customerEmail: null });
    const emailSender = new FakeEmailSender();

    const result = await approvePendingAppointment(prisma, {
      businessId: seed.business.id,
      appointmentId: appointment.id,
      emailSender,
      taskScheduler: new FakeDeferredTaskRunner(),
    });

    expect(result.ok).toBe(true);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('devuelve NOT_FOUND y no toca la cita si pertenece a otro negocio', async () => {
    const { appointment } = await createPendingAppointment();
    const otherBusiness = await prisma.business.create({
      data: { slug: 'otro-negocio-aprobacion', name: 'Otro Negocio', type: 'OTHER' },
    });

    const result = await approvePendingAppointment(prisma, {
      businessId: otherBusiness.id,
      appointmentId: appointment.id,
      emailSender: new FakeEmailSender(),
      taskScheduler: new FakeDeferredTaskRunner(),
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('PENDING');
  });

  it('con dos aprobaciones concurrentes de la misma cita, el email se envía una única vez', async () => {
    const { seed, appointment } = await createPendingAppointment();
    const emailSender = new FakeEmailSender();

    const [first, second] = await Promise.all([
      approvePendingAppointment(prisma, { businessId: seed.business.id, appointmentId: appointment.id, emailSender, taskScheduler: new FakeDeferredTaskRunner() }),
      approvePendingAppointment(prisma, { businessId: seed.business.id, appointmentId: appointment.id, emailSender, taskScheduler: new FakeDeferredTaskRunner() }),
    ]);

    // A diferencia de la cancelación pública, aprobar no es idempotente para
    // el "perdedor": solo una de las dos llamadas consigue el claim
    // (status: PENDING en el where); la otra recibe NOT_FOUND porque cuando
    // ella intenta el updateMany la cita ya está CONFIRMED. El panel ignora
    // ese resultado (solo revalida la página), así que es un resultado
    // seguro aunque no sea "ok:true, ok:true" como en cancelPublicAppointment.
    expect([first, second].filter((r) => r.ok)).toHaveLength(1);
    expect(emailSender.sent).toHaveLength(1);
  });
});

describe('approvePendingAppointment — envío diferido', () => {
  it('confirma la cita y devuelve el resultado antes de que el email se haya enviado (after() no bloquea la respuesta)', async () => {
    const { seed, appointment } = await createPendingAppointment();
    const emailSender = new FakeEmailSender();
    const taskScheduler = new RecordingDeferredTaskRunner();

    const result = await approvePendingAppointment(prisma, {
      businessId: seed.business.id,
      appointmentId: appointment.id,
      emailSender,
      taskScheduler,
    });

    expect(result.ok).toBe(true);
    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('CONFIRMED');
    // La cita ya está CONFIRMED y la función ya ha devuelto, pero el email
    // todavía no ha salido: solo se dispara al hacer flush() de la tarea
    // programada (equivalente a lo que hace after() tras la respuesta).
    expect(emailSender.sent).toHaveLength(0);

    await taskScheduler.flush();
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('pendiente-aprobacion@example.com');
  });
});

describe('rejectPendingAppointment', () => {
  it('cancela la cita y envía el email de rechazo al cliente', async () => {
    const { seed, appointment } = await createPendingAppointment({ customerEmail: 'rechazo@example.com' });
    const emailSender = new FakeEmailSender();

    const result = await rejectPendingAppointment(prisma, {
      businessId: seed.business.id,
      appointmentId: appointment.id,
      emailSender,
      taskScheduler: new FakeDeferredTaskRunner(),
    });

    expect(result.ok).toBe(true);
    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('CANCELLED');
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('rechazo@example.com');
  });

  it('devuelve NOT_FOUND si la cita no está PENDING', async () => {
    const { seed, appointment } = await createPendingAppointment();
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: 'CANCELLED' } });

    const result = await rejectPendingAppointment(prisma, {
      businessId: seed.business.id,
      appointmentId: appointment.id,
      emailSender: new FakeEmailSender(),
      taskScheduler: new FakeDeferredTaskRunner(),
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});
