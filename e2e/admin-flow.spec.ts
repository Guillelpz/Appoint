import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { getDemoSuperAdminCredentials } from '../src/lib/seed/demo-superadmin';
import { getSupabaseAdminAuthClient } from '../src/lib/supabase/admin';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

let createdBusinessId: string | undefined;
let createdUserId: string | undefined;

test.afterAll(async () => {
  if (createdBusinessId) {
    await prisma.membership.deleteMany({ where: { businessId: createdBusinessId } });
    await prisma.business.deleteMany({ where: { id: createdBusinessId } });
  }
  if (createdUserId) {
    const admin = getSupabaseAdminAuthClient();
    await admin.deleteUser(createdUserId).catch(() => {});
  }
  await prisma.$disconnect();
});

test('super-admin: alta de negocio, invitación del dueño y suspensión bloquea su panel', async ({ page, browser }) => {
  const { email: adminEmail, password: adminPassword } = getDemoSuperAdminCredentials();
  const slug = `negocio-e2e-${Date.now()}`;
  const ownerEmail = `dueno-e2e-${Date.now()}@example.com`;

  // 1. Login del super-admin.
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Contraseña').fill(adminPassword);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // El login del super-admin y su propio /admin/login comparten el mismo
  // <h1>"Panel de super-administración"</h1> (ver AdminLoginPage y
  // AdminDashboardPage), así que comprobar solo ese heading no distinguiría
  // si la redirección tras el login ya se completó o si seguimos en la
  // página de login (el signInAdminAction es un Server Action asíncrono; si
  // navegáramos a /admin/negocios antes de que termine, esa navegación
  // cancelaría la petición en curso y el login nunca llegaría a aplicarse).
  // Se espera primero a la URL exacta del dashboard (no matchea
  // /admin/login ni /admin/negocios) para asegurar que la redirección ya
  // ocurrió antes de seguir.
  await expect(page).toHaveURL(/\/admin$/, { timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Panel de super-administración' })).toBeVisible({ timeout: 10000 });

  // 2. Alta de negocio desde /admin/negocios.
  await page.goto('/admin/negocios');
  await page.getByLabel('Nombre').fill('Negocio E2E');
  await page.getByLabel('Slug').fill(slug);
  // El email de contacto se deja en blanco a propósito (es opcional); solo
  // se rellena el email del dueño, el obligatorio para la invitación.
  await page.getByLabel('Email del dueño').fill(ownerEmail);
  await page.getByRole('button', { name: 'Crear negocio' }).click();

  await expect(page.getByText('Negocio E2E')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('tr', { hasText: 'Negocio E2E' }).getByText('Activo')).toBeVisible();

  const business = await prisma.business.findUniqueOrThrow({ where: { slug } });
  createdBusinessId = business.id;
  const membership = await prisma.membership.findFirstOrThrow({ where: { businessId: business.id, role: 'OWNER' } });
  createdUserId = membership.userId;

  // 3. Completa la invitación como dueño: genera el token real (sin
  // disparar ningún email, igual que hace generateLink en /admin/negocios)
  // y navega directamente con él, en una pestaña aparte para no perder la
  // sesión de super-admin de la pestaña principal.
  const admin = getSupabaseAdminAuthClient();
  const { data: linkData, error: linkError } = await admin.generateLink({ type: 'invite', email: ownerEmail });
  if (linkError || !linkData.properties) {
    throw new Error(`No se pudo generar el enlace de invitación en el test: ${linkError?.message}`);
  }
  const tokenHash = linkData.properties.hashed_token;

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto(`/panel/invitacion?token_hash=${tokenHash}`);
  // getByLabel hace matching por substring por defecto: sin `exact: true`,
  // 'Contraseña' también matchea la etiqueta 'Repite la contraseña' (falla
  // en strict mode con 2 elementos). El segundo selector no necesita
  // `exact` porque ninguna otra etiqueta de este formulario lo contiene.
  await ownerPage.getByLabel('Contraseña', { exact: true }).fill('contraseña-e2e-123');
  await ownerPage.getByLabel('Repite la contraseña').fill('contraseña-e2e-123');
  await ownerPage.getByRole('button', { name: 'Guardar y entrar' }).click();
  await expect(ownerPage.getByRole('heading', { name: 'Agenda' })).toBeVisible({ timeout: 10000 });

  // 4. El super-admin suspende el negocio; el dueño, con sesión YA activa,
  // deja de poder entrar al panel (cierra el bug de requirePanelSession).
  await page.locator('tr', { hasText: 'Negocio E2E' }).getByRole('button', { name: 'Suspender' }).click();
  await expect(page.locator('tr', { hasText: 'Negocio E2E' }).getByText('Suspendido')).toBeVisible();

  await ownerPage.goto('/panel');
  await expect(ownerPage).toHaveURL(/\/panel\/login/);
  await expect(ownerPage.getByText('suspendido', { exact: false })).toBeVisible({ timeout: 10000 });

  await ownerContext.close();
});
