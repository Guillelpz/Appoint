import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { assignAnyAvailableEmployee } from './assignment';

describe('assignAnyAvailableEmployee', () => {
  it('asigna al empleado con menos carga ese día entre los disponibles en el hueco exacto', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');
    const requestedStart = new Date('2026-07-14T14:00:00.000Z'); // 16:00 local, ambos trabajan

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente carga',
        phone: '+34622000000',
        email: 'cliente-carga@example.com',
      },
    });

    // Marta ya tiene una cita confirmada esa mañana (fuera del hueco solicitado)
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

    const assignedEmployeeId = await assignAnyAvailableEmployee(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      start: requestedStart,
      now,
    });

    // Marta tiene 1 cita ese día, Carlos tiene 0: se asigna a Carlos
    expect(assignedEmployeeId).toBe(seed.employees.carlos.id);
  });

  it('devuelve null si ningún empleado tiene ese hueco disponible', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');
    const requestedStart = new Date('2026-07-14T04:00:00.000Z'); // 06:00 local, fuera de horario

    const assignedEmployeeId = await assignAnyAvailableEmployee(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      start: requestedStart,
      now,
    });

    expect(assignedEmployeeId).toBeNull();
  });
});
