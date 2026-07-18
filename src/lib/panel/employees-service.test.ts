import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import {
  listEmployeesForBusiness,
  getEmployeeForBusiness,
  createEmployeeForBusiness,
  updateEmployeeForBusiness,
} from './employees-service';

describe('createEmployeeForBusiness', () => {
  it('crea el empleado con los servicios indicados', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createEmployeeForBusiness(prisma, seed.business.id, {
      name: 'Laura Gómez',
      color: '#00AA00',
      active: true,
      serviceIds: [seed.services.corteMujer.id],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const withServices = await getEmployeeForBusiness(prisma, seed.business.id, result.employee.id);
      expect(withServices?.services.map((s) => s.serviceId)).toEqual([seed.services.corteMujer.id]);
    }
  });

  it('devuelve INVALID_INPUT si el color no es un hex válido', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createEmployeeForBusiness(prisma, seed.business.id, {
      name: 'Laura Gómez',
      color: 'rojo',
      active: true,
      serviceIds: [],
    });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });
});

describe('listEmployeesForBusiness', () => {
  it('devuelve solo los empleados del negocio indicado', async () => {
    const seed = await seedDemoBusiness(prisma);
    const employees = await listEmployeesForBusiness(prisma, seed.business.id);
    expect(employees.every((e) => e.businessId === seed.business.id)).toBe(true);
    expect(employees.length).toBeGreaterThanOrEqual(2);
  });
});

describe('getEmployeeForBusiness', () => {
  it('devuelve null si el empleado pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-empleado', name: 'Otro', type: 'OTHER' } });

    const employee = await getEmployeeForBusiness(prisma, otherBusiness.id, seed.employees.marta.id);

    expect(employee).toBeNull();
  });
});

describe('updateEmployeeForBusiness', () => {
  it('actualiza datos y reemplaza los servicios asociados', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await updateEmployeeForBusiness(prisma, seed.business.id, seed.employees.carlos.id, {
      name: 'Carlos Núñez (actualizado)',
      color: '#123456',
      active: true,
      serviceIds: [seed.services.coloracion.id],
    });

    expect(result.ok).toBe(true);
    const withServices = await getEmployeeForBusiness(prisma, seed.business.id, seed.employees.carlos.id);
    expect(withServices?.name).toBe('Carlos Núñez (actualizado)');
    expect(withServices?.services.map((s) => s.serviceId)).toEqual([seed.services.coloracion.id]);
  });

  it('devuelve NOT_FOUND si el empleado pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-empleado-2', name: 'Otro', type: 'OTHER' } });

    const result = await updateEmployeeForBusiness(prisma, otherBusiness.id, seed.employees.marta.id, {
      name: 'Hackeo',
      color: '#000000',
      active: true,
      serviceIds: [],
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('desactiva un empleado del negocio (toggle active)', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await updateEmployeeForBusiness(prisma, seed.business.id, seed.employees.marta.id, {
      name: seed.employees.marta.name,
      color: seed.employees.marta.color,
      active: false,
      serviceIds: [seed.services.corteMujer.id],
    });

    expect(result.ok).toBe(true);
    const withServices = await getEmployeeForBusiness(prisma, seed.business.id, seed.employees.marta.id);
    expect(withServices?.active).toBe(false);
  });

  it('no permite desactivar (ni modificar) un empleado de otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-empleado-3', name: 'Otro', type: 'OTHER' } });

    const result = await updateEmployeeForBusiness(prisma, otherBusiness.id, seed.employees.carlos.id, {
      name: 'Hackeo',
      color: '#000000',
      active: false,
      serviceIds: [],
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    const untouched = await getEmployeeForBusiness(prisma, seed.business.id, seed.employees.carlos.id);
    expect(untouched?.active).toBe(true);
    expect(untouched?.name).toBe('Carlos Núñez');
  });
});
