import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from './demo-business';

describe('seedDemoBusiness', () => {
  it('crea el negocio demo Salón Aura con 2 empleados y 4 servicios', async () => {
    const seed = await seedDemoBusiness(prisma);

    expect(seed.business.slug).toBe('salon-aura');
    expect(seed.business.name).toBe('Salón Aura');

    const employeeCount = await prisma.employee.count({ where: { businessId: seed.business.id } });
    expect(employeeCount).toBe(2);

    const serviceCount = await prisma.service.count({ where: { businessId: seed.business.id } });
    expect(serviceCount).toBe(4);

    const workingHoursCount = await prisma.workingHours.count({
      where: { employeeId: { in: [seed.employees.marta.id, seed.employees.carlos.id] } },
    });
    // Marta: 5 días x 2 tramos = 10; Carlos: 5 días x 1 tramo = 5
    expect(workingHoursCount).toBe(15);
  });

  it('vincula a Marta con los 4 servicios y a Carlos solo con 2', async () => {
    const seed = await seedDemoBusiness(prisma);

    const martaServiceCount = await prisma.serviceEmployee.count({
      where: { employeeId: seed.employees.marta.id },
    });
    expect(martaServiceCount).toBe(4);

    const carlosServiceCount = await prisma.serviceEmployee.count({
      where: { employeeId: seed.employees.carlos.id },
    });
    expect(carlosServiceCount).toBe(2);
  });
});
