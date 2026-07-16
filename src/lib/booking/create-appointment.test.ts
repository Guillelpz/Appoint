import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from './create-appointment';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z'); // 10:00 local, martes, tramo de Marta

describe('createAppointment', () => {
  it('crea una cita PENDING cuando se especifica el empleado', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Ana López',
      customerPhone: '+34666000001',
      customerEmail: 'ana@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.1',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('PENDING');
      expect(result.appointment.employeeId).toBe(seed.employees.marta.id);
      expect(result.appointment.confirmToken).toBeTruthy();
      expect(result.appointment.cancelToken).toBeTruthy();

      const customer = await prisma.customer.findUnique({
        where: { businessId_email: { businessId: seed.business.id, email: 'ana@example.com' } },
      });
      expect(customer).not.toBeNull();
    }
  });

  it('con "cualquier profesional" asigna al empleado con menos carga', async () => {
    const seed = await seedDemoBusiness(prisma);
    const teatimeStart = new Date('2026-07-14T14:00:00.000Z'); // 16:00 local, ambos disponibles

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      start: teatimeStart,
      customerName: 'Bea Ruiz',
      customerPhone: '+34666000002',
      customerEmail: 'bea@example.com',
      source: 'QR',
      ipAddress: '198.51.100.2',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Ninguno tiene carga previa: gana el de menor id en el criterio de desempate
      expect([seed.employees.marta.id, seed.employees.carlos.id]).toContain(result.appointment.employeeId);
    }
  });

  it('rechaza con RATE_LIMITED tras 5 intentos en la última hora desde la misma IP', async () => {
    const seed = await seedDemoBusiness(prisma);

    for (let i = 0; i < 5; i++) {
      await prisma.bookingAttempt.create({
        data: { businessId: seed.business.id, ipAddress: '198.51.100.3', createdAt: NOW },
      });
    }

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Carla Díaz',
      customerPhone: '+34666000003',
      customerEmail: 'carla@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.3',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'RATE_LIMITED' });
  });

  it('rechaza con BLACKLISTED si el email está en la lista negra', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.blacklistEntry.create({
      data: { businessId: seed.business.id, email: 'vetado@example.com', reason: 'No presentado' },
    });

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Vetado',
      customerPhone: '+34666000004',
      customerEmail: 'vetado@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.4',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'BLACKLISTED' });
  });

  it('rechaza con CUSTOMER_LIMIT_REACHED si el cliente ya tiene 2 citas activas', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente saturado',
        phone: '+34666000005',
        email: 'saturado@example.com',
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
          start: new Date('2026-07-14T10:00:00.000Z'),
          end: new Date('2026-07-14T10:35:00.000Z'),
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
          createdAt: NOW,
        },
      ],
    });

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      source: 'WEB',
      ipAddress: '198.51.100.5',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'CUSTOMER_LIMIT_REACHED' });
  });

  it('rechaza con CUSTOMER_OVERLAP si el cliente ya tiene una cita activa que solapa', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente solapado',
        phone: '+34666000006',
        email: 'solapado@example.com',
      },
    });

    await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.carlos.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: VALID_START,
        end: new Date(VALID_START.getTime() + 35 * 60 * 1000),
        status: 'CONFIRMED',
      },
    });

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START, // mismo horario exacto, otro empleado, mismo cliente
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      source: 'WEB',
      ipAddress: '198.51.100.6',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'CUSTOMER_OVERLAP' });
  });

  it('rechaza con EMPLOYEE_UNAVAILABLE si el empleado indicado no tiene ese hueco libre', async () => {
    const seed = await seedDemoBusiness(prisma);
    const outsideHours = new Date('2026-07-14T04:00:00.000Z'); // 06:00 local, fuera de horario

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: outsideHours,
      customerName: 'Fuera de horario',
      customerPhone: '+34666000007',
      customerEmail: 'fuera@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.7',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'EMPLOYEE_UNAVAILABLE' });
  });

  it('rechaza con NO_EMPLOYEE_AVAILABLE si nadie tiene ese hueco libre y no se especificó empleado', async () => {
    const seed = await seedDemoBusiness(prisma);
    const outsideHours = new Date('2026-07-14T04:00:00.000Z');

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      start: outsideHours,
      customerName: 'Sin nadie',
      customerPhone: '+34666000008',
      customerEmail: 'sinnadie@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.8',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'NO_EMPLOYEE_AVAILABLE' });
  });

  it('detecta colisión de hueco ante una condición de carrera (red de seguridad del índice único)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const raceStart = new Date('2026-07-14T14:00:00.000Z'); // 16:00 local, bloque de Carlos

    const attempt = (phone: string, email: string) =>
      createAppointment(prisma, {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.carlos.id,
        start: raceStart,
        customerName: 'Cliente carrera',
        customerPhone: phone,
        customerEmail: email,
        source: 'WEB',
        ipAddress: '198.51.100.9',
        now: NOW,
      });

    const [resultA, resultB] = await Promise.all([
      attempt('+34666000009', 'carrera-a@example.com'),
      attempt('+34666000010', 'carrera-b@example.com'),
    ]);

    const results = [resultA, resultB];
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    if (!failed[0].ok) {
      // La petición perdedora puede recibir dos motivos igual de legítimos
      // según el entrelazado real de E/S entre las dos conexiones
      // concurrentes (no es determinista y no se puede forzar desde el test):
      // - SLOT_TAKEN: ambas superan la comprobación previa de disponibilidad
      //   antes de que cualquiera confirme, y la red de seguridad del índice
      //   único (employeeId, start) detecta el choque en el INSERT.
      // - EMPLOYEE_UNAVAILABLE: la perdedora se retrasa lo bastante como para
      //   que su propia comprobación previa de disponibilidad (fuera de la
      //   transacción) se ejecute después de que la otra ya haya confirmado,
      //   así que ve el hueco ocupado antes de intentar el INSERT.
      expect(['SLOT_TAKEN', 'EMPLOYEE_UNAVAILABLE']).toContain(failed[0].reason);
    }
  });

  it('rechaza con CUSTOMER_CONFLICT si el teléfono ya pertenece a otro cliente del negocio (sin falso SLOT_TAKEN)', async () => {
    const seed = await seedDemoBusiness(prisma);

    // Cliente existente con teléfono X y email A.
    await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente original',
        phone: '+34666000013',
        email: 'original@example.com',
      },
    });

    // Nueva reserva con el mismo teléfono X pero email B: el upsert por
    // businessId_email no encuentra al cliente y su create viola la
    // restricción única Customer businessId_phone. No debe etiquetarse
    // como SLOT_TAKEN: el hueco está realmente libre.
    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente conflicto',
      customerPhone: '+34666000013',
      customerEmail: 'otro-email@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.11',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'CUSTOMER_CONFLICT' });

    const appointmentCount = await prisma.appointment.count({
      where: { businessId: seed.business.id },
    });
    expect(appointmentCount).toBe(0);
  });

  it('libera una PENDING caducada que ocupa el mismo hueco exacto y crea la nueva cita (sin falso SLOT_TAKEN)', async () => {
    const seed = await seedDemoBusiness(prisma);

    const staleCustomer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente caducado',
        phone: '+34666000011',
        email: 'caducado@example.com',
      },
    });

    // PENDING creada hace 40 minutos (caducada). getAvailableSlots la ignora
    // (expiración perezosa), pero sigue con status PENDING en la tabla, así
    // que cumple el predicado del índice único parcial
    // WHERE status IN ('PENDING','CONFIRMED'): sin liberarla dentro de la
    // transacción, el INSERT chocaría con el índice y devolvería un
    // SLOT_TAKEN falso en un hueco realmente disponible.
    const staleAppointment = await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: staleCustomer.id,
        customerName: staleCustomer.name,
        customerPhone: staleCustomer.phone,
        customerEmail: staleCustomer.email,
        start: VALID_START,
        end: new Date(VALID_START.getTime() + 35 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(NOW.getTime() - 40 * 60 * 1000), // now - 40 min
      },
    });

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente nuevo',
      customerPhone: '+34666000012',
      customerEmail: 'nuevo@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.10',
      now: NOW,
    });

    expect(result.ok).toBe(true);

    const refreshedStale = await prisma.appointment.findUniqueOrThrow({
      where: { id: staleAppointment.id },
    });
    expect(refreshedStale.status).toBe('CANCELLED');
  });

  it('no permite reservar el mismo hueco de una PENDING con emailVerifiedAt fijado, y no la cancela aunque esté caducada por tiempo (bloqueo indefinido a la espera de aprobación del negocio)', async () => {
    const seed = await seedDemoBusiness(prisma);

    const staleCustomer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente verificado',
        phone: '+34666000014',
        email: 'verificado-create@example.com',
      },
    });

    const staleAppointment = await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: staleCustomer.id,
        customerName: staleCustomer.name,
        customerPhone: staleCustomer.phone,
        customerEmail: staleCustomer.email,
        start: VALID_START,
        end: new Date(VALID_START.getTime() + 35 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(NOW.getTime() - 40 * 60 * 1000), // caducada por tiempo
        emailVerifiedAt: new Date(NOW.getTime() - 35 * 60 * 1000), // pero ya verificada
      },
    });

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Otro cliente',
      customerPhone: '+34666000015',
      customerEmail: 'otro-verificado@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.12',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'EMPLOYEE_UNAVAILABLE' });

    const refreshedStale = await prisma.appointment.findUniqueOrThrow({ where: { id: staleAppointment.id } });
    expect(refreshedStale.status).toBe('PENDING');
  });

  it('rechaza con BUSINESS_NOT_FOUND si el negocio no existe', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createAppointment(prisma, {
      businessId: 'negocio-inexistente',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Sin negocio',
      customerPhone: '+34666000100',
      customerEmail: 'sinnegocio@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.100',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'BUSINESS_NOT_FOUND' });

    const appointmentCount = await prisma.appointment.count();
    expect(appointmentCount).toBe(0);
  });

  it('rechaza con SERVICE_NOT_FOUND si el serviceId pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({
      data: { slug: 'otro-negocio-create', name: 'Otro Negocio', type: 'OTHER' },
    });
    const otherService = await prisma.service.create({
      data: { businessId: otherBusiness.id, name: 'Servicio ajeno', durationMinutes: 30, priceCents: 1000 },
    });

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: otherService.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Servicio ajeno',
      customerPhone: '+34666000101',
      customerEmail: 'servicioajeno@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.101',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'SERVICE_NOT_FOUND' });

    const appointmentCount = await prisma.appointment.count({ where: { businessId: seed.business.id } });
    expect(appointmentCount).toBe(0);
  });

  it('rechaza con EMPLOYEE_UNAVAILABLE si el empleado indicado no presta ese servicio', async () => {
    const seed = await seedDemoBusiness(prisma);
    // 16:00 local (dentro del horario de tarde de Carlos), para que el hueco
    // esté realmente libre por agenda: lo único que debe bloquearlo es que
    // Carlos no presta coloración (comprueba el gap de F1, no una simple
    // colisión de horario).
    const carlosWorkingStart = new Date('2026-07-14T14:00:00.000Z');

    // La coloración solo la presta Marta, no Carlos.
    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.coloracion.id,
      employeeId: seed.employees.carlos.id,
      start: carlosWorkingStart,
      customerName: 'Empleado sin servicio',
      customerPhone: '+34666000102',
      customerEmail: 'sinservicio@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.102',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'EMPLOYEE_UNAVAILABLE' });

    const appointmentCount = await prisma.appointment.count({ where: { businessId: seed.business.id } });
    expect(appointmentCount).toBe(0);
  });

  it('rechaza con EMPLOYEE_UNAVAILABLE si el empleado indicado está inactivo', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.employee.update({ where: { id: seed.employees.marta.id }, data: { active: false } });

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Empleado inactivo',
      customerPhone: '+34666000103',
      customerEmail: 'inactivo@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.103',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'EMPLOYEE_UNAVAILABLE' });

    const appointmentCount = await prisma.appointment.count({ where: { businessId: seed.business.id } });
    expect(appointmentCount).toBe(0);
  });
});
