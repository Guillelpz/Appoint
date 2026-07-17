import { describe, it, expect, vi } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from '@/lib/booking/create-appointment';
import { confirmAppointment } from '@/lib/booking/tokens';
import { sendDueReminders } from './reminders';
import { FakeEmailSender } from '../../test/fake-email-sender';

const NOW = new Date('2026-07-13T08:00:00.000Z');

async function createConfirmedAppointment(start: Date, customerEmail: string) {
  const seed = await seedDemoBusiness(prisma);
  const created = await createAppointment(prisma, {
    businessId: seed.business.id,
    serviceId: seed.services.corteHombre.id,
    employeeId: seed.employees.marta.id,
    start,
    customerName: 'Cliente recordatorio',
    customerPhone: '+34688000030',
    customerEmail,
    source: 'WEB',
    ipAddress: '198.51.100.90',
    now: NOW,
  });
  if (!created.ok) {
    throw new Error(`No se pudo crear la cita de prueba: ${created.reason}`);
  }
  const confirmed = await confirmAppointment(prisma, created.appointment.confirmToken, NOW);
  if (!confirmed.ok) {
    throw new Error('No se pudo confirmar la cita de prueba');
  }
  return { seed, appointment: confirmed.appointment };
}

// Inserción directa (sin pasar por createAppointment) para no depender del
// horario laboral del empleado: útil para probar los límites de la ventana
// de sendDueReminders sin que las reglas de disponibilidad interfieran.
async function createDirectConfirmedAppointment(start: Date, customerEmail: string) {
  const seed = await seedDemoBusiness(prisma);
  const customer = await prisma.customer.create({
    data: {
      businessId: seed.business.id,
      name: 'Cliente recordatorio directo',
      phone: '+34688000034',
      email: customerEmail,
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
      start,
      end: new Date(start.getTime() + 30 * 60 * 1000),
      status: 'CONFIRMED',
    },
  });
  return { seed, appointment };
}

describe('sendDueReminders', () => {
  it('envía recordatorio y marca reminderSentAt para una cita CONFIRMED que empieza entre now+24h y now+25h', async () => {
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-dentro@example.com');
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(1);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('recordatorio-dentro@example.com');

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).not.toBeNull();
  });

  it('no envía recordatorio a una cita que empieza fuera de la ventana [now+23h, now+25h)', async () => {
    const start = new Date(NOW.getTime() + 26 * 60 * 60 * 1000); // fuera de ventana
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-fuera@example.com');
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).toBeNull();
  });

  it('no reenvía recordatorio a una cita que ya lo tiene marcado', async () => {
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-repetido@example.com');
    await prisma.appointment.update({ where: { id: appointment.id }, data: { reminderSentAt: NOW } });
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('no envía recordatorio a una cita PENDING aunque esté en la ventana horaria', async () => {
    const seed = await seedDemoBusiness(prisma);
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    const created = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start,
      customerName: 'Cliente pendiente',
      customerPhone: '+34688000031',
      customerEmail: 'recordatorio-pendiente@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.91',
      now: NOW,
    });
    if (!created.ok) {
      throw new Error(`No se pudo crear la cita de prueba: ${created.reason}`);
    }
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('procesa varias citas de negocios distintos en la misma pasada', async () => {
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    await createConfirmedAppointment(start, 'recordatorio-multi-a@example.com');
    const emailSender = new FakeEmailSender();

    // Segundo negocio con su propia cita en la misma ventana.
    const otherBusiness = await prisma.business.create({
      data: { slug: 'otro-negocio-recordatorio', name: 'Otro Negocio', type: 'OTHER', email: 'otro@example.com' },
    });
    const otherEmployee = await prisma.employee.create({
      data: { businessId: otherBusiness.id, name: 'Empleado ajeno', active: true },
    });
    const otherService = await prisma.service.create({
      data: { businessId: otherBusiness.id, name: 'Servicio ajeno', durationMinutes: 30, priceCents: 1000 },
    });
    await prisma.serviceEmployee.create({ data: { serviceId: otherService.id, employeeId: otherEmployee.id } });
    await prisma.workingHours.create({ data: { employeeId: otherEmployee.id, weekday: start.getUTCDay(), startMinute: 0, endMinute: 1440 } });
    const otherCustomer = await prisma.customer.create({
      data: { businessId: otherBusiness.id, name: 'Cliente ajeno', phone: '+34688000032', email: 'recordatorio-multi-b@example.com' },
    });
    await prisma.appointment.create({
      data: {
        businessId: otherBusiness.id,
        serviceId: otherService.id,
        employeeId: otherEmployee.id,
        customerId: otherCustomer.id,
        customerName: otherCustomer.name,
        customerPhone: otherCustomer.phone,
        customerEmail: otherCustomer.email,
        start,
        end: new Date(start.getTime() + 30 * 60 * 1000),
        status: 'CONFIRMED',
      },
    });

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(2);
    expect(emailSender.sent.map((m) => m.to).sort()).toEqual(
      ['recordatorio-multi-a@example.com', 'recordatorio-multi-b@example.com'].sort()
    );
  });

  it('no envía ni marca reminderSentAt si el envío de email falla', async () => {
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-fallo@example.com');
    const failingSender = {
      send: async () => {
        throw new Error('fallo de red');
      },
    };

    const result = await sendDueReminders(prisma, { now: NOW, emailSender: failingSender });

    expect(result.sent).toBe(0);

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).toBeNull();
  });

  it('incluye una cita cuyo inicio cae exactamente en now+24h (dentro de la ventana, entre ambos límites)', async () => {
    const start = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-limite-inferior@example.com');
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(1);
    expect(emailSender.sent).toHaveLength(1);

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).not.toBeNull();
  });

  it('incluye una cita cuyo inicio cae exactamente en now+23h (nuevo límite inferior de la ventana)', async () => {
    const start = new Date(NOW.getTime() + 23 * 60 * 60 * 1000);
    const { appointment } = await createDirectConfirmedAppointment(start, 'recordatorio-limite-inferior-ampliado@example.com');
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(1);
    expect(emailSender.sent).toHaveLength(1);

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).not.toBeNull();
  });

  it('excluye una cita cuyo inicio cae exactamente en now+22h (justo por debajo del nuevo límite inferior)', async () => {
    const start = new Date(NOW.getTime() + 22 * 60 * 60 * 1000);
    const { appointment } = await createDirectConfirmedAppointment(start, 'recordatorio-limite-inferior-fuera@example.com');
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).toBeNull();
  });

  it('excluye una cita cuyo inicio cae exactamente en now+25h (límite superior de la ventana, exclusivo)', async () => {
    const start = new Date(NOW.getTime() + 25 * 60 * 60 * 1000);
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-limite-superior@example.com');
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).toBeNull();
  });

  it('excluye una cita cuyo inicio está claramente por debajo de la ventana (now+20h)', async () => {
    // Inserción directa (sin pasar por createAppointment) para no depender del
    // horario laboral del empleado: aquí solo se prueba el límite de la
    // ventana de sendDueReminders, no las reglas de disponibilidad.
    const seed = await seedDemoBusiness(prisma);
    const start = new Date(NOW.getTime() + 20 * 60 * 60 * 1000);
    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente muy pronto',
        phone: '+34688000033',
        email: 'recordatorio-muy-pronto@example.com',
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
        start,
        end: new Date(start.getTime() + 30 * 60 * 1000),
        status: 'CONFIRMED',
      },
    });
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('dos ejecuciones concurrentes de sendDueReminders no duplican el envío de la misma cita', async () => {
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-concurrente@example.com');
    const emailSender = new FakeEmailSender();

    const [resultA, resultB] = await Promise.all([
      sendDueReminders(prisma, { now: NOW, emailSender }),
      sendDueReminders(prisma, { now: NOW, emailSender }),
    ]);

    expect(resultA.sent + resultB.sent).toBe(1);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('recordatorio-concurrente@example.com');

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).not.toBeNull();
  });

  it('no envía ni marca reminderSentAt si la cita fue cancelada entre la selección (findMany) y el reclamo atómico', async () => {
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-cancelada-en-carrera@example.com');
    const emailSender = new FakeEmailSender();

    // Simula la carrera: findMany devuelve una foto de la cita tomada
    // mientras seguía CONFIRMED (tal y como la habría seleccionado en un
    // escenario real justo antes de que otra petición la cancelase), pero
    // en la base de datos ya está CANCELLED cuando se ejecuta el reclamo
    // atómico (updateMany). Sin el filtro status: 'CONFIRMED' en el where
    // del claim, este mock reproduciría el envío indebido de un
    // recordatorio a una cita ya cancelada.
    const staleSnapshot = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      include: { service: true, employee: true, business: true },
    });
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: 'CANCELLED' } });
    const findManySpy = vi.spyOn(prisma.appointment, 'findMany').mockResolvedValueOnce([staleSnapshot] as never);

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    findManySpy.mockRestore();

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).toBeNull();
    expect(refreshed.status).toBe('CANCELLED');
  });

  it('marca reminderSentAt sin enviar email si la cita CONFIRMED no tiene email de cliente (alta manual sin contacto)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    const customer = await prisma.customer.create({
      data: { businessId: seed.business.id, name: 'Cliente manual sin email', phone: null, email: null },
    });
    const appointment = await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: null,
        customerEmail: null,
        start,
        end: new Date(start.getTime() + 30 * 60 * 1000),
        status: 'CONFIRMED',
        source: 'MANUAL',
      },
    });
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    // Se marca como "recordada" aunque no se haya enviado nada: no hay a
    // quién recordar, y así no se reintenta en cada pasada futura del cron.
    expect(refreshed.reminderSentAt).not.toBeNull();
  });
});
