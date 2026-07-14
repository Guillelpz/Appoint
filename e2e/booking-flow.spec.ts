import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('reservar, confirmar y cancelar una cita', async ({ page }) => {
  const uniqueEmail = `e2e-${Date.now()}@example.com`;

  await page.goto('/salon-aura');
  await expect(page.getByRole('heading', { name: 'Salón Aura' })).toBeVisible();

  await page.getByRole('button', { name: 'Reservar' }).first().click();
  await page.getByRole('button', { name: 'Cualquier profesional' }).click();

  // El motor solo abre huecos de martes a sábado: si el día por defecto (hoy)
  // no tiene huecos, avanza al día siguiente hasta encontrar uno disponible.
  const slotButton = page.locator('button', { hasText: /^\d{2}:\d{2}$/ }).first();
  const dayButtons = page.locator('button', { hasText: /^(dom|lun|mar|mié|jue|vie|sáb) \d{1,2} [a-zé]{3}$/ });

  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(page.getByText('Buscando huecos disponibles…')).toBeHidden({ timeout: 10000 });
    if ((await slotButton.count()) > 0) {
      break;
    }
    await dayButtons.nth(attempt + 1).click();
  }
  await slotButton.click();

  await page.getByLabel('Nombre y apellidos').fill('Cliente E2E');
  await page.getByLabel('Teléfono').fill('+34600999888');
  await page.getByLabel('Email').fill(uniqueEmail);
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();

  await expect(page.getByText('¡Reserva realizada!')).toBeVisible({ timeout: 10000 });

  const appointment = await prisma.appointment.findFirstOrThrow({ where: { customerEmail: uniqueEmail } });
  expect(appointment.status).toBe('PENDING');

  await page.goto(`/confirmar/${appointment.confirmToken}`);
  await expect(page.getByRole('heading', { name: '¡Cita confirmada!' })).toBeVisible();

  const confirmed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
  expect(confirmed.status).toBe('CONFIRMED');

  await page.goto(`/cita/${appointment.cancelToken}`);
  await page.getByRole('button', { name: 'Cancelar cita' }).click();

  await expect(page.getByText(/cancelada/i)).toBeVisible();

  const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
  expect(cancelled.status).toBe('CANCELLED');
});
