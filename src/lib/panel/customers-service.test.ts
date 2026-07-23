import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from '@/lib/booking/create-appointment';
import {
  listCustomersForBusiness,
  getCustomerDetail,
  addCustomerToBlacklist,
  removeCustomerFromBlacklist,
} from './customers-service';

const NOW = new Date('2026-07-13T08:00:00.000Z');

async function bookForCustomer(businessId: string, serviceId: string, employeeId: string, email: string, start: Date) {
  const result = await createAppointment(prisma, {
    businessId,
    serviceId,
    employeeId,
    start,
    customerName: 'Cliente listado',
    customerPhone: '+34688000090',
    customerEmail: email,
    source: 'WEB',
    ipAddress: '198.51.100.95',
    now: NOW,
  });
  if (!result.ok) throw new Error(`setup falló: ${result.reason}`);
  return result.appointment;
}

describe('listCustomersForBusiness', () => {
  it('incluye el número de citas, la última cita y si está en la lista negra', async () => {
    const seed = await seedDemoBusiness(prisma);
    await bookForCustomer(seed.business.id, seed.services.corteHombre.id, seed.employees.marta.id, 'listado@example.com', new Date('2026-07-14T08:00:00.000Z'));

    const result = await listCustomersForBusiness(prisma, seed.business.id);
    const target = result.items.find((c) => c.email === 'listado@example.com');

    expect(target?.appointmentCount).toBe(1);
    expect(target?.lastAppointmentStart).toEqual(new Date('2026-07-14T08:00:00.000Z'));
    expect(target?.blacklisted).toBe(false);
  });

  it('pagina de 20 en 20 y calcula hasNextPage/hasPreviousPage', async () => {
    const seed = await seedDemoBusiness(prisma);
    const before = await prisma.customer.count({ where: { businessId: seed.business.id } });
    for (let i = 0; i < 25; i++) {
      await prisma.customer.create({
        data: { businessId: seed.business.id, name: `Cliente paginado ${i}`, phone: `+3460000${String(i).padStart(4, '0')}`, email: null },
      });
    }
    const total = before + 25;

    const page1 = await listCustomersForBusiness(prisma, seed.business.id, 1);
    expect(page1.items).toHaveLength(20);
    expect(page1.hasPreviousPage).toBe(false);
    expect(page1.hasNextPage).toBe(true);

    const lastPage = Math.ceil(total / 20);
    const pageLast = await listCustomersForBusiness(prisma, seed.business.id, lastPage);
    expect(pageLast.hasNextPage).toBe(false);
    expect(pageLast.hasPreviousPage).toBe(true);
  });

  it('devuelve una página vacía sin romper si page está fuera de rango', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await listCustomersForBusiness(prisma, seed.business.id, 999);

    expect(result.items).toEqual([]);
    expect(result.hasNextPage).toBe(false);
  });
});

describe('addCustomerToBlacklist / removeCustomerFromBlacklist', () => {
  it('bloquea y desbloquea a un cliente por su email', async () => {
    const seed = await seedDemoBusiness(prisma);
    const appointment = await bookForCustomer(seed.business.id, seed.services.corteHombre.id, seed.employees.marta.id, 'bloqueo@example.com', new Date('2026-07-14T09:00:00.000Z'));

    const added = await addCustomerToBlacklist(prisma, seed.business.id, appointment.customerId, 'Motivo de prueba');
    expect(added.ok).toBe(true);

    const detail = await getCustomerDetail(prisma, seed.business.id, appointment.customerId);
    expect(detail?.blacklisted).toBe(true);

    await removeCustomerFromBlacklist(prisma, seed.business.id, appointment.customerId);
    const detailAfter = await getCustomerDetail(prisma, seed.business.id, appointment.customerId);
    expect(detailAfter?.blacklisted).toBe(false);
  });

  it('no bloquea/desbloquea entradas de la lista negra de otros clientes con contacto NULL', async () => {
    // Regresión: si el filtro de blacklist usara {phone: null} sin excluir
    // los NULL explícitamente, borraría entradas de OTROS clientes sin
    // teléfono por error.
    const seed = await seedDemoBusiness(prisma);
    const customerSinTelefono = await prisma.customer.create({
      data: { businessId: seed.business.id, name: 'Cliente sin teléfono', phone: null, email: 'sin-telefono@example.com' },
    });
    const otraEntradaBlacklist = await prisma.blacklistEntry.create({
      data: { businessId: seed.business.id, phone: null, email: 'otro-bloqueado@example.com', reason: 'otro cliente' },
    });

    await removeCustomerFromBlacklist(prisma, seed.business.id, customerSinTelefono.id);

    const stillThere = await prisma.blacklistEntry.findUnique({ where: { id: otraEntradaBlacklist.id } });
    expect(stillThere).not.toBeNull();
  });

  it('devuelve NO_CONTACT_INFO si el cliente no tiene teléfono ni email', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customer = await prisma.customer.create({
      data: { businessId: seed.business.id, name: 'Cliente sin contacto', phone: null, email: null },
    });

    const result = await addCustomerToBlacklist(prisma, seed.business.id, customer.id, null);

    expect(result).toEqual({ ok: false, reason: 'NO_CONTACT_INFO' });
  });

  it('devuelve NOT_FOUND y no crea ninguna entrada si el cliente pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-blacklist-add', name: 'Otro', type: 'OTHER' } });
    const customer = await prisma.customer.create({
      data: { businessId: seed.business.id, name: 'Cliente ajeno', phone: '+34600999888', email: 'ajeno-add@example.com' },
    });

    const before = await prisma.blacklistEntry.count();
    const result = await addCustomerToBlacklist(prisma, otherBusiness.id, customer.id, 'motivo');
    const after = await prisma.blacklistEntry.count();

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(after).toBe(before);
  });

  it('devuelve NOT_FOUND y no borra entradas de otro negocio si el cliente pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-blacklist-remove', name: 'Otro', type: 'OTHER' } });
    const customer = await prisma.customer.create({
      data: { businessId: seed.business.id, name: 'Cliente ajeno', phone: '+34600999777', email: 'ajeno-remove@example.com' },
    });
    const entry = await prisma.blacklistEntry.create({
      data: { businessId: seed.business.id, phone: customer.phone, email: customer.email, reason: 'motivo' },
    });

    const result = await removeCustomerFromBlacklist(prisma, otherBusiness.id, customer.id);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    const stillThere = await prisma.blacklistEntry.findUnique({ where: { id: entry.id } });
    expect(stillThere).not.toBeNull();
  });
});

describe('getCustomerDetail', () => {
  it('devuelve null si el cliente pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-cliente', name: 'Otro', type: 'OTHER' } });
    const customer = await prisma.customer.create({ data: { businessId: seed.business.id, name: 'X', phone: '+34600000000', email: 'x@example.com' } });

    const detail = await getCustomerDetail(prisma, otherBusiness.id, customer.id);

    expect(detail).toBeNull();
  });
});
