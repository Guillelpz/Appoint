# Fase 6 — Panel de super-admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el panel de super-admin (`/admin`) de Appoint: login, alta real de negocios con invitación por email al dueño, activar/suspender negocios y un dashboard con dos métricas simples — cerrando además un bug real de Fase 5 (`requirePanelSession()` no comprobaba `Business.active`). El despliegue real (dominio, Vercel, Supabase producción) queda explícitamente fuera de este plan.

**Architecture:** Se añade una tabla `PlatformAdmin` (rol de plataforma independiente de `MembershipRole`) con su propio guardián de sesión (`requireAdminSession()`, mismo patrón que `requirePanelSession()`) y su propia zona protegida `/admin/**`, extendiendo el middleware existente sin duplicar la lógica de refresco de cookies de Supabase. El alta de negocio crea el `Business` + invita al dueño real vía Supabase Auth Admin API (`generateLink({type:'invite'})`) + `Membership` OWNER, todo en `src/lib/admin/platform-business-service.ts` (prefijo `Platform`/`Admin` para dejar claro que NO está tenant-scoped, a diferencia de `src/lib/panel/*`). La invitación al dueño usa el `hashed_token` de Supabase (nunca el `action_link` nativo — ver Tarea 9, incompatible con la configuración `flowType: 'pkce'` del cliente de navegador de este proyecto) contra una nueva ruta pública `/panel/invitacion`, cuyo Server Action verifica el token con `supabase.auth.verifyOtp()` y fija la contraseña con `supabase.auth.updateUser()`.

**Tech Stack:** Next.js 15.5.20 App Router + TypeScript + Prisma 6.19.3/PostgreSQL (Supabase) + Tailwind CSS + `@supabase/supabase-js` 2.110.7 + `@supabase/ssr` 0.12.3 + Resend/React Email + Vitest (TDD) + Playwright (e2e). Sin dependencias nuevas.

## Global Constraints

- UI y textos en español; identificadores en inglés; conversación con el usuario en español.
- Multi-tenancy: toda consulta a tablas de negocio filtra por `businessId` en la capa de aplicación (no RLS). Las funciones de `/admin` operan SIN `businessId` de sesión (alcance de plataforma) y llevan el prefijo `Platform`/`Admin` en su nombre para no confundirse con los servicios tenant-scoped de `src/lib/panel/*`.
- TDD obligatorio en lógica de negocio (motor de huecos, anti-fraude, estados de cita, y aquí: alta/activación de negocios, métricas, cierre del bug de sesión).
- Zona horaria: las citas se almacenan en UTC; los negocios son españoles (Europe/Madrid). Nunca construir límites de día/semana a mano — reutilizar `src/lib/booking/timezone.ts`.
- Tests: Vitest contra Postgres real (`TEST_DATABASE_URL`); `fileParallelism: false` no se toca. Playwright e2e levanta su propio servidor Next contra `appoint_test`.
- Ninguna función `sendXEmail` lanza nunca; se envía DESPUÉS de que la operación de negocio haya tenido éxito; `emailSender?: EmailSender` inyectable; en tests SIEMPRE `FakeEmailSender`, jamás `getEmailSender()`.
- Nada de check-then-act en transiciones de estado: claim atómico (`updateMany` con condición en el `where`) o justificación explícita si no aplica.
- Versiones ancladas exactas (sin caret); no se añaden dependencias nuevas en este plan.
- Comandos en PowerShell/Windows. Variables de entorno nuevas documentadas en `.env.example`.
- Commits en español, estilo del historial (`feat(admin): ...`, `fix(panel): ...`, `chore(admin): ...`, `docs: ...`).
- **Despliegue real fuera de alcance**: ninguna tarea de este plan toca dominio, Vercel ni Supabase de producción. La única mención es documental (Tarea 17, `CONTINUAR.md`).

---

## Investigación previa: mecánica real de `generateLink({ type: 'invite' })` (necesaria para las Tareas 9 y 12)

Verificado leyendo el código fuente instalado de `@supabase/auth-js@2.110.7` (`node_modules/.pnpm/@supabase+auth-js@2.110.7/.../src/GoTrueAdminApi.ts`, `src/lib/types.ts`, `src/GoTrueClient.ts`) y `@supabase/ssr@0.12.3` (`src/createBrowserClient.ts`):

1. `supabase.auth.admin.generateLink({ type: 'invite', email })` **crea el usuario de Supabase Auth en la misma llamada** (no hace falta `createUser` previo) y devuelve `{ data: { properties, user }, error }`. En caso de error, `data` NUNCA es `null`: sus campos (`properties`, `user`) se rellenan a `null` (tipo `RequestResultSafeDestructure`), así que `data.user`/`data.properties` son siempre accesibles sin riesgo de `TypeError`.
2. `data.properties` incluye `action_link`, `hashed_token`, `email_otp`, `redirect_to`, `verification_type`. `action_link` apunta a `{SUPABASE_URL}/auth/v1/verify?type=invite&token={hashed_token}&redirect_to={redirect_to}` — el endpoint GET propio de GoTrue, que al visitarse hace un 302 a `redirect_to` **añadiendo la sesión como fragmento de URL** (`#access_token=...&refresh_token=...&type=invite`), un grant **implícito**.
3. `createBrowserClient()` de `@supabase/ssr` (`src/createBrowserClient.ts:133`) fija `flowType: 'pkce'` de forma **no configurable** desde las opciones de este proyecto. `GoTrueClient._getSessionFromURL()` (`GoTrueClient.ts`, rama `case 'implicit':`) lanza `AuthPKCEGrantCodeExchangeError('Not a valid PKCE flow url.')` en cuanto detecta un callback implícito con `flowType === 'pkce'`. **Conclusión: usar `action_link` tal cual rompería la detección automática de sesión del cliente de navegador de este proyecto.**
4. En vez de depender de `action_link`, este plan usa `data.properties.hashed_token` directamente: nuestra propia ruta `/panel/invitacion?token_hash=...` (URL construida por nosotros, en nuestra plantilla de email) llama a `supabase.auth.verifyOtp({ token_hash, type: 'invite' })` — un método POST directo (no un flujo de redirect), soportado explícitamente por `EmailOtpType` (incluye `'invite'`) y `VerifyTokenHashParams`. Este método no pasa por ninguna comprobación de `flowType`.
5. **`verifyOtp` DEBE ejecutarse en un Server Action o Route Handler, nunca en un Server Component**: `src/lib/supabase/server.ts` ya documenta que Next.js prohíbe escribir cookies desde un Server Component, y `createSupabaseServerClient()` envuelve ese `set()` en un try/catch silencioso ahí. Si `verifyOtp` se llamara desde `page.tsx`, la sesión se guardaría solo en memoria para ese render y el navegador nunca recibiría la cookie.
6. El `token_hash` de una invitación es de un solo uso. Si `verifyOtp` tiene éxito pero un paso posterior (`updateUser`) falla, un reintento no puede volver a verificar el mismo token — por eso el Server Action de la Tarea 12 comprueba primero si ya hay sesión activa (`getUser()`) antes de intentar `verifyOtp` de nuevo.
7. No se pasa `options.redirectTo` a `generateLink` (es opcional): como no se usa `action_link`/`redirect_to` en ningún punto del flujo, evita también cualquier fricción con la lista de redirects permitidos de `supabase/config.toml` (`site_url = "http://127.0.0.1:3000"`, que no incluye `APP_BASE_URL=http://localhost:3000`).

---

### Task 1: Modelo `PlatformAdmin` + variables de entorno del super-admin demo

**Files:**
- Modify: `prisma/schema.prisma` (añadir modelo, tras `Membership`)
- Modify: `.env.example` (añadir bloque Fase 6)

**Interfaces:**
- Produces: modelo Prisma `PlatformAdmin { id, userId (único), createdAt }`, consumido por las Tareas 3 y 4.

- [ ] **Step 1: Añadir el modelo `PlatformAdmin` al schema**

En `prisma/schema.prisma`, justo después del modelo `Membership` (línea 85, tras el cierre `}`):

```prisma
// Rol de plataforma, independiente de MembershipRole (OWNER/STAFF son
// roles DENTRO de un negocio; PlatformAdmin es transversal a todos los
// negocios). Se modela como tabla propia, no como un valor más de
// MembershipRole, porque un PlatformAdmin no tiene necesariamente
// Membership en ningún negocio.
model PlatformAdmin {
  id        String   @id @default(uuid())
  userId    String   @unique
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Generar y aplicar la migración**

Run: `pnpm exec prisma migrate dev --name add_platform_admin`

Expected (resumen; el timestamp de la carpeta variará):
```
Applying migration `20260721_add_platform_admin`

The following migration(s) have been created and applied from new schema changes:

migrations/
  └─ 20260721_add_platform_admin/
    └─ migration.sql

Your database is now in sync with your schema.

✔ Generated Prisma Client (v6.19.3) ...
```

Abre el `migration.sql` generado y confirma que SOLO contiene un `CREATE TABLE "PlatformAdmin" (...)` y su índice único — no debe tocar el índice único parcial manual de `Appointment` (`(employeeId, start)` sobre citas activas, documentado en el comentario de `schema.prisma` sobre el modelo `Appointment`). Si el SQL propuesto incluyera una sentencia sobre ese índice, elimínala antes de aplicar.

- [ ] **Step 3: Confirmar que el cliente de Prisma tipa `platformAdmin`**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores (el `PrismaClient` regenerado ya expone `prisma.platformAdmin`).

- [ ] **Step 4: Añadir las variables de entorno del super-admin demo**

En `.env.example`, al final del archivo, tras el bloque `DEMO_OWNER_EMAIL`/`DEMO_OWNER_PASSWORD`:

```
# Fase 6 — super-admin demo (Supabase Auth). Solo dev/seed; nunca usar en
# producción. El alta del PRIMER super-admin es siempre por seed (no hay
# autoservicio de alta de super-admins).
DEMO_SUPERADMIN_EMAIL="superadmin@appoint.example"
DEMO_SUPERADMIN_PASSWORD="appoint-admin-2026"
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations .env.example
git commit -m "feat(db): añade modelo PlatformAdmin para el rol de super-admin"
```

---

### Task 2: Extraer el cliente Admin API de Supabase a un módulo compartido

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Modify: `src/lib/seed/demo-owner.ts`

**Interfaces:**
- Produces: `getSupabaseAdminAuthClient(): GoTrueAdminApi` (tipo devuelto por `createClient(...).auth.admin`), consumido por las Tareas 3 y 9.
- Consumes: nada nuevo (reubica código ya existente en `demo-owner.ts`).

- [ ] **Step 1: Crear el módulo compartido**

`src/lib/supabase/admin.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

// Cliente de la Admin API de Supabase Auth (service role): usado para altas
// de usuarios fuera del flujo normal de sign-up (seeds de dev/demo,
// invitación real de dueños desde /admin). Solo se importa desde código que
// corre en el servidor (seeds, Server Actions) — nunca se expone al cliente.
export function getSupabaseAdminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son necesarias para usar la Admin API de Supabase Auth. Revisa .env.'
    );
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin;
}
```

- [ ] **Step 2: Reutilizarlo desde `demo-owner.ts`**

En `src/lib/seed/demo-owner.ts`, sustituir:

```ts
import { createClient } from '@supabase/supabase-js';
import type { PrismaClient } from '@prisma/client';

export interface DemoOwnerCredentials {
  email: string;
  password: string;
}

export function getDemoOwnerCredentials(): DemoOwnerCredentials {
  return {
    email: process.env.DEMO_OWNER_EMAIL || 'dueno@salonaura.example',
    password: process.env.DEMO_OWNER_PASSWORD || 'appoint-demo-2026',
  };
}

function getSupabaseAdminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son necesarias para crear el usuario dueño demo (Supabase Auth admin API). Revisa .env.'
    );
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin;
}
```

por:

```ts
import type { PrismaClient } from '@prisma/client';
import { getSupabaseAdminAuthClient } from '@/lib/supabase/admin';

export interface DemoOwnerCredentials {
  email: string;
  password: string;
}

export function getDemoOwnerCredentials(): DemoOwnerCredentials {
  return {
    email: process.env.DEMO_OWNER_EMAIL || 'dueno@salonaura.example',
    password: process.env.DEMO_OWNER_PASSWORD || 'appoint-demo-2026',
  };
}
```

(el resto del archivo, `ensureDemoOwnerAuthUser` y `seedDemoOwnerMembership`, no cambia).

- [ ] **Step 3: Verificar que nada se rompe**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

Run: `pnpm test -- demo-owner`
Expected: `demo-owner.test.ts` sigue en verde (no llama a `ensureDemoOwnerAuthUser`, así que este refactor no afecta sus asserts).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/admin.ts src/lib/seed/demo-owner.ts
git commit -m "chore(supabase): extrae el cliente Admin API a un módulo compartido"
```

---

### Task 3: Seed idempotente del super-admin demo

**Files:**
- Create: `src/lib/seed/demo-superadmin.ts`
- Create: `src/lib/seed/demo-superadmin.test.ts`
- Modify: `prisma/seed.ts`
- Modify: `e2e/global-setup.ts`

**Interfaces:**
- Consumes: `getSupabaseAdminAuthClient()` (Tarea 2).
- Produces: `getDemoSuperAdminCredentials(): { email, password }`, `ensureDemoSuperAdminAuthUser(): Promise<{userId, email}>`, `seedDemoSuperAdminRecord(prisma, userId): Promise<void>` — consumidos por `prisma/seed.ts`, `e2e/global-setup.ts` y la Tarea 16 (e2e).

- [ ] **Step 1: Escribir el test (falla primero)**

`src/lib/seed/demo-superadmin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoSuperAdminRecord, getDemoSuperAdminCredentials } from './demo-superadmin';

describe('seedDemoSuperAdminRecord', () => {
  it('crea un registro PlatformAdmin para el userId indicado', async () => {
    await seedDemoSuperAdminRecord(prisma, 'user-demo-superadmin');

    const record = await prisma.platformAdmin.findUnique({ where: { userId: 'user-demo-superadmin' } });
    expect(record).not.toBeNull();
  });

  it('es idempotente: llamarlo dos veces no crea registros duplicados', async () => {
    await seedDemoSuperAdminRecord(prisma, 'user-demo-superadmin-2');
    await seedDemoSuperAdminRecord(prisma, 'user-demo-superadmin-2');

    const count = await prisma.platformAdmin.count({ where: { userId: 'user-demo-superadmin-2' } });
    expect(count).toBe(1);
  });
});

describe('getDemoSuperAdminCredentials', () => {
  it('devuelve un email y contraseña no vacíos (por defecto o de variables de entorno)', () => {
    const { email, password } = getDemoSuperAdminCredentials();
    expect(email.length).toBeGreaterThan(0);
    expect(password.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `pnpm test -- demo-superadmin`
Expected: FAIL — `Cannot find module './demo-superadmin'`.

- [ ] **Step 3: Implementar**

`src/lib/seed/demo-superadmin.ts`:

```ts
import type { PrismaClient } from '@prisma/client';
import { getSupabaseAdminAuthClient } from '@/lib/supabase/admin';

export interface DemoSuperAdminCredentials {
  email: string;
  password: string;
}

export function getDemoSuperAdminCredentials(): DemoSuperAdminCredentials {
  return {
    email: process.env.DEMO_SUPERADMIN_EMAIL || 'superadmin@appoint.example',
    password: process.env.DEMO_SUPERADMIN_PASSWORD || 'appoint-admin-2026',
  };
}

// Idempotente, mismo patrón que ensureDemoOwnerAuthUser: si el usuario ya
// existe (createUser devuelve error de email duplicado), lo busca en
// listUsers() y reutiliza su id.
export async function ensureDemoSuperAdminAuthUser(): Promise<{ userId: string; email: string }> {
  const { email, password } = getDemoSuperAdminCredentials();
  const admin = getSupabaseAdminAuthClient();

  const created = await admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) {
    return { userId: created.data.user.id, email };
  }

  const { data, error } = await admin.listUsers();
  if (error) {
    throw new Error(`No se pudo listar usuarios de Supabase Auth: ${error.message}`);
  }
  const existing = data.users.find((u) => u.email === email);
  if (!existing) {
    throw new Error(`No se pudo crear ni encontrar el super-admin demo (${email}): ${created.error?.message}`);
  }
  return { userId: existing.id, email };
}

export async function seedDemoSuperAdminRecord(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.platformAdmin.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `pnpm test -- demo-superadmin`
Expected: PASS (3 tests).

- [ ] **Step 5: Conectar el seed en `prisma/seed.ts`**

Reemplazar el contenido completo de `prisma/seed.ts` por:

```ts
import { PrismaClient } from '@prisma/client';
import { seedDemoBusiness } from '../src/lib/seed/demo-business';
import { ensureDemoOwnerAuthUser, seedDemoOwnerMembership, getDemoOwnerCredentials } from '../src/lib/seed/demo-owner';
import {
  ensureDemoSuperAdminAuthUser,
  seedDemoSuperAdminRecord,
  getDemoSuperAdminCredentials,
} from '../src/lib/seed/demo-superadmin';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const seed = await seedDemoBusiness(prisma);
  const owner = await ensureDemoOwnerAuthUser();
  await seedDemoOwnerMembership(prisma, seed.business.id, owner.userId);
  const { password } = getDemoOwnerCredentials();

  const superAdmin = await ensureDemoSuperAdminAuthUser();
  await seedDemoSuperAdminRecord(prisma, superAdmin.userId);
  const { password: superAdminPassword } = getDemoSuperAdminCredentials();

  console.log(`Negocio demo creado: ${seed.business.name} (${seed.business.slug})`);
  console.log(`Dueño demo del panel: ${owner.email} / ${password}`);
  console.log(`Super-admin demo: ${superAdmin.email} / ${superAdminPassword}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 6: Conectar el seed en `e2e/global-setup.ts`** (necesario para que la Tarea 16 pueda iniciar sesión como super-admin)

Reemplazar el contenido completo de `e2e/global-setup.ts` por:

```ts
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { seedDemoBusiness } from '../src/lib/seed/demo-business';
import { ensureDemoOwnerAuthUser, seedDemoOwnerMembership } from '../src/lib/seed/demo-owner';
import { ensureDemoSuperAdminAuthUser, seedDemoSuperAdminRecord } from '../src/lib/seed/demo-superadmin';

export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL no está definida en .env. Añádela antes de ejecutar los tests e2e.');
  }

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
    stdio: 'inherit',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations';
  `;
  if (tables.length > 0) {
    const quoted = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
  }

  const seed = await seedDemoBusiness(prisma);
  // El usuario de Supabase Auth vive en el schema `auth` (fuera de las
  // tablas `public` que se truncan arriba), así que ensureDemoOwnerAuthUser /
  // ensureDemoSuperAdminAuthUser son idempotentes entre ejecuciones de e2e:
  // reutilizan el mismo usuario. Los registros en `public` (Membership,
  // PlatformAdmin) sí se truncan cada vez, por eso se vuelven a crear siempre.
  const owner = await ensureDemoOwnerAuthUser();
  await seedDemoOwnerMembership(prisma, seed.business.id, owner.userId);

  const superAdmin = await ensureDemoSuperAdminAuthUser();
  await seedDemoSuperAdminRecord(prisma, superAdmin.userId);

  await prisma.$disconnect();
}
```

- [ ] **Step 7: Verificar**

Run: `pnpm test`
Expected: todos los tests en verde (incluye los 3 nuevos de `demo-superadmin.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/seed/demo-superadmin.ts src/lib/seed/demo-superadmin.test.ts prisma/seed.ts e2e/global-setup.ts
git commit -m "feat(admin): seed idempotente del super-admin demo"
```

---

### Task 4: Sesión de super-admin (`requireAdminSession`)

**Files:**
- Create: `src/lib/admin/session.ts`
- Create: `src/lib/admin/session.test.ts`

**Interfaces:**
- Produces: `isPlatformAdmin(prisma, userId): Promise<boolean>`, `requireAdminSession(): Promise<{userId, email}>` (tipo `AdminSession`) — consumido por las Tareas 6 (middleware, indirectamente vía las páginas) y 10, 14, 15 (layout/páginas de `/admin`).

- [ ] **Step 1: Escribir el test (falla primero)**

`src/lib/admin/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { isPlatformAdmin } from './session';

describe('isPlatformAdmin', () => {
  it('devuelve true si el usuario tiene un registro PlatformAdmin', async () => {
    await prisma.platformAdmin.create({ data: { userId: 'user-superadmin-1' } });

    expect(await isPlatformAdmin(prisma, 'user-superadmin-1')).toBe(true);
  });

  it('devuelve false si el usuario no tiene ningún registro PlatformAdmin', async () => {
    expect(await isPlatformAdmin(prisma, 'user-sin-admin')).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `pnpm test -- lib/admin/session`
Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Implementar**

`src/lib/admin/session.ts`:

```ts
import { redirect } from 'next/navigation';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function isPlatformAdmin(prismaClient: PrismaClient, userId: string): Promise<boolean> {
  const record = await prismaClient.platformAdmin.findUnique({ where: { userId } });
  return record !== null;
}

export interface AdminSession {
  userId: string;
  email: string;
}

// Segunda barrera de protección de /admin/** (la primera es el middleware,
// Tarea 6) — mismo patrón que requirePanelSession() en
// src/lib/panel/session.ts, pero resolviendo el rol vía PlatformAdmin en
// vez de Membership OWNER.
export async function requireAdminSession(): Promise<AdminSession> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  const isAdmin = await isPlatformAdmin(prisma, user.id);
  if (!isAdmin) {
    redirect('/admin/login?error=' + encodeURIComponent('Tu cuenta no tiene acceso al panel de super-administración.'));
  }

  return { userId: user.id, email: user.email ?? '' };
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `pnpm test -- lib/admin/session`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/session.ts src/lib/admin/session.test.ts
git commit -m "feat(admin): sesión de super-admin (requireAdminSession)"
```

---

### Task 5: Cerrar el bug de `requirePanelSession()` (no comprobaba `Business.active`)

**Files:**
- Modify: `src/lib/panel/session.ts`
- Modify: `src/lib/panel/session.test.ts`

**Interfaces:**
- Produces: `isBusinessActive(prisma, businessId): Promise<boolean>`, añadido a `src/lib/panel/session.ts` sin cambiar el contrato de `getOwnerBusinessIdForUser` (que ya tiene tests propios) ni de `PanelSession`.

- [ ] **Step 1: Escribir el test (falla primero)**

Añadir al final de `src/lib/panel/session.test.ts` (tras el `import` existente, añadir `isBusinessActive` a la lista importada):

```ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getOwnerBusinessIdForUser, isBusinessActive } from './session';
```

Y al final del archivo (tras el último `describe`):

```ts
describe('isBusinessActive', () => {
  it('devuelve true si el negocio está activo', async () => {
    const seed = await seedDemoBusiness(prisma);

    expect(await isBusinessActive(prisma, seed.business.id)).toBe(true);
  });

  it('devuelve false si el negocio está suspendido', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.business.update({ where: { id: seed.business.id }, data: { active: false } });

    expect(await isBusinessActive(prisma, seed.business.id)).toBe(false);
  });

  it('devuelve false si el negocio no existe', async () => {
    expect(await isBusinessActive(prisma, 'business-inexistente')).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `pnpm test -- lib/panel/session`
Expected: FAIL — `isBusinessActive is not a function` (o error de import).

- [ ] **Step 3: Implementar el cierre del bug**

Reemplazar el contenido completo de `src/lib/panel/session.ts` por:

```ts
import { redirect } from 'next/navigation';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getOwnerBusinessIdForUser(prismaClient: PrismaClient, userId: string): Promise<string | null> {
  const membership = await prismaClient.membership.findFirst({
    where: { userId, role: 'OWNER' },
  });
  return membership?.businessId ?? null;
}

// Separada de getOwnerBusinessIdForUser para no tocar su contrato (tiene
// tests propios ya establecidos) y poder testear el caso "negocio
// suspendido" de forma aislada.
export async function isBusinessActive(prismaClient: PrismaClient, businessId: string): Promise<boolean> {
  const business = await prismaClient.business.findUnique({ where: { id: businessId }, select: { active: true } });
  return business?.active ?? false;
}

export interface PanelSession {
  userId: string;
  email: string;
  businessId: string;
}

// Segunda barrera de protección (la primera es el middleware): se llama
// desde el layout protegido del panel y desde cada Server Action, y
// redirige si no hay usuario autenticado, si el usuario no es OWNER de
// ningún negocio, o si el negocio del que es OWNER está suspendido
// (bug cerrado en Fase 6: antes de este cambio, un negocio con
// `active: false` seguía siendo accesible desde /panel para su dueño con
// sesión válida — el flag `active` solo se comprobaba en la página pública,
// business-lookup.ts).
export async function requirePanelSession(): Promise<PanelSession> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/panel/login');
  }

  const businessId = await getOwnerBusinessIdForUser(prisma, user.id);
  if (!businessId) {
    redirect('/panel/login?error=' + encodeURIComponent('Tu cuenta no tiene acceso a ningún panel de negocio.'));
  }

  const active = await isBusinessActive(prisma, businessId);
  if (!active) {
    redirect('/panel/login?error=' + encodeURIComponent('Este negocio está suspendido. Contacta con el soporte de Appoint.'));
  }

  return { userId: user.id, email: user.email ?? '', businessId };
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `pnpm test -- lib/panel/session`
Expected: PASS (7 tests: 4 existentes + 3 nuevos).

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: todos los tests en verde (este cambio es usado por todas las páginas/acciones de `/panel`, así que confirma que ningún test existente asumía el comportamiento anterior).

- [ ] **Step 6: Commit**

```bash
git add src/lib/panel/session.ts src/lib/panel/session.test.ts
git commit -m "fix(panel): requirePanelSession bloquea el acceso si el negocio está suspendido"
```

---

### Task 6: Middleware — proteger `/admin/**` sin duplicar el refresco de cookies

**Files:**
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: ninguna nueva (usa las mismas rutas de login que las Tareas 4/7 asumen: `/panel/login`, `/admin/login`, y la ruta pública `/panel/invitacion` de la Tarea 12).

- [ ] **Step 1: Reemplazar el middleware**

Reemplazar el contenido completo de `src/middleware.ts` por:

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

interface ProtectedZone {
  prefix: string;
  loginPath: string;
  publicPaths: string[];
}

// Cada zona protegida (panel del negocio, panel de super-admin) comparte la
// misma lógica de refresco de cookies de Supabase; lo único que cambia es el
// prefijo de ruta, a dónde redirigir si no hay sesión, y qué rutas dentro de
// ese prefijo son accesibles SIN sesión previa. Para /panel eso incluye
// /panel/invitacion: el dueño invitado llega ahí sin sesión todavía — la
// establece la propia página con el token de invitación (ver
// src/app/panel/invitacion/actions.ts) — así que no puede exigirse sesión
// previa para visitarla.
const PROTECTED_ZONES: ProtectedZone[] = [
  { prefix: '/panel', loginPath: '/panel/login', publicPaths: ['/panel/login', '/panel/invitacion'] },
  { prefix: '/admin', loginPath: '/admin/login', publicPaths: ['/admin/login'] },
];

// Refresca la sesión de Supabase (renueva el access token si ha caducado) en
// cada petición a /panel/* o /admin/* y redirige a la página de login de esa
// zona si no hay sesión. Es la primera barrera; requirePanelSession()/
// requireAdminSession() son la segunda, dentro de cada layout protegido —
// Supabase recomienda esta doble comprobación porque una cookie de sesión
// presente pero inválida solo se detecta al llamar a supabase.auth.getUser()
// (valida contra el servidor), no solo por su presencia.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const zone = PROTECTED_ZONES.find((z) => request.nextUrl.pathname.startsWith(z.prefix));
  if (zone) {
    const isPublicPath = zone.publicPaths.includes(request.nextUrl.pathname);
    if (!isPublicPath && !user) {
      const loginUrl = new URL(zone.loginPath, request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ['/panel/:path*', '/admin/:path*'],
};
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

Nota: no hay `middleware.test.ts` en el proyecto (requiere `NextRequest`/edge runtime, no cubierto por la convención actual de Vitest); la verificación de comportamiento la da la Tarea 16 (e2e) y la comprobación manual con `pnpm dev`.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(admin): protege /admin/** en el middleware junto a /panel/**"
```

---

### Task 7: `/admin/login`

**Files:**
- Create: `src/app/admin/login/page.tsx`
- Create: `src/app/admin/login/actions.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient()` (`src/lib/supabase/server.ts`).
- Produces: `signInAdminAction(formData)`, `signOutAdminAction()`, consumidos por la Tarea 10 (layout protegido, botón "Salir").

- [ ] **Step 1: Server Actions de login/logout**

`src/app/admin/login/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function signInAdminAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/admin/login?error=${encodeURIComponent('Email o contraseña incorrectos.')}`);
  }

  redirect('/admin');
}

export async function signOutAdminAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}
```

- [ ] **Step 2: Página de login**

`src/app/admin/login/page.tsx`:

```tsx
import { signInAdminAction } from './actions';

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Panel de super-administración</h1>
        <p className="text-sm text-slate-500">Accede con tu cuenta de super-admin.</p>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form action={signInAdminAction} className="space-y-3">
        <label className="block text-sm text-slate-700">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-slate-700">
          Contraseña
          <input
            name="password"
            type="password"
            required
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <button type="submit" className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Entrar
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Verificar manualmente**

Run: `pnpm exec supabase start` (si no está ya levantado) y `pnpm db:seed` (para tener el super-admin demo tras la Tarea 3), luego `pnpm dev`.
Visita `http://localhost:3000/admin/login`, entra con `DEMO_SUPERADMIN_EMAIL`/`DEMO_SUPERADMIN_PASSWORD` de `.env`.
Expected: redirige a `/admin`, que devuelve 404 todavía (se construye en la Tarea 10) — confirma que el login en sí funciona y que `requireAdminSession()` no revienta.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/login
git commit -m "feat(admin): login del super-admin"
```

---

### Task 8: `getWeekStartLocalDateString` en `timezone.ts`

**Files:**
- Modify: `src/lib/booking/timezone.ts`
- Modify: `src/lib/booking/timezone.test.ts`

**Interfaces:**
- Produces: `getWeekStartLocalDateString(localDateStr: string): string`, consumido por la Tarea 9 (`platform-metrics-service.ts`).

- [ ] **Step 1: Escribir el test (falla primero)**

Añadir al final de `src/lib/booking/timezone.test.ts` (añadir `getWeekStartLocalDateString` al import existente):

```ts
import {
  getLocalDateString,
  localMinutesToUtc,
  addDaysToLocalDateString,
  parseLocalWallTimeToUtc,
  getWeekStartLocalDateString,
  BUSINESS_TIMEZONE,
} from './timezone';
```

Y al final del archivo:

```ts
describe('getWeekStartLocalDateString', () => {
  it('devuelve el lunes de la semana cuando la fecha es un miércoles', () => {
    // 2026-07-15 es miércoles
    expect(getWeekStartLocalDateString('2026-07-15')).toBe('2026-07-13');
  });

  it('devuelve la misma fecha cuando ya es lunes', () => {
    // 2026-07-13 es lunes
    expect(getWeekStartLocalDateString('2026-07-13')).toBe('2026-07-13');
  });

  it('devuelve el lunes anterior cuando la fecha es domingo (fin de la semana ISO)', () => {
    // 2026-07-19 es domingo, pertenece a la semana que empezó el 2026-07-13
    expect(getWeekStartLocalDateString('2026-07-19')).toBe('2026-07-13');
  });

  it('cruza correctamente un cambio de mes', () => {
    // 2026-08-01 es sábado, la semana empezó el 2026-07-27 (lunes)
    expect(getWeekStartLocalDateString('2026-08-01')).toBe('2026-07-27');
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `pnpm test -- lib/booking/timezone`
Expected: FAIL — `getWeekStartLocalDateString is not a function`.

- [ ] **Step 3: Implementar**

Añadir al final de `src/lib/booking/timezone.ts`:

```ts
// Lunes (inicio de semana ISO) de la semana que contiene localDateStr, como
// cadena YYYY-MM-DD. Igual que addDaysToLocalDateString, opera solo sobre el
// calendario (sin zona horaria) porque localDateStr ya representa un día
// local: no hace falta volver a convertir a UTC hasta construir los límites
// finales con localMinutesToUtc (ver platform-metrics-service.ts).
export function getWeekStartLocalDateString(localDateStr: string): string {
  const [year, month, day] = localDateStr.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=domingo..6=sábado
  const daysSinceMonday = (weekday + 6) % 7;
  return addDaysToLocalDateString(localDateStr, -daysSinceMonday);
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `pnpm test -- lib/booking/timezone`
Expected: PASS (8 tests: 4 existentes + 4 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/booking/timezone.ts src/lib/booking/timezone.test.ts
git commit -m "feat(booking): añade getWeekStartLocalDateString para métricas semanales"
```

---

### Task 9: `getPlatformMetrics`

**Files:**
- Create: `src/lib/admin/platform-metrics-service.ts`
- Create: `src/lib/admin/platform-metrics-service.test.ts`

**Interfaces:**
- Consumes: `BUSINESS_TIMEZONE`, `getLocalDateString`, `getWeekStartLocalDateString`, `addDaysToLocalDateString`, `localMinutesToUtc` (`src/lib/booking/timezone.ts`, Tarea 8).
- Produces: `getPlatformMetrics(prisma, now: Date): Promise<{activeBusinessCount, appointmentsThisWeekCount}>`, consumido por la Tarea 10.

- [ ] **Step 1: Escribir el test (falla primero)**

`src/lib/admin/platform-metrics-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getPlatformMetrics } from './platform-metrics-service';

// 2026-07-15 es miércoles; la semana [lunes 00:00, lunes siguiente 00:00)
// en Europe/Madrid es [2026-07-13T00:00 CEST, 2026-07-20T00:00 CEST) =
// [2026-07-12T22:00Z, 2026-07-19T22:00Z).
const NOW = new Date('2026-07-15T10:00:00.000Z');

describe('getPlatformMetrics', () => {
  it('cuenta solo los negocios activos', async () => {
    await seedDemoBusiness(prisma);
    const inactive = await prisma.business.create({
      data: { slug: 'negocio-inactivo-metrics', name: 'Negocio Inactivo', type: 'OTHER', active: false },
    });
    await prisma.business.create({
      data: { slug: 'negocio-activo-metrics', name: 'Negocio Activo', type: 'OTHER', active: true },
    });

    const metrics = await getPlatformMetrics(prisma, NOW);

    expect(metrics.activeBusinessCount).toBeGreaterThanOrEqual(2); // salon-aura + negocio-activo-metrics
    expect(inactive.active).toBe(false); // documenta el fixture, no cuenta
  });

  it('cuenta las citas dentro de la semana [lunes 00:00, lunes siguiente 00:00) en Europe/Madrid', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customer = await prisma.customer.create({
      data: { businessId: seed.business.id, name: 'Cliente Métricas', email: 'metrics@example.com' },
    });

    async function createAppointmentAt(start: Date) {
      await prisma.appointment.create({
        data: {
          businessId: seed.business.id,
          serviceId: seed.services.corteMujer.id,
          employeeId: seed.employees.marta.id,
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          start,
          end: new Date(start.getTime() + 30 * 60 * 1000),
          status: 'CONFIRMED',
        },
      });
    }

    // Dentro de la semana: lunes 00:01 y domingo 23:59 locales.
    await createAppointmentAt(new Date('2026-07-12T22:01:00.000Z')); // lunes 00:01 CEST
    await createAppointmentAt(new Date('2026-07-19T21:59:00.000Z')); // domingo 23:59 CEST
    // Fuera de la semana: domingo anterior 23:59 y el lunes siguiente 00:00.
    await createAppointmentAt(new Date('2026-07-12T21:59:00.000Z')); // domingo anterior 23:59 CEST
    await createAppointmentAt(new Date('2026-07-19T22:00:00.000Z')); // lunes siguiente 00:00 CEST

    const metrics = await getPlatformMetrics(prisma, NOW);

    expect(metrics.appointmentsThisWeekCount).toBe(2);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `pnpm test -- lib/admin/platform-metrics-service`
Expected: FAIL — `Cannot find module './platform-metrics-service'`.

- [ ] **Step 3: Implementar**

`src/lib/admin/platform-metrics-service.ts`:

```ts
import type { PrismaClient } from '@prisma/client';
import {
  BUSINESS_TIMEZONE,
  getLocalDateString,
  getWeekStartLocalDateString,
  addDaysToLocalDateString,
  localMinutesToUtc,
} from '@/lib/booking/timezone';

export interface PlatformMetrics {
  activeBusinessCount: number;
  appointmentsThisWeekCount: number;
}

// Alcance de plataforma: agrega sobre TODOS los negocios, sin businessId de
// sesión (no aplica multi-tenancy aquí, es justo lo contrario: es un
// agregado cross-tenant intencional para el dashboard de /admin).
// appointmentsThisWeekCount cuenta citas de CUALQUIER estado (incluidas
// CANCELLED/NO_SHOW) y de negocios suspendidos: es la interpretación más
// simple de "citas de la semana" y coincide con lo que pide la spec sin
// añadir filtros no solicitados.
export async function getPlatformMetrics(prisma: PrismaClient, now: Date): Promise<PlatformMetrics> {
  const todayLocal = getLocalDateString(now, BUSINESS_TIMEZONE);
  const weekStartLocal = getWeekStartLocalDateString(todayLocal);
  const weekEndLocal = addDaysToLocalDateString(weekStartLocal, 7);
  const weekStartUtc = localMinutesToUtc(weekStartLocal, 0, BUSINESS_TIMEZONE);
  const weekEndUtc = localMinutesToUtc(weekEndLocal, 0, BUSINESS_TIMEZONE);

  const [activeBusinessCount, appointmentsThisWeekCount] = await Promise.all([
    prisma.business.count({ where: { active: true } }),
    prisma.appointment.count({ where: { start: { gte: weekStartUtc, lt: weekEndUtc } } }),
  ]);

  return { activeBusinessCount, appointmentsThisWeekCount };
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `pnpm test -- lib/admin/platform-metrics-service`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/platform-metrics-service.ts src/lib/admin/platform-metrics-service.test.ts
git commit -m "feat(admin): métricas de plataforma (negocios activos, citas de la semana)"
```

---

### Task 10: Dashboard `/admin`

**Files:**
- Create: `src/app/admin/(protected)/layout.tsx`
- Create: `src/app/admin/(protected)/page.tsx`

**Interfaces:**
- Consumes: `requireAdminSession()` (Tarea 4), `signOutAdminAction()` (Tarea 7), `getPlatformMetrics()` (Tarea 9), `prisma` (`src/lib/db.ts`).

- [ ] **Step 1: Layout protegido**

`src/app/admin/(protected)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdminSession } from '@/lib/admin/session';
import { signOutAdminAction } from '../login/actions';

const NAV_LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/negocios', label: 'Negocios' },
];

export default async function AdminProtectedLayout({ children }: { children: ReactNode }) {
  const { email } = await requireAdminSession();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="font-medium text-slate-700 hover:text-slate-900">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>{email}</span>
            <form action={signOutAdminAction}>
              <button type="submit" className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Página del dashboard**

`src/app/admin/(protected)/page.tsx`:

```tsx
import { requireAdminSession } from '@/lib/admin/session';
import { prisma } from '@/lib/db';
import { getPlatformMetrics } from '@/lib/admin/platform-metrics-service';

export default async function AdminDashboardPage() {
  await requireAdminSession();
  const metrics = await getPlatformMetrics(prisma, new Date());

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Panel de super-administración</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Negocios activos</p>
          <p className="text-3xl font-semibold text-slate-900">{metrics.activeBusinessCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Citas de esta semana</p>
          <p className="text-3xl font-semibold text-slate-900">{metrics.appointmentsThisWeekCount}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar manualmente**

Con `pnpm dev` levantado, entra en `/admin/login` con el super-admin demo.
Expected: redirige a `/admin`, muestra "Panel de super-administración" con dos tarjetas de métricas (al menos 1 negocio activo — el demo "Salón Aura" — y 0 citas de la semana si no hay citas creadas).

- [ ] **Step 4: Verificar tipos/lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(protected)/layout.tsx" "src/app/admin/(protected)/page.tsx"
git commit -m "feat(admin): dashboard con métricas de plataforma"
```

---

### Task 11: `OwnerInviter` — invitación real de Supabase Auth (inyectable)

**Files:**
- Create: `src/lib/admin/owner-inviter.ts`

**Interfaces:**
- Consumes: `getSupabaseAdminAuthClient()` (Tarea 2).
- Produces: `OwnerInviter` (interfaz), `OwnerInvitationLink { userId, hashedToken }`, `SupabaseOwnerInviter` (implementación real), `getOwnerInviter(): OwnerInviter` — consumidos por las Tareas 12 (test con `FakeOwnerInviter`) y 15 (Server Action real).

- [ ] **Step 1: Implementar**

`src/lib/admin/owner-inviter.ts`:

```ts
import { getSupabaseAdminAuthClient } from '@/lib/supabase/admin';

export interface OwnerInvitationLink {
  userId: string;
  hashedToken: string;
}

// Alcance de plataforma (no tenant-scoped): genera el enlace de invitación
// real de Supabase Auth para el dueño de un negocio nuevo, usado solo desde
// /admin. Se inyecta como interfaz (mismo patrón que EmailSender en
// src/lib/email/types.ts) para poder testear createPlatformBusiness
// (Tarea 12) con un FakeOwnerInviter sin llamar a la Admin API real — igual
// que el resto del proyecto evita golpear Supabase Auth desde Vitest (ver
// src/lib/seed/demo-owner.ts: ensureDemoOwnerAuthUser no tiene test directo,
// solo seedDemoOwnerMembership y getDemoOwnerCredentials).
export interface OwnerInviter {
  generateInviteLink(email: string): Promise<OwnerInvitationLink>;
}

// IMPORTANTE — por qué no se usa `action_link`: `generateLink({type:'invite'})`
// también devuelve `properties.action_link`, una URL a
// `{SUPABASE_URL}/auth/v1/verify?type=invite&token=...&redirect_to=...` que,
// al visitarse, hace un 302 a `redirect_to` añadiendo la sesión como
// FRAGMENTO de URL (`#access_token=...&refresh_token=...&type=invite`) —
// grant implícito. El cliente de navegador de este proyecto
// (createBrowserClient de @supabase/ssr, src/lib/supabase/browser.ts) fija
// `flowType: 'pkce'` de forma fija (no configurable desde aquí), y
// `_getSessionFromURL` de @supabase/auth-js lanza
// `AuthPKCEGrantCodeExchangeError('Not a valid PKCE flow url.')` en cuanto
// detecta un callback implícito con flowType pkce — el enlace nativo de
// Supabase quedaría roto en este proyecto tal cual. En vez de depender de
// eso, no se pasa `options.redirectTo` (innecesario además: evita cualquier
// fricción con la lista de redirects permitidos de supabase/config.toml,
// que no incluye APP_BASE_URL) y se usa directamente
// `properties.hashed_token`: nuestra propia página /panel/invitacion
// construye la URL (`${APP_BASE_URL}/panel/invitacion?token_hash=...`, ver
// Tarea 15) y la verifica en un Server Action con
// `supabase.auth.verifyOtp({ token_hash, type: 'invite' })` (Tarea 13), que
// no pasa por ningún flujo de redirect ni por el chequeo de flowType.
export class SupabaseOwnerInviter implements OwnerInviter {
  async generateInviteLink(email: string): Promise<OwnerInvitationLink> {
    const admin = getSupabaseAdminAuthClient();
    const { data, error } = await admin.generateLink({ type: 'invite', email });
    if (error || !data.user) {
      throw new Error(`No se pudo generar el enlace de invitación para ${email}: ${error?.message ?? 'usuario no devuelto'}`);
    }
    return { userId: data.user.id, hashedToken: data.properties.hashed_token };
  }
}

export function getOwnerInviter(): OwnerInviter {
  return new SupabaseOwnerInviter();
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores (confirma que la forma de `GenerateLinkResponse` de `@supabase/supabase-js` 2.110.7 coincide con el acceso `data.properties.hashed_token`/`data.user.id`).

Nota: sin test Vitest directo para `SupabaseOwnerInviter` (llamaría a la Admin API real, mismo criterio que `ensureDemoOwnerAuthUser`/`ensureDemoSuperAdminAuthUser`). Se verifica indirectamente vía `FakeOwnerInviter` en la Tarea 12 y de extremo a extremo en la Tarea 16 (e2e).

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin/owner-inviter.ts
git commit -m "feat(admin): invitación real de dueños vía Supabase Auth Admin API"
```

---

### Task 12: `platform-business-service.ts` (alta de negocio + activar/suspender)

**Files:**
- Create: `src/lib/admin/platform-business-service.ts`
- Create: `src/lib/admin/platform-business-service.test.ts`

**Interfaces:**
- Consumes: `OwnerInviter`, `OwnerInvitationLink` (Tarea 11).
- Produces: `NewBusinessInput`, `CreatePlatformBusinessResult`, `PlatformBusinessSummary`, `listPlatformBusinesses(prisma)`, `createPlatformBusiness(prisma, ownerInviter, input)`, `setPlatformBusinessActive(prisma, businessId, active)` — consumidos por la Tarea 15.

- [ ] **Step 1: Escribir los tests (fallan primero)**

`src/lib/admin/platform-business-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import {
  listPlatformBusinesses,
  createPlatformBusiness,
  setPlatformBusinessActive,
  type NewBusinessInput,
} from './platform-business-service';
import type { OwnerInviter, OwnerInvitationLink } from './owner-inviter';

class FakeOwnerInviter implements OwnerInviter {
  calls: string[] = [];
  async generateInviteLink(email: string): Promise<OwnerInvitationLink> {
    this.calls.push(email);
    return { userId: `fake-user-${email}`, hashedToken: `fake-token-${email}` };
  }
}

class FailingOwnerInviter implements OwnerInviter {
  async generateInviteLink(): Promise<OwnerInvitationLink> {
    throw new Error('fallo de red simulado');
  }
}

const VALID_INPUT: NewBusinessInput = {
  name: 'Barbería Ejemplo',
  slug: 'barberia-ejemplo',
  type: 'BARBERSHOP',
  businessEmail: 'contacto@barberia-ejemplo.example',
  ownerEmail: 'dueno@barberia-ejemplo.example',
};

describe('createPlatformBusiness', () => {
  it('crea el negocio, invita al dueño (no al email de contacto) y crea su Membership OWNER', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, VALID_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('esperaba ok:true');
    expect(result.business.slug).toBe('barberia-ejemplo');
    expect(result.business.active).toBe(true);
    expect(result.business.email).toBe('contacto@barberia-ejemplo.example');
    expect(inviter.calls).toEqual(['dueno@barberia-ejemplo.example']);

    const membership = await prisma.membership.findFirst({
      where: { businessId: result.business.id, role: 'OWNER' },
    });
    expect(membership?.userId).toBe(result.ownerUserId);
  });

  it('acepta businessEmail nulo: el email de contacto del negocio es opcional', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, { ...VALID_INPUT, businessEmail: null });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('esperaba ok:true');
    expect(result.business.email).toBeNull();
    expect(inviter.calls).toEqual(['dueno@barberia-ejemplo.example']);
  });

  it('normaliza el slug a minúsculas y recorta espacios en nombre/ambos emails', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, {
      ...VALID_INPUT,
      name: '  Barbería Ejemplo  ',
      slug: 'Barberia-Ejemplo',
      businessEmail: '  contacto@barberia-ejemplo.example  ',
      ownerEmail: '  dueno@barberia-ejemplo.example  ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('esperaba ok:true');
    expect(result.business.slug).toBe('barberia-ejemplo');
    expect(result.business.name).toBe('Barbería Ejemplo');
    expect(result.business.email).toBe('contacto@barberia-ejemplo.example');
    expect(inviter.calls).toEqual(['dueno@barberia-ejemplo.example']);
  });

  it('devuelve INVALID_INPUT si el slug tiene espacios o mayúsculas no normalizables', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, { ...VALID_INPUT, slug: 'Slug Con Espacios' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
    expect(inviter.calls).toHaveLength(0);
  });

  it('devuelve INVALID_INPUT si el slug es una ruta reservada de la app', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, { ...VALID_INPUT, slug: 'admin' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT si el email del dueño no es válido', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, { ...VALID_INPUT, ownerEmail: 'no-es-un-email' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
    expect(inviter.calls).toHaveLength(0);
  });

  it('devuelve INVALID_INPUT si el email de contacto no es válido cuando se indica', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, { ...VALID_INPUT, businessEmail: 'no-es-un-email' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve SLUG_TAKEN si el slug ya existe', async () => {
    const inviter = new FakeOwnerInviter();
    await createPlatformBusiness(prisma, inviter, VALID_INPUT);

    const result = await createPlatformBusiness(prisma, inviter, VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'SLUG_TAKEN' });
  });

  it('revierte el alta del negocio si falla la invitación al dueño (sin dejarlo huérfano)', async () => {
    const inviter = new FailingOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'OWNER_INVITE_FAILED' });
    const business = await prisma.business.findUnique({ where: { slug: VALID_INPUT.slug } });
    expect(business).toBeNull();
  });
});

describe('setPlatformBusinessActive', () => {
  it('activa/suspende el negocio indicado', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');

    const suspended = await setPlatformBusinessActive(prisma, created.business.id, false);

    expect(suspended.ok).toBe(true);
    if (!suspended.ok) throw new Error('esperaba ok:true');
    expect(suspended.business.active).toBe(false);
  });

  it('devuelve NOT_FOUND si el negocio no existe', async () => {
    const result = await setPlatformBusinessActive(prisma, 'negocio-inexistente', false);
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('listPlatformBusinesses', () => {
  it('lista los negocios ordenados por fecha de alta descendente', async () => {
    const inviter = new FakeOwnerInviter();
    const first = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    const second = await createPlatformBusiness(prisma, inviter, {
      ...VALID_INPUT,
      slug: 'otro-negocio',
      businessEmail: 'otro-contacto@example.com',
      ownerEmail: 'otro-dueno@example.com',
    });
    if (!first.ok || !second.ok) throw new Error('esperaba ok:true');

    const list = await listPlatformBusinesses(prisma);

    expect(list.map((b) => b.id)).toEqual([second.business.id, first.business.id]);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `pnpm test -- lib/admin/platform-business-service`
Expected: FAIL — `Cannot find module './platform-business-service'`.

- [ ] **Step 3: Implementar**

`src/lib/admin/platform-business-service.ts`:

```ts
import { Prisma, BusinessType } from '@prisma/client';
import type { PrismaClient, Business } from '@prisma/client';
import type { OwnerInviter, OwnerInvitationLink } from './owner-inviter';

export interface PlatformBusinessSummary {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  createdAt: Date;
}

// Dos campos de email distintos (decisión confirmada con el usuario tras
// una ambigüedad detectada en la redacción del plan): `businessEmail` es el
// email de contacto PÚBLICO del negocio (opcional, igual que
// `Business.email` ya es nullable en el schema — es el que se muestra en la
// página pública) y `ownerEmail` es el email REAL del dueño (obligatorio),
// usado exclusivamente para crear su usuario de Supabase Auth e invitarlo.
// Pueden coincidir o no.
export interface NewBusinessInput {
  name: string;
  slug: string;
  type: BusinessType;
  businessEmail: string | null;
  ownerEmail: string;
}

export type CreatePlatformBusinessResult =
  | { ok: true; business: Business; ownerUserId: string; invitationTokenHash: string }
  | { ok: false; reason: 'INVALID_INPUT' | 'SLUG_TAKEN' | 'OWNER_INVITE_FAILED' };

// Rutas de primer nivel ya usadas por la app: un negocio con uno de estos
// slugs sería indistinguible de esas rutas en `/{slug}` (página pública).
// 'panel' ya estaba reservado de facto desde la Fase 5 (ver CONTINUAR.md);
// aquí se hace explícito junto al resto de segmentos reales de src/app/.
const RESERVED_SLUGS = new Set(['panel', 'admin', 'cita', 'confirmar', 'api']);
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidNewBusinessInput(input: NewBusinessInput): boolean {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const ownerEmail = input.ownerEmail.trim();
  const businessEmail = input.businessEmail?.trim() ?? '';
  return (
    name.length > 0 &&
    name.length <= 120 &&
    SLUG_PATTERN.test(slug) &&
    slug.length <= 60 &&
    !RESERVED_SLUGS.has(slug) &&
    Object.values(BusinessType).includes(input.type) &&
    EMAIL_PATTERN.test(ownerEmail) &&
    (businessEmail.length === 0 || EMAIL_PATTERN.test(businessEmail))
  );
}

export async function listPlatformBusinesses(prisma: PrismaClient): Promise<PlatformBusinessSummary[]> {
  const businesses = await prisma.business.findMany({ orderBy: { createdAt: 'desc' } });
  return businesses.map((b) => ({ id: b.id, slug: b.slug, name: b.name, active: b.active, createdAt: b.createdAt }));
}

// Alcance de plataforma (no tenant-scoped, opera sin businessId de sesión):
// crea el Business y, en la misma operación de negocio, invita al dueño real
// por email (Supabase Auth Admin API, vía `ownerInviter` inyectable — mismo
// patrón de inyección que `emailSender` en src/lib/email/) y le da de alta
// como Membership OWNER. `ownerInviter` es una llamada de red externa que no
// puede formar parte de una transacción de Prisma: si falla DESPUÉS de crear
// el Business, se revierte el alta a mano (borrado compensatorio) para no
// dejar negocios huérfanos sin ningún dueño que pueda entrar a /panel.
export async function createPlatformBusiness(
  prisma: PrismaClient,
  ownerInviter: OwnerInviter,
  input: NewBusinessInput
): Promise<CreatePlatformBusinessResult> {
  if (!isValidNewBusinessInput(input)) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }

  const slug = input.slug.trim().toLowerCase();
  const ownerEmail = input.ownerEmail.trim();
  const businessEmail = input.businessEmail?.trim() || null;

  const existing = await prisma.business.findUnique({ where: { slug } });
  if (existing) {
    return { ok: false, reason: 'SLUG_TAKEN' };
  }

  let business: Business;
  try {
    business = await prisma.business.create({
      data: {
        slug,
        name: input.name.trim(),
        type: input.type,
        email: businessEmail,
        active: true,
      },
    });
  } catch (error) {
    // Carrera perdida: otra alta se llevó el mismo slug entre el
    // findUnique de arriba y este create (restricción única Business.slug).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'SLUG_TAKEN' };
    }
    throw error;
  }

  let invite: OwnerInvitationLink;
  try {
    invite = await ownerInviter.generateInviteLink(ownerEmail);
  } catch (error) {
    console.error('[admin] fallo al invitar al dueño, revirtiendo alta de negocio', { businessId: business.id, error });
    await prisma.business.delete({ where: { id: business.id } });
    return { ok: false, reason: 'OWNER_INVITE_FAILED' };
  }

  await prisma.membership.create({
    data: { userId: invite.userId, businessId: business.id, role: 'OWNER' },
  });

  return { ok: true, business, ownerUserId: invite.userId, invitationTokenHash: invite.hashedToken };
}

// Mismo criterio que setServiceActive/setEmployeeActive (Fase 5): claim
// atómico updateMany-scoped. Aquí no hay businessId de sesión que aplicar en
// el `where` (alcance de plataforma), pero sí se mantiene el patrón
// updateMany + comprobación de count por consistencia con el resto del
// proyecto, aunque no haya un "estado origen" que perder por carrera (es un
// booleano simple, cualquier orden de dos togglings concurrentes es
// aceptable: el último gana, igual que en setServiceActive).
export async function setPlatformBusinessActive(
  prisma: PrismaClient,
  businessId: string,
  active: boolean
): Promise<{ ok: true; business: Business } | { ok: false; reason: 'NOT_FOUND' }> {
  const claim = await prisma.business.updateMany({ where: { id: businessId }, data: { active } });
  if (claim.count === 0) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  return { ok: true, business };
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `pnpm test -- lib/admin/platform-business-service`
Expected: PASS (12 tests).

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: todos los tests en verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/platform-business-service.ts src/lib/admin/platform-business-service.test.ts
git commit -m "feat(admin): alta de negocio con invitación real y activar/suspender"
```

---

### Task 13: Plantilla de email "invitación de dueño"

**Files:**
- Create: `src/lib/email/templates/OwnerInvitationEmail.tsx`
- Create: `src/lib/email/owner-invitation.tsx`
- Create: `src/lib/email/owner-invitation.test.tsx`
- Modify: `src/lib/email/appointment-notifications.tsx` (exportar `trySend`)

**Interfaces:**
- Consumes: `EmailMessage`, `EmailSender` (`src/lib/email/types.ts`), `EmailLayout` (`src/lib/email/templates/EmailLayout.tsx`), `trySend` (ahora exportado desde `appointment-notifications.tsx`).
- Produces: `OwnerInvitationEmailContext { business: {name, accentColor, logoUrl}, ownerEmail, invitationUrl }`, `sendOwnerInvitationEmail(emailSender, ctx): Promise<{ok:boolean}>` — consumido por la Tarea 15.

- [ ] **Step 1: Exportar `trySend`**

En `src/lib/email/appointment-notifications.tsx`, cambiar:

```ts
async function trySend(emailSender: EmailSender, message: EmailMessage): Promise<{ ok: boolean }> {
```

por:

```ts
export async function trySend(emailSender: EmailSender, message: EmailMessage): Promise<{ ok: boolean }> {
```

(sin más cambios en ese archivo — el comentario que lo precede ya explica que ninguna función `sendXEmail` lanza).

- [ ] **Step 2: Escribir el test (falla primero)**

`src/lib/email/owner-invitation.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { FakeEmailSender } from '../../test/fake-email-sender';
import { sendOwnerInvitationEmail, type OwnerInvitationEmailContext } from './owner-invitation';

const BASE_CTX: OwnerInvitationEmailContext = {
  business: { name: 'Barbería Ejemplo', accentColor: '#B25539', logoUrl: null },
  ownerEmail: 'dueno@barberia-ejemplo.example',
  invitationUrl: 'http://localhost:3000/panel/invitacion?token_hash=abc123',
};

describe('sendOwnerInvitationEmail', () => {
  it('envía al email del dueño con el enlace de invitación', async () => {
    const sender = new FakeEmailSender();

    const result = await sendOwnerInvitationEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('dueno@barberia-ejemplo.example');
    expect(sender.sent[0].subject).toContain('Barbería Ejemplo');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('Barbería Ejemplo');
    expect(text).toContain('http://localhost:3000/panel/invitacion?token_hash=abc123');
  });

  it('devuelve ok:false y no lanza si el envío falla', async () => {
    const failingSender = { send: async () => { throw new Error('fallo de red'); } };

    const result = await sendOwnerInvitationEmail(failingSender, BASE_CTX);

    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

Run: `pnpm test -- owner-invitation`
Expected: FAIL — `Cannot find module './owner-invitation'`.

- [ ] **Step 4: Implementar la plantilla**

`src/lib/email/templates/OwnerInvitationEmail.tsx`:

```tsx
import { Heading, Text, Button, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface OwnerInvitationEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  invitationUrl: string;
}

export function OwnerInvitationEmail({ businessName, accentColor, logoUrl, invitationUrl }: OwnerInvitationEmailProps) {
  return (
    <EmailLayout
      previewText={`Te han dado de alta como dueño de ${businessName} en Appoint`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>¡Bienvenido a Appoint!</Heading>
      <Text>
        Se ha dado de alta <strong>{businessName}</strong> en Appoint y se te ha asignado como dueño. Para empezar a
        gestionar tu agenda, crea tu contraseña de acceso al panel:
      </Text>
      <Button
        href={invitationUrl}
        style={{
          backgroundColor: accentColor,
          color: '#ffffff',
          padding: '12px 24px',
          borderRadius: 8,
          textDecoration: 'none',
          fontWeight: 'bold',
          display: 'block',
          textAlign: 'center',
          margin: '24px 0',
        }}
      >
        Crear mi contraseña
      </Button>
      <Hr />
      <Text style={{ fontSize: 12, color: '#6b7280' }}>
        Si no esperabas este email, puedes ignorarlo: el enlace caduca y no da acceso a nada por sí solo.
      </Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 5: Implementar `sendOwnerInvitationEmail`**

`src/lib/email/owner-invitation.tsx`:

```tsx
import type { EmailMessage, EmailSender } from './types';
import { trySend } from './appointment-notifications';
import { OwnerInvitationEmail } from './templates/OwnerInvitationEmail';

export interface OwnerInvitationEmailContext {
  business: {
    name: string;
    accentColor: string;
    logoUrl: string | null;
  };
  ownerEmail: string;
  invitationUrl: string;
}

export async function sendOwnerInvitationEmail(
  emailSender: EmailSender,
  ctx: OwnerInvitationEmailContext
): Promise<{ ok: boolean }> {
  const message: EmailMessage = {
    to: ctx.ownerEmail,
    subject: `Te han dado de alta como dueño de ${ctx.business.name} en Appoint`,
    react: (
      <OwnerInvitationEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        invitationUrl={ctx.invitationUrl}
      />
    ),
  };

  return trySend(emailSender, message);
}
```

- [ ] **Step 6: Ejecutar y comprobar que pasa**

Run: `pnpm test -- owner-invitation`
Expected: PASS (2 tests).

- [ ] **Step 7: Ejecutar la suite completa (confirma que exportar `trySend` no rompe nada)**

Run: `pnpm test`
Expected: todos los tests en verde.

- [ ] **Step 8: Commit**

```bash
git add src/lib/email/templates/OwnerInvitationEmail.tsx src/lib/email/owner-invitation.tsx src/lib/email/owner-invitation.test.tsx src/lib/email/appointment-notifications.tsx
git commit -m "feat(email): plantilla de invitación de dueño (sendOwnerInvitationEmail)"
```

---

### Task 14: `/panel/invitacion` — el dueño fija su contraseña

**Files:**
- Create: `src/app/panel/invitacion/page.tsx`
- Create: `src/app/panel/invitacion/actions.ts`
- Create: `src/app/panel/invitacion/AcceptInvitationForm.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient()` (`src/lib/supabase/server.ts`).
- Produces: nada consumido por otras tareas de código (es el destino final del enlace de invitación); usado por la Tarea 16 (e2e).

- [ ] **Step 1: Server Action de aceptación**

`src/app/panel/invitacion/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AcceptInvitationResult {
  ok: false;
  message: string;
}

const MIN_PASSWORD_LENGTH = 8;

// Mecánica del flujo de invitación (ver también src/lib/admin/owner-inviter.ts
// para por qué no se usa `action_link`):
// 1. Esta Server Action verifica el `token_hash` con
//    `supabase.auth.verifyOtp({ token_hash, type: 'invite' })`. TIENE que
//    ejecutarse en una Server Action (o Route Handler), NUNCA en un Server
//    Component: createSupabaseServerClient() (src/lib/supabase/server.ts)
//    envuelve la escritura de cookies en un try/catch silencioso porque
//    Next.js prohíbe escribir cookies desde un Server Component — si
//    verifyOtp se llamara desde page.tsx, la sesión se establecería en
//    memoria para ese único render pero el navegador nunca recibiría la
//    cookie, y la siguiente petición (este mismo Server Action) no vería
//    ninguna sesión.
// 2. El token_hash de un `invite` es de un solo uso: si updateUser fallara
//    DESPUÉS de un verifyOtp que sí tuvo éxito, un reintento del formulario
//    ya no podría volver a verificar el mismo token_hash. Por eso se
//    comprueba primero si ya hay una sesión activa (getUser) antes de
//    intentar verifyOtp: si el usuario ya está autenticado (por un intento
//    anterior en esta misma visita), se salta directamente a updateUser.
export async function acceptOwnerInvitationAction(input: {
  tokenHash: string;
  password: string;
  confirmPassword: string;
}): Promise<AcceptInvitationResult> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (input.password !== input.confirmPassword) {
    return { ok: false, message: 'Las contraseñas no coinciden.' };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();

  if (!existingUser) {
    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: input.tokenHash, type: 'invite' });
    if (verifyError) {
      return {
        ok: false,
        message: 'El enlace de invitación no es válido o ha caducado. Pide al super-admin que te envíe uno nuevo.',
      };
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: input.password });
  if (updateError) {
    return { ok: false, message: 'No se pudo establecer la contraseña. Inténtalo de nuevo.' };
  }

  redirect('/panel');
}
```

- [ ] **Step 2: Formulario controlado**

`src/app/panel/invitacion/AcceptInvitationForm.tsx`:

```tsx
'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { acceptOwnerInvitationAction } from './actions';

export function AcceptInvitationForm({ tokenHash }: { tokenHash: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await acceptOwnerInvitationAction({ tokenHash, password, confirmPassword });
      if (result && !result.ok) {
        setMessage(result.message);
        setPassword('');
        setConfirmPassword('');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {message && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
      <label className="block text-sm text-slate-700">
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-slate-700">
        Repite la contraseña
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Guardar y entrar
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Página**

`src/app/panel/invitacion/page.tsx`:

```tsx
import { AcceptInvitationForm } from './AcceptInvitationForm';

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const { token_hash: tokenHash } = await searchParams;

  if (!tokenHash) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Enlace no válido</h1>
        <p className="text-sm text-slate-500">
          Este enlace de invitación no es válido. Pide al super-admin que te envíe uno nuevo.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Crea tu contraseña</h1>
        <p className="text-sm text-slate-500">Establece una contraseña para acceder al panel de tu negocio.</p>
      </div>
      <AcceptInvitationForm tokenHash={tokenHash} />
    </main>
  );
}
```

- [ ] **Step 4: Verificar tipos/lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

Nota: sin test Vitest (necesita cookies/contexto de request reales de Next.js — no cubierto por la convención de este proyecto, igual que `signInAction`/`signOutAction` en `src/app/panel/login/actions.ts`). Se verifica de extremo a extremo en la Tarea 16 (e2e), que genera un `token_hash` real contra el Supabase Auth local.

- [ ] **Step 5: Commit**

```bash
git add src/app/panel/invitacion
git commit -m "feat(panel): el dueño invitado fija su contraseña en /panel/invitacion"
```

---

### Task 15: `/admin/negocios` — listado, alta y activar/suspender

**Files:**
- Create: `src/app/admin/(protected)/negocios/page.tsx`
- Create: `src/app/admin/(protected)/negocios/actions.ts`
- Create: `src/app/admin/(protected)/negocios/CreateBusinessForm.tsx`

**Interfaces:**
- Consumes: `requireAdminSession()` (Tarea 4), `listPlatformBusinesses`/`createPlatformBusiness`/`setPlatformBusinessActive`/`NewBusinessInput` (Tarea 12), `getOwnerInviter()` (Tarea 11), `sendOwnerInvitationEmail`/`OwnerInvitationEmailContext` (Tarea 13), `getEmailSender()` (`src/lib/email/get-email-sender.ts`), `getAppBaseUrl()` (`src/lib/email/urls.ts`).

- [ ] **Step 1: Server Actions**

`src/app/admin/(protected)/negocios/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdminSession } from '@/lib/admin/session';
import { createPlatformBusiness, setPlatformBusinessActive, type NewBusinessInput } from '@/lib/admin/platform-business-service';
import { getOwnerInviter } from '@/lib/admin/owner-inviter';
import { sendOwnerInvitationEmail } from '@/lib/email/owner-invitation';
import { getEmailSender } from '@/lib/email/get-email-sender';
import { getAppBaseUrl } from '@/lib/email/urls';

export interface CreateBusinessActionResult {
  ok: boolean;
  message?: string;
}

// El servicio de dominio no distingue qué campo concreto falló en
// INVALID_INPUT (mismo criterio que services-service.ts/SERVICE_ERROR_MESSAGES
// en el panel), así que el mensaje menciona los casos más comunes.
const CREATE_BUSINESS_ERROR_MESSAGES: Record<'INVALID_INPUT' | 'SLUG_TAKEN' | 'OWNER_INVITE_FAILED', string> = {
  INVALID_INPUT:
    'Revisa los datos: nombre, slug (minúsculas y guiones, no una ruta reservada), el email del dueño (obligatorio) y el de contacto (si lo indicas) válidos.',
  SLUG_TAKEN: 'Ese slug ya está en uso por otro negocio.',
  OWNER_INVITE_FAILED: 'No se pudo invitar al dueño por email. Revisa que el email sea correcto e inténtalo de nuevo.',
};

// El formulario de alta llama a esta acción directamente (no como
// `<form action={fn}>`) desde un componente cliente con estado controlado,
// mismo motivo que createServiceAction/CreateServiceForm en el panel: evita
// que React reinicie los campos del formulario en cuanto la acción termina,
// incluso cuando falla.
export async function createBusinessAction(input: NewBusinessInput): Promise<CreateBusinessActionResult> {
  await requireAdminSession();
  const result = await createPlatformBusiness(prisma, getOwnerInviter(), input);
  revalidatePath('/admin/negocios');
  if (!result.ok) {
    return { ok: false, message: CREATE_BUSINESS_ERROR_MESSAGES[result.reason] };
  }

  // El envío del email va DESPUÉS de que el alta del negocio (operación de
  // negocio) haya tenido éxito, y nunca puede tirar abajo la respuesta:
  // sendOwnerInvitationEmail nunca lanza (trySend interno).
  await sendOwnerInvitationEmail(getEmailSender(), {
    business: { name: result.business.name, accentColor: result.business.accentColor, logoUrl: result.business.logoUrl },
    ownerEmail: input.ownerEmail.trim(),
    invitationUrl: `${getAppBaseUrl()}/panel/invitacion?token_hash=${result.invitationTokenHash}`,
  });

  return { ok: true };
}

// Botón suelto sin campos que perder: sigue el patrón `?aviso=` de
// setServiceActiveAction (Fase 5) en vez de devolver estado al cliente.
export async function setBusinessActiveAction(businessId: string, active: boolean): Promise<void> {
  await requireAdminSession();
  const result = await setPlatformBusinessActive(prisma, businessId, active);
  revalidatePath('/admin/negocios');
  if (!result.ok) {
    redirect('/admin/negocios?aviso=accion-no-aplicada');
  }
}
```

- [ ] **Step 2: Formulario de alta**

`src/app/admin/(protected)/negocios/CreateBusinessForm.tsx`:

```tsx
'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { BusinessType } from '@prisma/client';
import { createBusinessAction } from './actions';

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  HAIR_SALON: 'Peluquería',
  BARBERSHOP: 'Barbería',
  CLINIC: 'Clínica',
  SPA: 'Spa',
  OTHER: 'Otro',
};

export function CreateBusinessForm() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState<BusinessType>('OTHER');
  const [businessEmail, setBusinessEmail] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createBusinessAction({
        name,
        slug,
        type,
        businessEmail: businessEmail.trim() || null,
        ownerEmail,
      });
      if (result.ok) {
        setMessage('Negocio creado. Se ha enviado la invitación al dueño por email.');
        setName('');
        setSlug('');
        setType('OTHER');
        setBusinessEmail('');
        setOwnerEmail('');
      } else {
        setMessage(result.message ?? 'No se pudo crear el negocio.');
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold text-slate-900">Nuevo negocio</h2>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          Slug
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            maxLength={60}
            placeholder="mi-negocio"
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          Tipo
          <select
            value={type}
            onChange={(e) => setType(e.target.value as BusinessType)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          >
            {Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Email de contacto
          <input
            type="email"
            value={businessEmail}
            onChange={(e) => setBusinessEmail(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
          <span className="mt-1 block text-xs text-slate-400">Opcional. Visible en la página pública del negocio.</span>
        </label>
        <label className="text-sm">
          Email del dueño
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
          <span className="mt-1 block text-xs text-slate-400">Obligatorio. Recibe la invitación para acceder al panel.</span>
        </label>

        {message && <p className="rounded bg-red-50 px-3 py-2 text-sm text-slate-700 sm:col-span-2">{message}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Crear negocio
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Página de listado**

`src/app/admin/(protected)/negocios/page.tsx`:

```tsx
import Link from 'next/link';
import { requireAdminSession } from '@/lib/admin/session';
import { prisma } from '@/lib/db';
import { listPlatformBusinesses } from '@/lib/admin/platform-business-service';
import { setBusinessActiveAction } from './actions';
import { CreateBusinessForm } from './CreateBusinessForm';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date
  );
}

export default async function AdminNegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  await requireAdminSession();
  const { aviso } = await searchParams;
  const businesses = await listPlatformBusinesses(prisma);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Negocios</h1>

      {aviso === 'accion-no-aplicada' && (
        <div className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>Esa acción ya no se puede aplicar: el negocio cambió mientras tanto. La lista se ha actualizado.</span>
          <Link href="/admin/negocios" className="font-medium underline shrink-0">
            Cerrar
          </Link>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Fecha de alta</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => (
              <tr key={business.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{business.name}</td>
                <td className="px-4 py-2 text-slate-500">{business.slug}</td>
                <td className="px-4 py-2">{business.active ? 'Activo' : 'Suspendido'}</td>
                <td className="px-4 py-2 text-slate-500">{formatDate(business.createdAt)}</td>
                <td className="px-4 py-2">
                  <form action={setBusinessActiveAction.bind(null, business.id, !business.active)}>
                    <button type="submit" className="text-xs text-slate-500 underline">
                      {business.active ? 'Suspender' : 'Activar'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {businesses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Todavía no hay negocios de alta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateBusinessForm />
    </div>
  );
}
```

- [ ] **Step 4: Verificar manualmente**

Con `pnpm dev` levantado, entra en `/admin/negocios` como super-admin, crea un negocio y confirma en el terminal (`ConsoleEmailSender`, sin `RESEND_API_KEY`) que se registra el email "Te han dado de alta como dueño de ... en Appoint" con un enlace `http://localhost:3000/panel/invitacion?token_hash=...`. Pulsa "Suspender" y confirma que el estado cambia a "Suspendido".

- [ ] **Step 5: Verificar tipos/lint/tests**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: sin errores; todos los tests en verde.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(protected)/negocios"
git commit -m "feat(admin): alta de negocios y activar/suspender desde /admin/negocios"
```

---

### Task 16: e2e Playwright — flujo completo de super-admin

**Files:**
- Create: `e2e/admin-flow.spec.ts`

**Interfaces:**
- Consumes: `getDemoSuperAdminCredentials()` (Tarea 3), `getSupabaseAdminAuthClient()` (Tarea 2).

Alcance decidido: el flujo de invitación real (email nativo) no puede probarse en e2e sin interceptar un email de verdad, PERO `generateLink` no dispara ningún email nativo — solo genera el enlace — así que el test SÍ puede completar el flujo de extremo a extremo: genera el `hashed_token` real llamando a la Admin API directamente (igual que hace `/admin/negocios` en producción, sin pasar por nuestra plantilla de email, que ya está cubierta por el test de la Tarea 13), navega con él a `/panel/invitacion` y confirma que el dueño entra al panel. También verifica que suspender el negocio bloquea `/panel` a su dueño con sesión ya activa (cierre del bug de la Tarea 5).

- [ ] **Step 1: Escribir el test**

`e2e/admin-flow.spec.ts`:

```ts
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
  await ownerPage.getByLabel('Contraseña').fill('contraseña-e2e-123');
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
```

- [ ] **Step 2: Ejecutar**

Asegúrate de que no hay ningún `pnpm dev` corriendo en el puerto 3000 (el webServer de Playwright arranca el suyo propio contra `appoint_test`).

Run: `pnpm exec playwright test admin-flow`
Expected: `1 passed`.

- [ ] **Step 3: Ejecutar toda la suite e2e**

Run: `pnpm exec playwright test`
Expected: `3 passed` (`booking-flow.spec.ts`, `panel-approval.spec.ts`, `admin-flow.spec.ts`).

- [ ] **Step 4: Commit**

```bash
git add e2e/admin-flow.spec.ts
git commit -m "test(e2e): flujo completo de super-admin (alta, invitación y suspensión)"
```

---

### Task 17: Actualizar `CONTINUAR.md`

**Files:**
- Modify: `docs/superpowers/CONTINUAR.md`

- [ ] **Step 1: Reescribir el documento**

Reemplazar el contenido completo de `docs/superpowers/CONTINUAR.md` por:

```markdown
# Continuación del proyecto — estado y siguientes pasos

_Actualizado: 2026-07-21 tras completar el ALCANCE DE PANEL de la Fase 6 (super-admin): revisión pendiente de mergear a `main`. El despliegue real (dominio, Vercel, Supabase producción) sigue sin empezar — ver "Después de la Fase 6" más abajo._

## Estado actual

- **Hecho**: Fases 1-2 (fundación + motor de reservas, merge `6492edb`), Fase 3 (página pública, mergeada 2026-07-16), Fase 4 (emails y recordatorios, mergeada a `main` 2026-07-17), Fase 5 (panel del negocio, mergeada 2026-07-20) y **Fase 6 — panel de super-admin** (el despliegue real queda para una fase separada, ver más abajo).
- **Fase 6 construido**: tabla `PlatformAdmin` (rol de plataforma independiente de `MembershipRole`) con su propio guardián de sesión (`requireAdminSession()`, `src/lib/admin/session.ts`) y middleware compartido con `/panel` (`src/middleware.ts`, resuelve la zona protegida por prefijo de ruta); `/admin/login`; dashboard `/admin` con dos métricas (negocios activos, citas de la semana en curso en Europe/Madrid — `src/lib/admin/platform-metrics-service.ts`); `/admin/negocios` con listado, alta de negocio (crea `Business` + invita al dueño real por email vía Supabase Auth Admin API + `Membership` OWNER, con rollback compensatorio si la invitación falla — `src/lib/admin/platform-business-service.ts`) y activar/suspender; plantilla de email "invitación de dueño" (`OwnerInvitationEmail.tsx` + `sendOwnerInvitationEmail`); ruta pública `/panel/invitacion` donde el dueño invitado fija su contraseña (`supabase.auth.verifyOtp({token_hash, type:'invite'})` + `updateUser({password})`, ambos en un Server Action — nunca en un Server Component, ver comentario en `src/app/panel/invitacion/actions.ts`); cierre de un bug real de Fase 5 (`requirePanelSession()` no comprobaba `Business.active`, así que un negocio suspendido seguía siendo accesible desde `/panel` para su dueño).
- **Verificación**: `pnpm test` (Vitest contra Postgres real) + `pnpm lint` + `pnpm exec tsc --noEmit` + `pnpm exec playwright test` (incluye `e2e/admin-flow.spec.ts`: login super-admin, alta de negocio, invitación completada con token real generado directamente en el test, y suspensión bloqueando el panel del dueño) — todo en verde.
- **Disciplina multi-tenancy**: las funciones de `/admin` operan SIN `businessId` de sesión (alcance de plataforma, agregan sobre todos los negocios a propósito) y llevan el prefijo `Platform`/`Admin` en su nombre (`platform-business-service.ts`, `platform-metrics-service.ts`, `requireAdminSession`, `isPlatformAdmin`) para no confundirse con los servicios tenant-scoped de `src/lib/panel/*`.
- **Proceso usado**: superpowers — writing-plans → subagent-driven-development. Plan en `docs/superpowers/plans/2026-07-21-fase-6-super-admin.md`.
- **Política de modelos** (petición del usuario): haiku para tareas mecánicas, sonnet para implementación estándar/investigación, opus para revisión global. El modelo principal solo orquesta.

## Mecánica investigada de la invitación de dueños (relevante para tocar este flujo en el futuro)

`supabase.auth.admin.generateLink({ type: 'invite', email })` crea el usuario y devuelve `properties.hashed_token` + `properties.action_link`. Este proyecto usa `hashed_token` directamente (`/panel/invitacion?token_hash=...` + `supabase.auth.verifyOtp({token_hash, type:'invite'})`) y **nunca** `action_link`: el cliente de navegador (`createBrowserClient` de `@supabase/ssr`) fija `flowType: 'pkce'` de forma fija, y el `action_link` nativo de Supabase produce un callback de grant IMPLÍCITO (fragmento `#access_token=...`) que `@supabase/auth-js` rechaza con `AuthPKCEGrantCodeExchangeError` cuando el cliente está en modo PKCE. Ver el comentario completo en `src/lib/admin/owner-inviter.ts`.

## Avisos técnicos para después de la Fase 6

- **Despliegue real**: dominio propio, Vercel (build + Cron) y proyecto Supabase de producción siguen SIN EMPEZAR. Cuando se aborde: replicar en producción las variables de `.env.example` (incluidas las nuevas `DEMO_SUPERADMIN_EMAIL`/`DEMO_SUPERADMIN_PASSWORD` — o mejor, dar de alta ahí un super-admin real y no depender de esas credenciales demo en producción), y revisar `supabase/config.toml` (`site_url`/`additional_redirect_urls`) si en el futuro se decide usar el `action_link` nativo de Supabase para algún flujo (hoy no se usa, ver arriba).
- **Patrón `OwnerInviter` inyectable** (`src/lib/admin/owner-inviter.ts`): mismo patrón que `EmailSender` — cualquier lógica nueva que dependa de la Admin API de Supabase Auth debería inyectarse igual, para poder testear con un Fake sin golpear el servicio real desde Vitest.
- **Rol `STAFF`** sigue declarado en `MembershipRole` pero sin UI ni lógica de autorización — candidato para una fase futura si se decide dar acceso de panel a empleados, no solo a dueños.
- El seed de super-admin (`src/lib/seed/demo-superadmin.ts`) es idempotente de principio a fin (aprendizaje de un bug real corregido a posteriori en el seed de negocio demo de Fase 5 — no repetido aquí).

## Minors conocidos (no bloquean; candidatos a limpieza oportunista)

### Fase 4 + anteriores
- Alternativas de hueco solo se ofrecen con `SLOT_TAKEN`; los mensajes de `EMPLOYEE_UNAVAILABLE`/`NO_EMPLOYEE_AVAILABLE` invitan a "otro horario" sin ofrecerlas (`booking-service.ts`).
- Al volver de un error en la hoja de reserva, se pierden nombre/teléfono/email tecleados (remonta `StepCustomerData`).
- El selector de día renderiza `maxBookingWindowDays` botones (30 por defecto; pesado si un negocio configura ventanas grandes).
- Pantalla neutra de "no encontrado" duplicada (candidato a extraer un `NeutralErrorScreen` compartido); descarga `.ics` vía data-URI sin verificar en iOS Safari; `img` en vez de `next/image` (sin `remotePatterns`).
- **Deuda consciente del motor (no tocar sin necesidad)**: TOCTOU en límites anti-fraude fuera de la transacción; `checkRateLimit` acoplado al flujo insertar-antes-de-contar; los tests de carrera aceptan `EMPLOYEE_UNAVAILABLE` además de `SLOT_TAKEN` (pre-check fuera de la transacción).
- El copy "es mañana" del recordatorio es impreciso en los bordes del día (la ventana ahora es `[now+23h, now+25h)`); comparación no constant-time en `cron-auth` (aceptado: el secreto es de alta entropía).

### Fase 5
- **Vista de semana simplificada**: misma columna por empleado, 7 días agregados en el mismo rango, sin agrupar por franjas horarias — funcional pero más simple que un calendario semanal clásico (iteración UI si es necesario).
- **Sin adjunto `.ics` en email de "cita aprobada"**: solo enlace a `/cita/{token}`, que ya ofrece descarga `.ics` desde Fase 3 — decisión conservadora confirmada (no extender `EmailMessage` con adjuntos).
- **Sin paginación en `/panel/clientes`**: razonable para volumen local, pero si el usuario anticipa cientos de clientes, revisar esta decisión.
- **Editores de horario y servicios sin claim atómico**: si dos pestañas del panel editan lo mismo, la última en guardar gana (mismo patrón que resto de CRUD). Riesgo bajo (dueño solo, uso secuencial).
- Una cita aprobada con menos de 23h de antelación no recibe recordatorio 24h (propiedad de diseño del cron, aceptada).
- Las ausencias (`TimeOff`) no tienen límites de fecha razonables en el formulario — sin precedente en el resto del formulario, documentado como conocido.

### Fase 6
- **`appointmentsThisWeekCount` cuenta todos los estados** (incluidas `CANCELLED`/`NO_SHOW`) y no excluye negocios suspendidos — decisión consciente de simplicidad (spec solo pide "citas de la semana", sin más matices); revisar si en el futuro se quiere un contador "solo activas".
- **Política de contraseña del dueño invitado**: mínimo 8 caracteres, elegido en ausencia de una política explícita en la spec (Supabase Auth exige por defecto un mínimo de 6). Revisar si el usuario quiere una política más estricta.
- **Sin paginación en `/admin/negocios`**: razonable mientras el número de negocios sea bajo; revisar si el catálogo crece mucho.

## Avisos del motor que siguen vigentes

- **Dedupe de huecos**: con "cualquier profesional" el motor devuelve un slot por empleado; la capa pública ya deduplica por `start` (`getDedupedAvailableSlotsForBusiness`).
- **`manualApproval`**: cambio de comportamiento real en `confirmAppointment` (no solo copy) — con `manualApproval = true`, la cita pasa a `PENDING` esperando aprobación del negocio en `/panel`, con envío de email de aprobación cuando se confirma.

## Después de la Fase 6

- **Despliegue real**: dominio, certificados, Vercel + Supabase en producción — sigue explícitamente pendiente, no cubierto por ningún plan ejecutado hasta ahora.

## Cómo arrancar el entorno

```powershell
pnpm exec supabase start        # Docker debe estar activo; BD dev en :54322
pnpm db:seed                    # opcional: popula demo "Salón Aura" + dueño OWNER + super-admin
pnpm test                       # contra appoint_test
pnpm exec playwright test       # e2e: booking-flow + panel-approval + admin-flow
pnpm dev                        # Next.js en localhost:3000
```

`.env` no está en git: copiar `.env.example`. Las variables de Supabase Auth (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), de demo owner (`DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD`) y de demo super-admin (`DEMO_SUPERADMIN_EMAIL`, `DEMO_SUPERADMIN_PASSWORD`) ya están configuradas por defecto. Sin `RESEND_API_KEY` real, todos los emails (incluidos la invitación de dueño y los del panel) se registran en consola (`ConsoleEmailSender`) — suficiente para dev/QA manual. Sin `CRON_SECRET`, el endpoint `/api/cron/reminders` devuelve 401 pero puedes invocar el cron directamente desde un script si necesitas probarlo.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/CONTINUAR.md
git commit -m "docs: actualiza CONTINUAR.md tras el panel de super-admin (Fase 6)"
```

---

## Self-Review

**1. Cobertura de la spec** (`docs/superpowers/specs/2026-07-12-appoint-design.md`, sección Super-admin y decisiones del usuario):
- `/admin/login` → Tarea 7. ✅
- `/admin` dashboard con métricas (negocios activos, citas/semana) → Tareas 8-10. ✅
- `/admin/negocios`: listado (nombre, slug, estado, fecha de alta) + alta + activar/suspender → Tareas 11-12, 15. ✅
- Plantilla "invitación de dueño" excluida de Fase 4 → Tarea 13. ✅
- Modelo `PlatformAdmin` propio (decisión 2) → Tarea 1. ✅
- Alta con invitación real (`generateLink` + `Membership` OWNER en la misma operación, decisión 3) → Tarea 12; investigación de la mecánica real → sección previa a las tareas + Tarea 11/14. ✅
- Cierre del bug de `requirePanelSession()` (decisión 4) → Tarea 5. ✅
- Activar/suspender con criterio de claim atómico (decisión 5) → Tarea 12 (`setPlatformBusinessActive`). ✅
- Métricas con helpers de `timezone.ts`, sin calcular límites a mano (decisión 6) → Tareas 8-9. ✅
- Seed idempotente del primer super-admin con `DEMO_SUPERADMIN_EMAIL`/`DEMO_SUPERADMIN_PASSWORD` → Tarea 3. ✅
- e2e: login + alta + verificación de invitación/suspensión → Tarea 16. ✅
- Ninguna tarea de despliegue real, dominio o Vercel/Supabase producción → confirmado, solo mención documental en Tarea 17. ✅
- Slug `panel` reservado (aviso de Fase 5) + `admin`/`cita`/`confirmar`/`api` → Tarea 12 (`RESERVED_SLUGS`). ✅

**2. Placeholders**: repasado cada bloque de código — sin `TODO`/`TBD`/"añadir manejo de errores" genérico; cada mensaje de error, cada validación y cada redirect tienen el texto/código final. El único punto que podría parecer "no verificado en tests" (la llamada real a `generateLink`/`verifyOtp`) está documentado explícitamente como decisión consciente (mismo criterio que `ensureDemoOwnerAuthUser`), no como placeholder, y queda cubierto por Vitest vía inyección de fakes (Tarea 12) y por Playwright contra el servicio real (Tarea 16).

**3. Consistencia de tipos**: `NewBusinessInput` (Tarea 12, con `businessEmail: string | null` y `ownerEmail: string` como campos separados — decisión confirmada por el usuario tras detectar la ambigüedad en la primera versión del plan) es el mismo tipo usado en `createBusinessAction`/`CreateBusinessForm` (Tarea 15): el formulario envía `businessEmail: businessEmail.trim() || null` y `ownerEmail` sin transformar (se recorta en el servicio), `createBusinessAction` construye `invitationUrl` a partir de `input.ownerEmail.trim()` (no de `businessEmail`), y el test de la Tarea 12 comprueba que `ownerInviter.generateInviteLink` recibe siempre `ownerEmail` mientras que `result.business.email` refleja `businessEmail`. `OwnerInviter`/`OwnerInvitationLink` (Tarea 11) coinciden entre `owner-inviter.ts`, `platform-business-service.ts` y su test. `CreatePlatformBusinessResult` en éxito expone `invitationTokenHash`, usado tal cual en `createBusinessAction` para construir `invitationUrl`. `AdminSession { userId, email }` (Tarea 4) coincide con el uso en el layout (Tarea 10) y `AcceptInvitationResult { ok: false, message }` (Tarea 14) coincide entre `actions.ts` y `AcceptInvitationForm.tsx`. `isBusinessActive`/`getOwnerBusinessIdForUser` (Tarea 5) no cambian la firma de `PanelSession`, ya consumida por todo `/panel/(protected)`.

## Ambigüedades y riesgos detectados (no resueltos por mí — decisión conservadora aplicada, a confirmar con el usuario)

1. **Política de longitud de contraseña del dueño invitado**: la spec no la especifica. Elegí mínimo 8 caracteres (Supabase Auth exige 6 por defecto) como opción conservadora intermedia. Documentado en `docs/superpowers/CONTINUAR.md` (Tarea 17) y en el propio código (`MIN_PASSWORD_LENGTH` en `src/app/panel/invitacion/actions.ts`).
2. **`appointmentsThisWeekCount` incluye TODOS los estados** (`CANCELLED`/`NO_SHOW` incluidos) y no excluye negocios suspendidos. La spec solo dice "citas/semana" sin matizar; elegí la interpretación más simple (agregado sin filtros adicionales) en vez de inventar un filtro no pedido. Documentado como decisión consciente en el código y en `CONTINUAR.md`.
3. **Verificación real de que `admin.generateLink({type:'invite'})` funciona contra la imagen de Supabase Auth local** (`pnpm exec supabase start`) no se pudo ejecutar en esta sesión (solo se planifica, no se implementa). Confirmé por lectura de código fuente que `'invite'` es un `EmailOtpType`/`GenerateLinkType` soportado por la versión instalada del SDK (2.110.7) y que la mecánica de `hashed_token` + `verifyOtp` es la vía documentada y sin dependencia de configuración de redirects — pero recomiendo que la Tarea 16 (e2e) sea la primera confirmación real contra el stack local; si algo en la imagen de GoTrue local difiere, aparecerá ahí, no antes.

**Resuelta durante la revisión** (ya no es ambigüedad, reflejada en el plan): el email de contacto del negocio (`Business.email`, opcional) y el email del dueño (obligatorio, usado para la invitación) son dos campos separados — `NewBusinessInput.businessEmail: string | null` y `NewBusinessInput.ownerEmail: string` en la Tarea 12, con dos inputs distintos en `CreateBusinessForm` (Tarea 15).
