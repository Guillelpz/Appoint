import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { getDemoOwnerCredentials } from '../src/lib/seed/demo-owner';
import { getLocalDateString } from '../src/lib/booking/timezone';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('login del panel y aprobación manual de una cita pendiente', async ({ page }) => {
  const business = await prisma.business.update({
    where: { slug: 'salon-aura' },
    data: { manualApproval: true },
  });
  const service = await prisma.service.findFirstOrThrow({ where: { businessId: business.id } });
  const employee = await prisma.employee.findFirstOrThrow({ where: { businessId: business.id } });
  const uniqueEmail = `pendiente-e2e-${Date.now()}@example.com`;
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: 'Cliente Pendiente E2E', phone: '+34600777888', email: uniqueEmail },
  });
  const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const appointment = await prisma.appointment.create({
    data: {
      businessId: business.id,
      serviceId: service.id,
      employeeId: employee.id,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      start,
      end: new Date(start.getTime() + 30 * 60 * 1000),
      status: 'PENDING',
      emailVerifiedAt: new Date(),
    },
  });

  const { email, password } = getDemoOwnerCredentials();

  await page.goto('/panel/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible({ timeout: 10000 });

  // La cita creada empieza dentro de 3 días: navega directamente a esa
  // fecha en vez de depender de la vista por defecto (hoy).
  const localDate = getLocalDateString(start);
  await page.goto(`/panel?date=${localDate}`);

  await expect(page.getByText('Cliente Pendiente E2E')).toBeVisible();
  await expect(page.getByText('Pendiente de aprobación')).toBeVisible();

  await page.locator('li', { hasText: 'Cliente Pendiente E2E' }).getByRole('button', { name: 'Aprobar' }).click();

  await expect(page.getByText('Confirmada')).toBeVisible();

  const confirmed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
  expect(confirmed.status).toBe('CONFIRMED');
});
