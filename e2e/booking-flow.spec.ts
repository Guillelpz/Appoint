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
  const emptyState = page.getByText('No hay huecos disponibles este día.');

  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) {
      // Espera determinista: `loading=true` se activa en un useEffect DESPUÉS
      // del click, así que esperar solo a que el spinner esté oculto podría
      // leer los huecos del día anterior. La respuesta del Server Action solo
      // llega después de que el efecto haya desmontado ese estado stale.
      const responsePromise = page.waitForResponse((r) => r.request().method() === 'POST');
      await dayButtons.nth(attempt).click();
      await responsePromise;
    }
    // Tras la respuesta, espera al render del nuevo estado (huecos o vacío)
    // antes de decidir. En el día inicial (fetch en el mount, sin click previo)
    // no hay estado stale, por lo que esta espera basta por sí sola.
    await expect(slotButton.or(emptyState).first()).toBeVisible({ timeout: 10000 });
    if ((await slotButton.count()) > 0) {
      break;
    }
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

  // Idempotencia: revisitar el mismo enlace de confirmación (reload/back)
  // tras confirmar con éxito debe seguir mostrando la pantalla de éxito,
  // no la de error, y no debe alterar el estado en BD.
  await page.goto(`/confirmar/${appointment.confirmToken}`);
  await expect(page.getByRole('heading', { name: '¡Cita confirmada!' })).toBeVisible();

  const stillConfirmed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
  expect(stillConfirmed.status).toBe('CONFIRMED');

  await page.goto(`/cita/${appointment.cancelToken}`);
  await page.getByRole('button', { name: 'Cancelar cita' }).click();

  await expect(page.getByText(/cancelada/i)).toBeVisible();

  const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
  expect(cancelled.status).toBe('CANCELLED');
});
