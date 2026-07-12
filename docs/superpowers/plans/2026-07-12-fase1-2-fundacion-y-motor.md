# Appoint — Fase 1 (Fundación) y Fase 2 (Motor de reservas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la base técnica de Appoint (Fase 1) y el motor de reservas headless (Fase 2): proyecto Next.js con Prisma sobre Supabase, esquema de datos completo, datos demo, y un módulo `src/lib/booking/` con cálculo de huecos disponibles, reserva transaccional, reglas anti-fraude y transiciones de estado — todo cubierto por tests que corren contra una base de datos Postgres real.

**Architecture:** Monolito Next.js (App Router) con Prisma como capa de acceso a datos sobre PostgreSQL de Supabase. La Fase 1 deja el esqueleto del proyecto, el esquema completo de todas las tablas de negocio y los datos de un negocio demo reutilizables como fixture de test. La Fase 2 construye, en TDD puro y sin UI, el módulo `src/lib/booking/` que encapsula toda la lógica de negocio de la reserva (huecos, asignación "cualquier profesional", anti-fraude, transacción de reserva, confirmación/cancelación por token, transiciones de estado), diseñado para ser consumido después por Server Actions/Route Handlers en fases posteriores (fuera de este plan).

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, Prisma 6, PostgreSQL (Supabase), Vitest, date-fns + date-fns-tz, pnpm.

## Global Constraints

- Next.js 15 con App Router, TypeScript en modo `strict`, Tailwind CSS v4.
- Prisma 6 sobre PostgreSQL (Supabase); Vitest para pruebas; pnpm como único gestor de paquetes.
- Las citas se almacenan en UTC en la base de datos; la zona horaria del negocio es `Europe/Madrid`.
- Cálculo de fechas/horas exclusivamente con `date-fns` + `date-fns-tz`. Prohibido usar `moment` o `luxon`.
- Restricción única parcial `(employeeId, start)` para citas activas (`PENDING` no caducada + `CONFIRMED`): Prisma no soporta índices parciales en el DSL del `schema.prisma`, así que se crea a mano vía SQL en la migración (`prisma migrate dev --create-only` + edición manual del archivo `migration.sql`).
- Los tests del motor de reservas corren contra una base de datos Postgres de **test real** (Vitest con `globalSetup` que ejecuta `prisma migrate deploy` y un `beforeEach` que trunca las tablas). Prohibido mockear `PrismaClient`.
- Expiración perezosa: las citas `PENDING` caducan a los 30 minutos desde su creación; no hay cron de limpieza — el motor simplemente las ignora en cualquier cálculo de "cita activa".
- Todo el texto del plan está en español; los identificadores de código (variables, funciones, tipos) están en inglés.
- Todos los comandos son compatibles con PowerShell/Windows.
- La Fase 2 no incluye UI: solo lógica en `src/lib/booking/`, sin Server Actions ni componentes React.

---

## Fase 1 — Fundación

### Tarea 1: Inicializar el proyecto Next.js

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`, `.eslintrc` (o `eslint.config.mjs`, según genere create-next-app)

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: proyecto Next.js base con `package.json` y sus scripts (`dev`, `build`, `start`, `lint`), usado como base por todas las tareas siguientes.

- [ ] **Step 1: Generar el proyecto con create-next-app**

Ejecuta en la raíz `C:\Projects\Claude\Appoint` (el directorio ya contiene `docs/`, lo cual no genera conflicto porque create-next-app solo aborta si detecta archivos con el mismo nombre que los que va a crear):

```powershell
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

Expected: el comando termina con `Success! Created appoint at C:\Projects\Claude\Appoint` (o similar) y crea `package.json`, `src/app/`, `tsconfig.json`, `postcss.config.mjs`, etc. La carpeta `docs/` permanece intacta.

- [ ] **Step 2: Verificar que TypeScript está en modo strict**

Abre `tsconfig.json` y confirma que contiene:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

Expected: `"strict": true` ya está presente por defecto (create-next-app con `--typescript` lo activa). Si no lo estuviera, añádelo dentro de `compilerOptions`.

- [ ] **Step 3: Verificar que Tailwind v4 está instalado**

Ejecuta:

```powershell
pnpm list tailwindcss
```

Expected: la salida muestra `tailwindcss 4.x.x`. Abre `src/app/globals.css` y confirma que la primera línea es `@import "tailwindcss";` (sintaxis de Tailwind v4, distinta de las tres directivas `@tailwind` de v3).

- [ ] **Step 4: Verificar que el proyecto arranca**

```powershell
pnpm build
```

Expected: termina con `✓ Compiled successfully` y un resumen de rutas (`○ /`).

- [ ] **Step 5: Commit**

```powershell
git init
git add -A
git commit -m "chore: inicializar proyecto Next.js 15 con TypeScript strict y Tailwind v4"
```

Expected: `git commit` confirma la creación del commit inicial.

---

### Tarea 2: Variables de entorno y cliente Prisma base

**Files:**
- Create: `.env`, `.env.example`, `src/lib/db.ts`
- Modify: `.gitignore`, `package.json`

**Interfaces:**
- Consumes: `package.json` (Tarea 1).
- Produces: `prisma/schema.prisma` (solo `datasource`/`generator`, sin modelos todavía — la Tarea 3 lo completa); `src/lib/db.ts` exporta `prisma: PrismaClient` para uso en la app (Server Actions/Route Handlers de fases futuras, no usado por los tests del motor).

- [ ] **Step 1: Instalar Prisma y dependencias auxiliares**

```powershell
pnpm add @prisma/client
pnpm add -D prisma tsx dotenv
```

Expected: `package.json` gana `@prisma/client` en `dependencies` y `prisma`, `tsx`, `dotenv` en `devDependencies`.

- [ ] **Step 2: Inicializar Prisma**

```powershell
pnpm exec prisma init --datasource-provider postgresql
```

Expected: crea `prisma/schema.prisma` (con `datasource db` y `generator client` básicos) y un archivo `.env` con una línea `DATABASE_URL="postgresql://..."`.

- [ ] **Step 3: Completar `.env` con las tres cadenas de conexión**

Edita `.env` para que quede así (sustituye los valores por los de tu proyecto Supabase — Project Settings → Database → Connection string; usa el puerto **6543** con `pgbouncer=true` para `DATABASE_URL`, el puerto **5432** para `DIRECT_URL`, y una base Postgres separada para tests, local o un segundo proyecto Supabase):

```
DATABASE_URL="postgresql://postgres.xxxxxxxxxxxx:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxxxxxxxxxx:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/appoint_test"
```

Expected: `.env` contiene las tres variables con valores reales (no placeholders) apuntando a bases de datos que existen y son accesibles. Si usas Supabase local (`supabase start`), `TEST_DATABASE_URL` puede apuntar a `postgresql://postgres:postgres@127.0.0.1:54322/postgres` con un esquema distinto, o a una base Postgres local independiente creada con `createdb appoint_test`.

- [ ] **Step 4: Crear `.env.example`**

```
DATABASE_URL="postgresql://user:password@host:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/postgres"
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/appoint_test"
```

Expected: archivo creado, sin secretos reales, para que otros desarrolladores sepan qué variables configurar.

- [ ] **Step 5: Añadir `directUrl` al datasource**

Edita `prisma/schema.prisma` (creado en el Step 2) para que el bloque `datasource` quede:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

`directUrl` es necesario porque `DATABASE_URL` apunta al pooler de Supabase (pgbouncer), que no soporta las operaciones DDL que `prisma migrate` necesita; `DIRECT_URL` es la conexión directa a Postgres usada solo para migraciones.

- [ ] **Step 6: Asegurar que `.env` no se versiona**

Confirma que `.gitignore` (generado por create-next-app) contiene una línea `.env*` o añade explícitamente:

```
.env
.env.test
```

Expected: `git status` no lista `.env` como archivo nuevo para commitear.

- [ ] **Step 7: Crear el cliente Prisma singleton de la app**

Crea `src/lib/db.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

Expected: archivo creado. `@prisma/client` aún no tiene el modelo `Business` etc. generado hasta la Tarea 3/4, así que este archivo compilará una vez el cliente se genere; por ahora solo verifica que no hay errores de sintaxis con:

```powershell
pnpm exec tsc --noEmit
```

Expected: puede fallar con `Cannot find module '@prisma/client' or its corresponding type declarations` si el cliente no se ha generado nunca — eso es esperado en este punto y se resuelve en la Tarea 4. Si el error es distinto (sintaxis), corrígelo antes de continuar.

- [ ] **Step 8: Commit**

```powershell
git add .env.example src/lib/db.ts prisma/schema.prisma .gitignore package.json pnpm-lock.yaml
git commit -m "chore: configurar Prisma y variables de entorno de conexión a Supabase"
```

Expected: commit creado (nota: `.env` no se incluye, solo `.env.example`).

---

### Tarea 3: Esquema Prisma completo

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: `prisma/schema.prisma` base (Tarea 2).
- Produces: esquema completo con todos los modelos y enums de la spec (`Business`, `Membership`, `Service`, `Employee`, `ServiceEmployee`, `WorkingHours`, `TimeOff`, `Appointment`, `Customer`, `BlacklistEntry`, `BookingAttempt`) y enums (`BusinessType`, `MembershipRole`, `ThemePreset`, `AppointmentStatus`, `AppointmentSource`) — tipos consumidos por `@prisma/client` en todas las tareas siguientes.

- [ ] **Step 1: Escribir el esquema completo**

Reemplaza el contenido de `prisma/schema.prisma` por:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum BusinessType {
  HAIR_SALON
  BARBERSHOP
  CLINIC
  SPA
  OTHER
}

enum MembershipRole {
  OWNER
  STAFF
}

enum ThemePreset {
  BOUTIQUE_EDITORIAL
  VIBRANT
  MINIMAL_SERENE
}

enum AppointmentStatus {
  PENDING
  CONFIRMED
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum AppointmentSource {
  QR
  WEB
  MANUAL
}

model Business {
  id                      String       @id @default(uuid())
  slug                    String       @unique
  name                    String
  type                    BusinessType @default(OTHER)
  address                 String?
  phone                   String?
  email                   String?
  themePreset             ThemePreset  @default(BOUTIQUE_EDITORIAL)
  accentColor             String       @default("#B25539")
  logoUrl                 String?
  maxBookingWindowDays    Int          @default(30)
  minAdvanceNoticeMinutes Int          @default(60)
  cancellationPolicy      String?
  manualApproval          Boolean      @default(false)
  slotGranularityMinutes  Int          @default(15)
  active                  Boolean      @default(true)
  createdAt               DateTime     @default(now())
  updatedAt               DateTime     @updatedAt

  memberships      Membership[]
  services         Service[]
  employees        Employee[]
  appointments     Appointment[]
  customers        Customer[]
  blacklistEntries BlacklistEntry[]
  bookingAttempts  BookingAttempt[]
}

model Membership {
  id         String         @id @default(uuid())
  userId     String
  businessId String
  role       MembershipRole
  createdAt  DateTime       @default(now())

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@unique([userId, businessId])
  @@index([businessId])
}

model Service {
  id                 String   @id @default(uuid())
  businessId         String
  name               String
  description        String?
  durationMinutes    Int
  priceCents         Int
  bufferAfterMinutes Int      @default(0)
  active             Boolean  @default(true)
  sortOrder          Int      @default(0)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  business     Business          @relation(fields: [businessId], references: [id], onDelete: Cascade)
  employees    ServiceEmployee[]
  appointments Appointment[]

  @@index([businessId])
}

model Employee {
  id         String   @id @default(uuid())
  businessId String
  name       String
  photoUrl   String?
  color      String   @default("#B25539")
  userId     String?
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  business     Business          @relation(fields: [businessId], references: [id], onDelete: Cascade)
  services     ServiceEmployee[]
  workingHours WorkingHours[]
  timeOff      TimeOff[]
  appointments Appointment[]

  @@index([businessId])
}

model ServiceEmployee {
  serviceId  String
  employeeId String

  service  Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@id([serviceId, employeeId])
}

model WorkingHours {
  id          String @id @default(uuid())
  employeeId  String
  weekday     Int
  startMinute Int
  endMinute   Int

  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@index([employeeId, weekday])
}

model TimeOff {
  id         String   @id @default(uuid())
  employeeId String
  start      DateTime
  end        DateTime
  reason     String?

  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@index([employeeId, start, end])
}

// La combinación (employeeId, start) debe ser única entre citas activas
// (status PENDING o CONFIRMED) como red de seguridad ante condiciones de
// carrera. Prisma no soporta índices únicos parciales en el DSL del schema:
// el índice se crea a mano en prisma/migrations/<timestamp>_init/migration.sql
// (ver Tarea 4 del plan de implementación). Si en el futuro se genera una
// migración nueva con `prisma migrate dev`, revisa el SQL propuesto por si
// intenta eliminar ese índice manual (no está descrito en este schema) y
// quita esa sentencia antes de aplicarlo.
model Appointment {
  id            String            @id @default(uuid())
  businessId    String
  serviceId     String
  employeeId    String
  customerId    String
  customerName  String
  customerPhone String
  customerEmail String
  start         DateTime
  end           DateTime
  status        AppointmentStatus @default(PENDING)
  confirmToken  String            @unique @default(uuid())
  cancelToken   String            @unique @default(uuid())
  source        AppointmentSource @default(WEB)
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  service  Service  @relation(fields: [serviceId], references: [id])
  employee Employee @relation(fields: [employeeId], references: [id])
  customer Customer @relation(fields: [customerId], references: [id])

  @@index([businessId])
  @@index([employeeId, start])
  @@index([customerId])
}

model Customer {
  id               String   @id @default(uuid())
  businessId       String
  name             String
  phone            String
  email            String
  registered       Boolean  @default(false)
  marketingConsent Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  business     Business      @relation(fields: [businessId], references: [id], onDelete: Cascade)
  appointments Appointment[]

  @@unique([businessId, email])
  @@unique([businessId, phone])
}

model BlacklistEntry {
  id         String   @id @default(uuid())
  businessId String
  phone      String?
  email      String?
  reason     String?
  createdAt  DateTime @default(now())

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId])
}

// No forma parte del modelo de datos descrito literalmente en la spec, pero
// es necesaria para implementar la regla anti-fraude "máx. 5 intentos de
// reserva/hora por IP": registra cada intento de reserva (exitoso o no) por
// negocio + IP para poder contarlos en una ventana de una hora.
model BookingAttempt {
  id         String   @id @default(uuid())
  businessId String
  ipAddress  String
  createdAt  DateTime @default(now())

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId, ipAddress, createdAt])
}
```

- [ ] **Step 2: Formatear y validar el esquema**

```powershell
pnpm exec prisma format
pnpm exec prisma validate
```

Expected: `prisma format` reordena espacios sin errores; `prisma validate` imprime `The schema at prisma\schema.prisma is valid 🚀`.

- [ ] **Step 3: Commit**

```powershell
git add prisma/schema.prisma
git commit -m "feat: definir el esquema Prisma completo del modelo de datos de Appoint"
```

Expected: commit creado.

---

### Tarea 4: Migración inicial y restricción única parcial

**Files:**
- Create: `prisma/migrations/<timestamp>_init/migration.sql`, `prisma/migrations/migration_lock.toml`

**Interfaces:**
- Consumes: `prisma/schema.prisma` completo (Tarea 3).
- Produces: base de datos de desarrollo con todas las tablas creadas + índice único parcial `Appointment_employeeId_start_active_key`; `@prisma/client` regenerado con los tipos `Business`, `Membership`, `Service`, `Employee`, `ServiceEmployee`, `WorkingHours`, `TimeOff`, `Appointment`, `Customer`, `BlacklistEntry`, `BookingAttempt`, `PrismaClient`, `Prisma` (namespace), enums `BusinessType`/`MembershipRole`/`ThemePreset`/`AppointmentStatus`/`AppointmentSource` — usados por todas las tareas siguientes.

- [ ] **Step 1: Generar la migración sin aplicarla**

Asegúrate de que `DATABASE_URL` y `DIRECT_URL` en `.env` apuntan a un proyecto Supabase (o Postgres) real y accesible (Tarea 2, Step 3), luego ejecuta:

```powershell
pnpm exec prisma migrate dev --name init --create-only
```

Expected: salida termina con algo como `Prisma Migrate created the following migration without applying it` y la ruta `prisma/migrations/20260712000000_init/migration.sql` (el timestamp real será distinto). El archivo contiene `CREATE TYPE`, `CREATE TABLE` y `CREATE UNIQUE INDEX`/`CREATE INDEX` para todo lo declarado en el schema, pero **no** incluye el índice parcial de citas activas.

- [ ] **Step 2: Añadir el índice único parcial a mano**

Abre el archivo `migration.sql` generado (ruta exacta según el timestamp del Step 1, dentro de `prisma/migrations/`) y añade al final:

```sql
-- Restricción única parcial: (employeeId, start) solo entre citas activas
-- (PENDING o CONFIRMED). Actúa como red de seguridad ante condiciones de
-- carrera cuando dos reservas intentan ocupar el mismo hueco exacto del
-- mismo empleado al mismo tiempo. La expiración de PENDING a los 30 minutos
-- se gestiona en la capa de aplicación (src/lib/booking/active-appointments.ts),
-- no en este índice: por eso el predicado solo filtra por status.
CREATE UNIQUE INDEX "Appointment_employeeId_start_active_key"
ON "Appointment" ("employeeId", "start")
WHERE "status" IN ('PENDING', 'CONFIRMED');
```

Expected: el archivo `migration.sql` ahora termina con esa sentencia `CREATE UNIQUE INDEX`.

- [ ] **Step 3: Aplicar la migración y generar el cliente**

```powershell
pnpm exec prisma migrate dev
```

Expected: salida indica que la migración pendiente se aplicó (`Applying migration '20260712000000_init'`) seguida de `Your database is now in sync with your schema.` y `✔ Generated Prisma Client`.

- [ ] **Step 4: Verificar que el cliente compila**

```powershell
pnpm exec tsc --noEmit
```

Expected: sin errores (el error de `Cannot find module '@prisma/client'` de la Tarea 2 ya no aparece, porque el cliente se generó con tipos reales).

- [ ] **Step 5: Commit**

```powershell
git add prisma/migrations
git commit -m "feat: crear migración inicial con índice único parcial de citas activas"
```

Expected: commit creado.

---

### Tarea 5: Configurar Vitest con base de datos de test real

**Files:**
- Create: `vitest.config.ts`, `src/test/global-setup.ts`, `src/test/prisma-client.ts`, `src/test/setup.ts`, `src/test/setup.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `@prisma/client` generado (Tarea 4), `TEST_DATABASE_URL` en `.env` (Tarea 2).
- Produces: `src/test/prisma-client.ts` exporta `prisma: PrismaClient` apuntando a `TEST_DATABASE_URL`, usado por todos los tests de la Fase 2; `vitest.config.ts` con truncado automático de tablas entre tests.

- [ ] **Step 1: Instalar Vitest**

```powershell
pnpm add -D vitest
```

Expected: `vitest` aparece en `devDependencies` de `package.json`.

- [ ] **Step 2: Crear el cliente Prisma de test**

Crea `src/test/prisma-client.ts`:

```typescript
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL no está definida en .env. Añádela antes de ejecutar los tests.');
}

export const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.TEST_DATABASE_URL },
  },
});
```

- [ ] **Step 3: Crear el `globalSetup` que migra la base de test**

Crea `src/test/global-setup.ts`:

```typescript
import 'dotenv/config';
import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL no está definida en .env. Añádela antes de ejecutar los tests.');
  }

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit',
  });
}
```

- [ ] **Step 4: Crear el `setup` que limpia las tablas entre tests**

Crea `src/test/setup.ts`:

```typescript
import { beforeEach, afterAll } from 'vitest';
import { prisma } from './prisma-client';

beforeEach(async () => {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations';
  `;

  if (tables.length > 0) {
    const quoted = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

- [ ] **Step 5: Crear `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 6: Añadir scripts de test a `package.json`**

Edita la sección `"scripts"` de `package.json` para incluir:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 7: Escribir el test de humo (falla porque aún no hay nada que probar)**

Crea `src/test/setup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from './prisma-client';

describe('entorno de test', () => {
  it('conecta con la base de datos de test y persiste un registro', async () => {
    const business = await prisma.business.create({
      data: {
        slug: 'smoke-test',
        name: 'Negocio de prueba',
      },
    });

    const found = await prisma.business.findUnique({ where: { id: business.id } });
    expect(found?.slug).toBe('smoke-test');
  });

  it('limpia las tablas entre tests (no debería ver el negocio del test anterior)', async () => {
    const count = await prisma.business.count();
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 8: Ejecutar y verificar que pasa**

```powershell
pnpm test
```

Expected: `globalSetup` ejecuta `prisma migrate deploy` contra `TEST_DATABASE_URL` (crea las tablas allí si no existían), y ambos tests de `src/test/setup.test.ts` pasan: `✓ entorno de test > conecta con la base de datos de test y persiste un registro` y `✓ entorno de test > limpia las tablas entre tests...`. Resumen final: `Test Files 1 passed (1)`, `Tests 2 passed (2)`.

- [ ] **Step 9: Commit**

```powershell
git add vitest.config.ts src/test package.json pnpm-lock.yaml
git commit -m "test: configurar Vitest con base de datos Postgres de test real"
```

Expected: commit creado.

---

### Tarea 6: Seed de datos demo — "Salón Aura"

**Files:**
- Create: `src/lib/seed/demo-business.ts`, `prisma/seed.ts`

**Interfaces:**
- Consumes: `PrismaClient` y tipos generados (Tarea 4), `src/test/prisma-client.ts` (Tarea 5, usado en la Tarea 7 para verificar).
- Produces: `seedDemoBusiness(prisma: PrismaClient): Promise<DemoBusinessSeed>` — fixture reutilizable por **todos** los tests de la Fase 2 (Tareas 9-21) para obtener un negocio, dos empleados y cuatro servicios ya persistidos.

- [ ] **Step 1: Escribir `seedDemoBusiness`**

Crea `src/lib/seed/demo-business.ts`:

```typescript
import { PrismaClient, Business, Employee, Service, BusinessType, ThemePreset } from '@prisma/client';

export interface DemoBusinessSeed {
  business: Business;
  employees: {
    marta: Employee;
    carlos: Employee;
  };
  services: {
    corteMujer: Service;
    corteHombre: Service;
    coloracion: Service;
    peinadoEvento: Service;
  };
}

const WEEKDAYS_TUE_TO_SAT = [2, 3, 4, 5, 6];

export async function seedDemoBusiness(prisma: PrismaClient): Promise<DemoBusinessSeed> {
  const business = await prisma.business.create({
    data: {
      slug: 'salon-aura',
      name: 'Salón Aura',
      type: BusinessType.HAIR_SALON,
      address: 'Calle Mayor 10, Madrid',
      phone: '+34600111222',
      email: 'hola@salonaura.example',
      themePreset: ThemePreset.BOUTIQUE_EDITORIAL,
      accentColor: '#B25539',
      manualApproval: false,
      slotGranularityMinutes: 15,
      minAdvanceNoticeMinutes: 60,
      maxBookingWindowDays: 30,
      active: true,
    },
  });

  const marta = await prisma.employee.create({
    data: {
      businessId: business.id,
      name: 'Marta Ruiz',
      color: '#B25539',
      active: true,
    },
  });

  const carlos = await prisma.employee.create({
    data: {
      businessId: business.id,
      name: 'Carlos Núñez',
      color: '#4A6C6F',
      active: true,
    },
  });

  const corteMujer = await prisma.service.create({
    data: {
      businessId: business.id,
      name: 'Corte de mujer',
      description: 'Corte y peinado adaptado a tu estilo.',
      durationMinutes: 45,
      priceCents: 2800,
      bufferAfterMinutes: 10,
      active: true,
      sortOrder: 1,
    },
  });

  const corteHombre = await prisma.service.create({
    data: {
      businessId: business.id,
      name: 'Corte de hombre',
      description: 'Corte clásico o moderno.',
      durationMinutes: 30,
      priceCents: 1800,
      bufferAfterMinutes: 5,
      active: true,
      sortOrder: 2,
    },
  });

  const coloracion = await prisma.service.create({
    data: {
      businessId: business.id,
      name: 'Coloración',
      description: 'Color completo con productos profesionales.',
      durationMinutes: 90,
      priceCents: 6000,
      bufferAfterMinutes: 15,
      active: true,
      sortOrder: 3,
    },
  });

  const peinadoEvento = await prisma.service.create({
    data: {
      businessId: business.id,
      name: 'Peinado de evento',
      description: 'Peinado especial para ocasiones especiales.',
      durationMinutes: 60,
      priceCents: 4000,
      bufferAfterMinutes: 10,
      active: true,
      sortOrder: 4,
    },
  });

  await prisma.serviceEmployee.createMany({
    data: [
      { serviceId: corteMujer.id, employeeId: marta.id },
      { serviceId: corteHombre.id, employeeId: marta.id },
      { serviceId: coloracion.id, employeeId: marta.id },
      { serviceId: peinadoEvento.id, employeeId: marta.id },
      { serviceId: corteMujer.id, employeeId: carlos.id },
      { serviceId: corteHombre.id, employeeId: carlos.id },
    ],
  });

  const martaWorkingHours = WEEKDAYS_TUE_TO_SAT.flatMap((weekday) => [
    { employeeId: marta.id, weekday, startMinute: 600, endMinute: 840 },
    { employeeId: marta.id, weekday, startMinute: 960, endMinute: 1200 },
  ]);

  const carlosWorkingHours = WEEKDAYS_TUE_TO_SAT.map((weekday) => ({
    employeeId: carlos.id,
    weekday,
    startMinute: 960,
    endMinute: 1200,
  }));

  await prisma.workingHours.createMany({
    data: [...martaWorkingHours, ...carlosWorkingHours],
  });

  await prisma.timeOff.create({
    data: {
      employeeId: marta.id,
      start: new Date('2026-08-15T08:00:00.000Z'),
      end: new Date('2026-08-15T22:00:00.000Z'),
      reason: 'Día festivo local',
    },
  });

  return {
    business,
    employees: { marta, carlos },
    services: { corteMujer, corteHombre, coloracion, peinadoEvento },
  };
}
```

Nota sobre los horarios: `weekday` sigue la convención de `Date.getDay()` (0 = domingo … 6 = sábado). El salón abre de martes a sábado (2-6). Marta trabaja mañana (10:00-14:00, minutos 600-840) y tarde (16:00-20:00, minutos 960-1200); Carlos solo tarde (960-1200).

- [ ] **Step 2: Crear el script CLI de seed**

Crea `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { seedDemoBusiness } from '../src/lib/seed/demo-business';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const seed = await seedDemoBusiness(prisma);
  console.log(`Negocio demo creado: ${seed.business.name} (${seed.business.slug})`);
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

- [ ] **Step 3: Ejecutar el seed contra la base de desarrollo**

```powershell
pnpm exec prisma db seed
```

Expected: salida `Negocio demo creado: Salón Aura (salon-aura)` sin errores.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/seed prisma/seed.ts package.json
git commit -m "feat: crear seed reutilizable del negocio demo Salón Aura"
```

Expected: commit creado.

---

### Tarea 7: Verificar el seed con un test

**Files:**
- Create: `src/lib/seed/demo-business.test.ts`

**Interfaces:**
- Consumes: `seedDemoBusiness` (Tarea 6), `prisma` de test (Tarea 5, `src/test/prisma-client.ts`).
- Produces: confirmación automatizada de que el fixture funciona; a partir de aquí, todos los tests de la Fase 2 pueden llamar a `seedDemoBusiness(prisma)` con confianza.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/seed/demo-business.test.ts`:

```typescript
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
```

- [ ] **Step 2: Ejecutar y comprobar que pasa (no requiere implementación nueva)**

```powershell
pnpm test src/lib/seed/demo-business.test.ts
```

Expected: `✓ seedDemoBusiness > crea el negocio demo...` y `✓ seedDemoBusiness > vincula a Marta...` — ambos en verde. Como `seedDemoBusiness` ya se implementó en la Tarea 6, este test pasa directamente y sirve como verificación de regresión permanente del fixture.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/seed/demo-business.test.ts
git commit -m "test: verificar que el seed del negocio demo crea los datos esperados"
```

Expected: commit creado.

---

## Fase 2 — Motor de reservas (TDD puro, sin UI)

### Tarea 8: Utilidades de zona horaria del negocio

**Files:**
- Create: `src/lib/booking/timezone.ts`, `src/lib/booking/timezone.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores (utilidad pura).
- Produces: `BUSINESS_TIMEZONE: string`, `getLocalWeekday(utcDate: Date, timezone?: string): number`, `getLocalDateString(utcDate: Date, timezone?: string): string`, `localMinutesToUtc(localDateStr: string, minutes: number, timezone?: string): Date`, `addDaysToLocalDateString(localDateStr: string, days: number): string` — usadas por las Tareas 9-18.

- [ ] **Step 1: Instalar date-fns y date-fns-tz**

```powershell
pnpm add date-fns date-fns-tz
```

Expected: ambos paquetes en `dependencies` de `package.json`.

- [ ] **Step 2: Escribir los tests que fallan**

Crea `src/lib/booking/timezone.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getLocalWeekday,
  getLocalDateString,
  localMinutesToUtc,
  addDaysToLocalDateString,
  BUSINESS_TIMEZONE,
} from './timezone';

describe('timezone', () => {
  it('convierte una fecha UTC al día de la semana local correcto (horario de verano)', () => {
    // 2026-07-13T00:00:00Z son las 02:00 del lunes en Madrid (CEST, UTC+2)
    const utcDate = new Date('2026-07-13T00:00:00.000Z');
    expect(getLocalWeekday(utcDate, BUSINESS_TIMEZONE)).toBe(1); // 1 = lunes
  });

  it('obtiene la fecha local en formato YYYY-MM-DD cruzando medianoche', () => {
    // 2026-07-13T22:30:00Z son las 00:30 del martes en Madrid (CEST)
    const utcDate = new Date('2026-07-13T22:30:00.000Z');
    expect(getLocalDateString(utcDate, BUSINESS_TIMEZONE)).toBe('2026-07-14');
  });

  it('convierte minutos locales a UTC en horario de verano (CEST, UTC+2)', () => {
    const utc = localMinutesToUtc('2026-07-13', 600, BUSINESS_TIMEZONE); // 10:00 local
    expect(utc.toISOString()).toBe('2026-07-13T08:00:00.000Z');
  });

  it('convierte minutos locales a UTC en horario de invierno (CET, UTC+1)', () => {
    const utc = localMinutesToUtc('2026-01-13', 600, BUSINESS_TIMEZONE); // 10:00 local
    expect(utc.toISOString()).toBe('2026-01-13T09:00:00.000Z');
  });

  it('suma días a una fecha local en formato YYYY-MM-DD cruzando el fin de mes', () => {
    expect(addDaysToLocalDateString('2026-07-30', 3)).toBe('2026-08-02');
  });
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/timezone.test.ts
```

Expected: FAIL con `Cannot find module './timezone'` (el archivo `timezone.ts` aún no existe).

- [ ] **Step 4: Implementar `timezone.ts`**

Crea `src/lib/booking/timezone.ts`:

```typescript
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { getDay } from 'date-fns';

export const BUSINESS_TIMEZONE = 'Europe/Madrid';

export function getLocalWeekday(utcDate: Date, timezone: string = BUSINESS_TIMEZONE): number {
  const zoned = toZonedTime(utcDate, timezone);
  return getDay(zoned);
}

export function getLocalDateString(utcDate: Date, timezone: string = BUSINESS_TIMEZONE): string {
  const zoned = toZonedTime(utcDate, timezone);
  const year = zoned.getFullYear();
  const month = String(zoned.getMonth() + 1).padStart(2, '0');
  const day = String(zoned.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localMinutesToUtc(
  localDateStr: string,
  minutes: number,
  timezone: string = BUSINESS_TIMEZONE
): Date {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const wallTime = `${localDateStr}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
  return fromZonedTime(wallTime, timezone);
}

export function addDaysToLocalDateString(localDateStr: string, days: number): string {
  const [year, month, day] = localDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/timezone.test.ts
```

Expected: los 5 tests pasan (`Tests 5 passed (5)`).

- [ ] **Step 6: Commit**

```powershell
git add src/lib/booking/timezone.ts src/lib/booking/timezone.test.ts package.json pnpm-lock.yaml
git commit -m "feat: añadir utilidades de conversión de zona horaria Europe/Madrid <-> UTC"
```

Expected: commit creado.

---

### Tarea 9: `getAvailableSlots` — huecos base a partir del horario laboral

**Files:**
- Create: `src/lib/booking/slots.ts`, `src/lib/booking/slots.test.ts`

**Interfaces:**
- Consumes: `getLocalDateString`/`localMinutesToUtc`/`addDaysToLocalDateString` (Tarea 8), `seedDemoBusiness` (Tarea 6), `prisma` de test (Tarea 5).
- Produces: `GetAvailableSlotsParams`, `AvailableSlot { start: Date; end: Date; employeeId: string }`, `getAvailableSlots(prisma: PrismaClient, params: GetAvailableSlotsParams): Promise<AvailableSlot[]>` — firma final, reutilizada sin cambios por las Tareas 10-18.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/booking/slots.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getAvailableSlots } from './slots';

describe('getAvailableSlots — huecos base', () => {
  it('genera huecos de 15 en 15 minutos dentro de los dos tramos del martes', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z'); // lunes, antes del martes de prueba

    const slots = await getAvailableSlots(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id, // 30 min + 5 min buffer = 35 min
      employeeId: seed.employees.marta.id,
      dateFrom: '2026-07-14', // martes
      dateTo: '2026-07-14',
      now,
    });

    // Tramo 10:00-14:00 (600-840): cursores 600..795 cada 15 -> 14 huecos
    // Tramo 16:00-20:00 (960-1200): cursores 960..1155 cada 15 -> 14 huecos
    expect(slots.length).toBe(28);

    expect(slots[0].start.toISOString()).toBe('2026-07-14T08:00:00.000Z'); // 10:00 local
    expect(slots[0].end.toISOString()).toBe('2026-07-14T08:35:00.000Z');
    expect(slots[0].employeeId).toBe(seed.employees.marta.id);

    expect(slots[13].start.toISOString()).toBe('2026-07-14T11:15:00.000Z'); // último del tramo 1
    expect(slots[14].start.toISOString()).toBe('2026-07-14T14:00:00.000Z'); // primero del tramo 2 (16:00 local)
    expect(slots[27].start.toISOString()).toBe('2026-07-14T17:15:00.000Z'); // último del tramo 2
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/slots.test.ts
```

Expected: FAIL con `Cannot find module './slots'`.

- [ ] **Step 3: Implementar la versión base de `getAvailableSlots`**

Crea `src/lib/booking/slots.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { addDaysToLocalDateString, localMinutesToUtc } from './timezone';

export interface GetAvailableSlotsParams {
  businessId: string;
  serviceId: string;
  employeeId?: string;
  dateFrom: string; // 'YYYY-MM-DD', fecha local del negocio (inclusive)
  dateTo: string; // 'YYYY-MM-DD', fecha local del negocio (inclusive)
  now?: Date;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
  employeeId: string;
}

function enumerateLocalDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addDaysToLocalDateString(current, 1);
  }
  return dates;
}

function localDateWeekday(localDateStr: string): number {
  const [year, month, day] = localDateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export async function getAvailableSlots(
  prisma: PrismaClient,
  params: GetAvailableSlotsParams
): Promise<AvailableSlot[]> {
  const { businessId, serviceId, employeeId } = params;

  if (!employeeId) {
    throw new Error('employeeId es obligatorio en esta versión de getAvailableSlots');
  }

  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const workingHours = await prisma.workingHours.findMany({ where: { employeeId } });

  const slotDurationMinutes = service.durationMinutes + service.bufferAfterMinutes;
  const granularity = business.slotGranularityMinutes;

  const slots: AvailableSlot[] = [];
  const localDates = enumerateLocalDates(params.dateFrom, params.dateTo);

  for (const localDate of localDates) {
    const weekday = localDateWeekday(localDate);
    const dayBlocks = workingHours.filter((wh) => wh.weekday === weekday);

    for (const block of dayBlocks) {
      let cursor = block.startMinute;
      while (cursor + slotDurationMinutes <= block.endMinute) {
        const start = localMinutesToUtc(localDate, cursor);
        const end = localMinutesToUtc(localDate, cursor + slotDurationMinutes);
        slots.push({ start, end, employeeId });
        cursor += granularity;
      }
    }
  }

  return slots;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/slots.test.ts
```

Expected: `✓ getAvailableSlots — huecos base > genera huecos de 15 en 15 minutos...` en verde.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/booking/slots.ts src/lib/booking/slots.test.ts
git commit -m "feat: calcular huecos base a partir del horario laboral del empleado"
```

Expected: commit creado.

---

### Tarea 10: `getAvailableSlots` — excluir ausencias (TimeOff)

**Files:**
- Create: `src/lib/booking/overlap.ts`
- Modify: `src/lib/booking/slots.ts`, `src/lib/booking/slots.test.ts`

**Interfaces:**
- Consumes: `getAvailableSlots` (Tarea 9).
- Produces: `rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean` (`src/lib/booking/overlap.ts`) — reutilizada por las Tareas 11, 15 y 18.

- [ ] **Step 1: Añadir el test que falla**

Añade este bloque `it` dentro de `describe('getAvailableSlots — huecos base', ...)` en `src/lib/booking/slots.test.ts` (después del test existente, antes del cierre del `describe`):

```typescript
  it('excluye los huecos que solapan con una ausencia (TimeOff) del empleado', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    await prisma.timeOff.create({
      data: {
        employeeId: seed.employees.marta.id,
        start: new Date('2026-07-14T08:00:00.000Z'), // 10:00 local
        end: new Date('2026-07-14T09:00:00.000Z'), // 11:00 local
        reason: 'Cita médica',
      },
    });

    const slots = await getAvailableSlots(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now,
    });

    // Se eliminan los 4 huecos del tramo 1 que solapan [08:00,09:00)Z: 08:00,08:15,08:30,08:45
    expect(slots.length).toBe(24);
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T08:00:00.000Z')).toBe(false);
    // El hueco que empieza justo cuando termina la ausencia sí está disponible
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T09:00:00.000Z')).toBe(true);
  });
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/slots.test.ts
```

Expected: FAIL — el nuevo test espera `slots.length === 24` pero la implementación actual devuelve `28` (todavía no filtra por `TimeOff`).

- [ ] **Step 3: Crear el helper de solapes**

Crea `src/lib/booking/overlap.ts`:

```typescript
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
```

- [ ] **Step 4: Filtrar por TimeOff en `slots.ts`**

Reemplaza el contenido completo de `src/lib/booking/slots.ts` por:

```typescript
import type { PrismaClient } from '@prisma/client';
import { addDaysToLocalDateString, localMinutesToUtc } from './timezone';
import { rangesOverlap } from './overlap';

export interface GetAvailableSlotsParams {
  businessId: string;
  serviceId: string;
  employeeId?: string;
  dateFrom: string;
  dateTo: string;
  now?: Date;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
  employeeId: string;
}

function enumerateLocalDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addDaysToLocalDateString(current, 1);
  }
  return dates;
}

function localDateWeekday(localDateStr: string): number {
  const [year, month, day] = localDateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export async function getAvailableSlots(
  prisma: PrismaClient,
  params: GetAvailableSlotsParams
): Promise<AvailableSlot[]> {
  const { businessId, serviceId, employeeId } = params;

  if (!employeeId) {
    throw new Error('employeeId es obligatorio en esta versión de getAvailableSlots');
  }

  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const workingHours = await prisma.workingHours.findMany({ where: { employeeId } });

  const rangeStartUtc = localMinutesToUtc(params.dateFrom, 0);
  const rangeEndUtc = localMinutesToUtc(addDaysToLocalDateString(params.dateTo, 1), 0);

  const timeOffs = await prisma.timeOff.findMany({
    where: { employeeId, start: { lt: rangeEndUtc }, end: { gt: rangeStartUtc } },
  });

  const slotDurationMinutes = service.durationMinutes + service.bufferAfterMinutes;
  const granularity = business.slotGranularityMinutes;

  const slots: AvailableSlot[] = [];
  const localDates = enumerateLocalDates(params.dateFrom, params.dateTo);

  for (const localDate of localDates) {
    const weekday = localDateWeekday(localDate);
    const dayBlocks = workingHours.filter((wh) => wh.weekday === weekday);

    for (const block of dayBlocks) {
      let cursor = block.startMinute;
      while (cursor + slotDurationMinutes <= block.endMinute) {
        const start = localMinutesToUtc(localDate, cursor);
        const end = localMinutesToUtc(localDate, cursor + slotDurationMinutes);

        const blockedByTimeOff = timeOffs.some((t) => rangesOverlap(start, end, t.start, t.end));

        if (!blockedByTimeOff) {
          slots.push({ start, end, employeeId });
        }

        cursor += granularity;
      }
    }
  }

  return slots;
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/slots.test.ts
```

Expected: ambos tests pasan (`Tests 2 passed (2)`).

- [ ] **Step 6: Commit**

```powershell
git add src/lib/booking/slots.ts src/lib/booking/overlap.ts src/lib/booking/slots.test.ts
git commit -m "feat: excluir ausencias (TimeOff) del cálculo de huecos disponibles"
```

Expected: commit creado.

---

### Tarea 11: `getAvailableSlots` — excluir citas activas con expiración perezosa

**Files:**
- Create: `src/lib/booking/active-appointments.ts`
- Modify: `src/lib/booking/slots.ts`, `src/lib/booking/slots.test.ts`

**Interfaces:**
- Consumes: `rangesOverlap` (Tarea 10).
- Produces: `PENDING_EXPIRY_MINUTES: number` (= 30), `activeAppointmentWhere(now: Date): Prisma.AppointmentWhereInput` (`src/lib/booking/active-appointments.ts`) — reutilizada por las Tareas 12, 13, 14, 15 y 19.

- [ ] **Step 1: Añadir el test que falla**

Añade este `it` a `src/lib/booking/slots.test.ts` (dentro del mismo `describe`):

```typescript
  it('excluye citas CONFIRMED y PENDING no caducadas, pero ignora las PENDING caducadas (expiración perezosa)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-14T13:00:00.000Z'); // 15:00 local, mismo día de prueba

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente de prueba',
        phone: '+34611000000',
        email: 'cliente-fixture@example.com',
      },
    });

    // Cita CONFIRMED que bloquea el primer hueco del tramo de tarde (16:00 local = 14:00Z)
    await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: new Date('2026-07-14T14:00:00.000Z'),
        end: new Date('2026-07-14T14:35:00.000Z'),
        status: 'CONFIRMED',
      },
    });

    // Cita PENDING creada hace 5 minutos (no caducada): bloquea el hueco de 15:00Z
    await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: new Date('2026-07-14T15:00:00.000Z'),
        end: new Date('2026-07-14T15:35:00.000Z'),
        status: 'PENDING',
        createdAt: new Date('2026-07-14T12:55:00.000Z'), // now - 5 min
      },
    });

    // Cita PENDING creada hace 40 minutos (caducada): NO debe bloquear el hueco de 16:00Z
    await prisma.appointment.create({
      data: {
        businessId: seed.business.id,
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.marta.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        start: new Date('2026-07-14T16:00:00.000Z'),
        end: new Date('2026-07-14T16:35:00.000Z'),
        status: 'PENDING',
        createdAt: new Date('2026-07-14T12:20:00.000Z'), // now - 40 min
      },
    });

    const slots = await getAvailableSlots(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now,
    });

    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T14:00:00.000Z')).toBe(false); // CONFIRMED
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T15:00:00.000Z')).toBe(false); // PENDING activa
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T16:00:00.000Z')).toBe(true); // PENDING caducada, se ignora
  });
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/slots.test.ts
```

Expected: FAIL — el nuevo test espera que `14:00Z` y `15:00Z` no aparezcan, pero la implementación actual no consulta `Appointment`, así que ambos aparecen (`toBe(false)` falla).

- [ ] **Step 3: Crear `active-appointments.ts`**

Crea `src/lib/booking/active-appointments.ts`:

```typescript
import type { Prisma } from '@prisma/client';

export const PENDING_EXPIRY_MINUTES = 30;

export function activeAppointmentWhere(now: Date): Prisma.AppointmentWhereInput {
  const pendingCutoff = new Date(now.getTime() - PENDING_EXPIRY_MINUTES * 60 * 1000);
  return {
    OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', createdAt: { gt: pendingCutoff } }],
  };
}
```

- [ ] **Step 4: Filtrar por citas activas en `slots.ts`**

Reemplaza el contenido completo de `src/lib/booking/slots.ts` por:

```typescript
import type { PrismaClient } from '@prisma/client';
import { addDaysToLocalDateString, localMinutesToUtc } from './timezone';
import { rangesOverlap } from './overlap';
import { activeAppointmentWhere } from './active-appointments';

export interface GetAvailableSlotsParams {
  businessId: string;
  serviceId: string;
  employeeId?: string;
  dateFrom: string;
  dateTo: string;
  now?: Date;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
  employeeId: string;
}

function enumerateLocalDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addDaysToLocalDateString(current, 1);
  }
  return dates;
}

function localDateWeekday(localDateStr: string): number {
  const [year, month, day] = localDateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export async function getAvailableSlots(
  prisma: PrismaClient,
  params: GetAvailableSlotsParams
): Promise<AvailableSlot[]> {
  const { businessId, serviceId, employeeId } = params;
  const now = params.now ?? new Date();

  if (!employeeId) {
    throw new Error('employeeId es obligatorio en esta versión de getAvailableSlots');
  }

  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const workingHours = await prisma.workingHours.findMany({ where: { employeeId } });

  const rangeStartUtc = localMinutesToUtc(params.dateFrom, 0);
  const rangeEndUtc = localMinutesToUtc(addDaysToLocalDateString(params.dateTo, 1), 0);

  const [timeOffs, activeAppointments] = await Promise.all([
    prisma.timeOff.findMany({
      where: { employeeId, start: { lt: rangeEndUtc }, end: { gt: rangeStartUtc } },
    }),
    prisma.appointment.findMany({
      where: {
        employeeId,
        start: { lt: rangeEndUtc },
        end: { gt: rangeStartUtc },
        ...activeAppointmentWhere(now),
      },
    }),
  ]);

  const slotDurationMinutes = service.durationMinutes + service.bufferAfterMinutes;
  const granularity = business.slotGranularityMinutes;

  const slots: AvailableSlot[] = [];
  const localDates = enumerateLocalDates(params.dateFrom, params.dateTo);

  for (const localDate of localDates) {
    const weekday = localDateWeekday(localDate);
    const dayBlocks = workingHours.filter((wh) => wh.weekday === weekday);

    for (const block of dayBlocks) {
      let cursor = block.startMinute;
      while (cursor + slotDurationMinutes <= block.endMinute) {
        const start = localMinutesToUtc(localDate, cursor);
        const end = localMinutesToUtc(localDate, cursor + slotDurationMinutes);

        const blockedByTimeOff = timeOffs.some((t) => rangesOverlap(start, end, t.start, t.end));
        const blockedByAppointment = activeAppointments.some((a) => rangesOverlap(start, end, a.start, a.end));

        if (!blockedByTimeOff && !blockedByAppointment) {
          slots.push({ start, end, employeeId });
        }

        cursor += granularity;
      }
    }
  }

  return slots;
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/slots.test.ts
```

Expected: los 3 tests pasan (`Tests 3 passed (3)`).

- [ ] **Step 6: Commit**

```powershell
git add src/lib/booking/slots.ts src/lib/booking/active-appointments.ts src/lib/booking/slots.test.ts
git commit -m "feat: excluir citas activas del cálculo de huecos con expiración perezosa de PENDING"
```

Expected: commit creado.

---

### Tarea 12: `getAvailableSlots` — antelación mínima, ventana máxima y "cualquier profesional"

**Files:**
- Modify: `src/lib/booking/slots.ts`, `src/lib/booking/slots.test.ts`

**Interfaces:**
- Consumes: implementación de la Tarea 11.
- Produces: `getAvailableSlots` en su forma **final** (firma sin cambios respecto a la Tarea 9): ahora soporta `employeeId` opcional (agrega huecos de todos los empleados cualificados para el servicio) y filtra por `business.minAdvanceNoticeMinutes` / `business.maxBookingWindowDays`. Esta es la versión consumida por las Tareas 13 y 18.

- [ ] **Step 1: Añadir los tests que fallan**

Añade estos dos `it` a `src/lib/booking/slots.test.ts`:

```typescript
  it('excluye huecos anteriores a la antelación mínima del negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    // minAdvanceNoticeMinutes del seed = 60. "now" está a las 07:30Z del propio martes de prueba.
    const now = new Date('2026-07-14T07:30:00.000Z');

    const slots = await getAvailableSlots(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now,
    });

    // earliestAllowedStart = 08:30Z; el hueco de 08:00Z queda excluido, el de 08:15Z también
    // (empieza antes de 08:30Z), el de 08:30 en adelante se mantiene.
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T08:00:00.000Z')).toBe(false);
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T08:15:00.000Z')).toBe(false);
    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T08:30:00.000Z')).toBe(true);
  });

  it('excluye huecos más allá de la ventana máxima de reserva del negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    // maxBookingWindowDays del seed = 30. "now" es tal que 2026-07-14 queda 31 días en el futuro.
    const now = new Date('2026-06-13T08:00:00.000Z');

    const slots = await getAvailableSlots(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now,
    });

    expect(slots.length).toBe(0);
  });

  it('con "cualquier profesional" (sin employeeId) combina los huecos de todos los empleados cualificados', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    const slots = await getAvailableSlots(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id, // Marta y Carlos están cualificados
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now,
    });

    const martaSlots = slots.filter((s) => s.employeeId === seed.employees.marta.id);
    const carlosSlots = slots.filter((s) => s.employeeId === seed.employees.carlos.id);

    expect(martaSlots.length).toBe(28); // dos tramos, como en la Tarea 9
    expect(carlosSlots.length).toBe(14); // Carlos solo trabaja el tramo de tarde
    expect(slots.length).toBe(42);
    // Los huecos están ordenados cronológicamente
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].start.getTime()).toBeGreaterThanOrEqual(slots[i - 1].start.getTime());
    }
  });
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/slots.test.ts
```

Expected: FAIL en los tres tests nuevos — la antelación mínima y la ventana máxima aún no se aplican, y sin `employeeId` la función lanza el error `employeeId es obligatorio...`.

- [ ] **Step 3: Reescribir `getAvailableSlots` con soporte multi-empleado y filtros de tiempo**

Reemplaza el contenido completo de `src/lib/booking/slots.ts` por:

```typescript
import type { PrismaClient } from '@prisma/client';
import { addDaysToLocalDateString, localMinutesToUtc } from './timezone';
import { rangesOverlap } from './overlap';
import { activeAppointmentWhere } from './active-appointments';

export interface GetAvailableSlotsParams {
  businessId: string;
  serviceId: string;
  employeeId?: string;
  dateFrom: string;
  dateTo: string;
  now?: Date;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
  employeeId: string;
}

function enumerateLocalDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addDaysToLocalDateString(current, 1);
  }
  return dates;
}

function localDateWeekday(localDateStr: string): number {
  const [year, month, day] = localDateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

async function getSlotsForEmployee(
  prisma: PrismaClient,
  params: {
    employeeId: string;
    slotDurationMinutes: number;
    granularity: number;
    dateFrom: string;
    dateTo: string;
    now: Date;
  }
): Promise<AvailableSlot[]> {
  const { employeeId, slotDurationMinutes, granularity, dateFrom, dateTo, now } = params;

  const rangeStartUtc = localMinutesToUtc(dateFrom, 0);
  const rangeEndUtc = localMinutesToUtc(addDaysToLocalDateString(dateTo, 1), 0);

  const [workingHours, timeOffs, activeAppointments] = await Promise.all([
    prisma.workingHours.findMany({ where: { employeeId } }),
    prisma.timeOff.findMany({
      where: { employeeId, start: { lt: rangeEndUtc }, end: { gt: rangeStartUtc } },
    }),
    prisma.appointment.findMany({
      where: {
        employeeId,
        start: { lt: rangeEndUtc },
        end: { gt: rangeStartUtc },
        ...activeAppointmentWhere(now),
      },
    }),
  ]);

  const localDates = enumerateLocalDates(dateFrom, dateTo);
  const slots: AvailableSlot[] = [];

  for (const localDate of localDates) {
    const weekday = localDateWeekday(localDate);
    const dayBlocks = workingHours.filter((wh) => wh.weekday === weekday);

    for (const block of dayBlocks) {
      let cursor = block.startMinute;
      while (cursor + slotDurationMinutes <= block.endMinute) {
        const start = localMinutesToUtc(localDate, cursor);
        const end = localMinutesToUtc(localDate, cursor + slotDurationMinutes);

        const blockedByTimeOff = timeOffs.some((t) => rangesOverlap(start, end, t.start, t.end));
        const blockedByAppointment = activeAppointments.some((a) => rangesOverlap(start, end, a.start, a.end));

        if (!blockedByTimeOff && !blockedByAppointment) {
          slots.push({ start, end, employeeId });
        }

        cursor += granularity;
      }
    }
  }

  return slots;
}

export async function getAvailableSlots(
  prisma: PrismaClient,
  params: GetAvailableSlotsParams
): Promise<AvailableSlot[]> {
  const now = params.now ?? new Date();
  const business = await prisma.business.findUniqueOrThrow({ where: { id: params.businessId } });
  const service = await prisma.service.findUniqueOrThrow({ where: { id: params.serviceId } });

  let employeeIds: string[];
  if (params.employeeId) {
    employeeIds = [params.employeeId];
  } else {
    const serviceEmployees = await prisma.serviceEmployee.findMany({
      where: { serviceId: params.serviceId, employee: { active: true } },
      select: { employeeId: true },
    });
    employeeIds = serviceEmployees.map((se) => se.employeeId);
  }

  const slotDurationMinutes = service.durationMinutes + service.bufferAfterMinutes;
  const granularity = business.slotGranularityMinutes;

  const earliestAllowedStart = new Date(now.getTime() + business.minAdvanceNoticeMinutes * 60 * 1000);
  const latestAllowedStart = new Date(now.getTime() + business.maxBookingWindowDays * 24 * 60 * 60 * 1000);

  const slotsPerEmployee = await Promise.all(
    employeeIds.map((employeeId) =>
      getSlotsForEmployee(prisma, {
        employeeId,
        slotDurationMinutes,
        granularity,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        now,
      })
    )
  );

  const allSlots = slotsPerEmployee.flat();

  const filtered = allSlots.filter(
    (slot) => slot.start >= earliestAllowedStart && slot.start <= latestAllowedStart
  );

  filtered.sort((a, b) => a.start.getTime() - b.start.getTime());

  return filtered;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/slots.test.ts
```

Expected: los 6 tests pasan (`Tests 6 passed (6)`), incluyendo los de las Tareas 9-11 (siguen usando `now` explícito, así que no se ven afectados por los nuevos filtros).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/booking/slots.ts src/lib/booking/slots.test.ts
git commit -m "feat: aplicar antelacion minima, ventana maxima y soporte multi-empleado a getAvailableSlots"
```

Expected: commit creado.

---

### Tarea 13: `assignAnyAvailableEmployee` — empleado con menos carga del día

**Files:**
- Create: `src/lib/booking/assignment.ts`, `src/lib/booking/assignment.test.ts`

**Interfaces:**
- Consumes: `getAvailableSlots` (Tarea 12), `activeAppointmentWhere` (Tarea 11), `getLocalDateString`/`localMinutesToUtc`/`addDaysToLocalDateString` (Tarea 8).
- Produces: `AssignAnyAvailableEmployeeParams`, `assignAnyAvailableEmployee(prisma: PrismaClient, params: AssignAnyAvailableEmployeeParams): Promise<string | null>` — usada por la Tarea 18.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/booking/assignment.test.ts`:

```typescript
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/assignment.test.ts
```

Expected: FAIL con `Cannot find module './assignment'`.

- [ ] **Step 3: Implementar `assignAnyAvailableEmployee`**

Crea `src/lib/booking/assignment.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { getAvailableSlots } from './slots';
import { activeAppointmentWhere } from './active-appointments';
import { getLocalDateString, localMinutesToUtc, addDaysToLocalDateString } from './timezone';

export interface AssignAnyAvailableEmployeeParams {
  businessId: string;
  serviceId: string;
  start: Date;
  now?: Date;
}

export async function assignAnyAvailableEmployee(
  prisma: PrismaClient,
  params: AssignAnyAvailableEmployeeParams
): Promise<string | null> {
  const now = params.now ?? new Date();
  const localDate = getLocalDateString(params.start);

  const slots = await getAvailableSlots(prisma, {
    businessId: params.businessId,
    serviceId: params.serviceId,
    dateFrom: localDate,
    dateTo: localDate,
    now,
  });

  const availableEmployeeIds = Array.from(
    new Set(
      slots
        .filter((slot) => slot.start.getTime() === params.start.getTime())
        .map((slot) => slot.employeeId)
    )
  );

  if (availableEmployeeIds.length === 0) {
    return null;
  }

  const dayStart = localMinutesToUtc(localDate, 0);
  const dayEnd = localMinutesToUtc(addDaysToLocalDateString(localDate, 1), 0);

  const loads = await Promise.all(
    availableEmployeeIds.map(async (employeeId) => {
      const count = await prisma.appointment.count({
        where: {
          employeeId,
          start: { gte: dayStart, lt: dayEnd },
          ...activeAppointmentWhere(now),
        },
      });
      return { employeeId, count };
    })
  );

  loads.sort((a, b) => a.count - b.count || a.employeeId.localeCompare(b.employeeId));

  return loads[0].employeeId;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/assignment.test.ts
```

Expected: los 2 tests pasan (`Tests 2 passed (2)`).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/booking/assignment.ts src/lib/booking/assignment.test.ts
git commit -m "feat: asignar automaticamente el empleado con menos carga del dia"
```

Expected: commit creado.

---

### Tarea 14: Anti-fraude — límite de 2 citas activas por teléfono/email

**Files:**
- Create: `src/lib/booking/anti-fraud.ts`, `src/lib/booking/anti-fraud.test.ts`

**Interfaces:**
- Consumes: `activeAppointmentWhere` (Tarea 11).
- Produces: `checkActiveAppointmentLimit(prisma: PrismaClient, params: { businessId: string; phone: string; email: string; now?: Date; maxActive?: number }): Promise<boolean>` — usada por la Tarea 18.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/booking/anti-fraud.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { checkActiveAppointmentLimit } from './anti-fraud';

describe('checkActiveAppointmentLimit', () => {
  it('permite reservar si el cliente tiene menos de 2 citas activas', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente límite',
        phone: '+34633000000',
        email: 'cliente-limite@example.com',
      },
    });

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

    const allowed = await checkActiveAppointmentLimit(prisma, {
      businessId: seed.business.id,
      phone: customer.phone,
      email: customer.email,
      now,
    });

    expect(allowed).toBe(true);
  });

  it('bloquea la reserva si el cliente ya tiene 2 citas activas (por teléfono o por email)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente límite',
        phone: '+34633000001',
        email: 'cliente-limite-2@example.com',
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
          start: new Date('2026-07-14T08:00:00.000Z'),
          end: new Date('2026-07-14T08:35:00.000Z'),
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
        },
      ],
    });

    const allowed = await checkActiveAppointmentLimit(prisma, {
      businessId: seed.business.id,
      phone: customer.phone,
      email: customer.email,
      now,
    });

    expect(allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/anti-fraud.test.ts
```

Expected: FAIL con `Cannot find module './anti-fraud'`.

- [ ] **Step 3: Implementar `checkActiveAppointmentLimit`**

Crea `src/lib/booking/anti-fraud.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { activeAppointmentWhere } from './active-appointments';

export interface CheckActiveAppointmentLimitParams {
  businessId: string;
  phone: string;
  email: string;
  now?: Date;
  maxActive?: number;
}

export async function checkActiveAppointmentLimit(
  prisma: PrismaClient,
  params: CheckActiveAppointmentLimitParams
): Promise<boolean> {
  const now = params.now ?? new Date();
  const maxActive = params.maxActive ?? 2;

  const count = await prisma.appointment.count({
    where: {
      businessId: params.businessId,
      AND: [
        { OR: [{ customerPhone: params.phone }, { customerEmail: params.email }] },
        activeAppointmentWhere(now),
      ],
    },
  });

  return count < maxActive;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/anti-fraud.test.ts
```

Expected: los 2 tests pasan (`Tests 2 passed (2)`).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/booking/anti-fraud.ts src/lib/booking/anti-fraud.test.ts
git commit -m "feat: limitar a 2 citas activas por telefono o email por negocio"
```

Expected: commit creado.

---

### Tarea 15: Anti-fraude — sin solapes de citas del mismo cliente

**Files:**
- Modify: `src/lib/booking/anti-fraud.ts`, `src/lib/booking/anti-fraud.test.ts`

**Interfaces:**
- Consumes: `activeAppointmentWhere` (Tarea 11).
- Produces: `checkNoOverlapForCustomer(prisma: PrismaClient, params: { businessId: string; phone: string; email: string; start: Date; end: Date; now?: Date }): Promise<boolean>` — usada por la Tarea 18.

- [ ] **Step 1: Añadir el test que falla**

Añade este `describe` a `src/lib/booking/anti-fraud.test.ts` (después del `describe('checkActiveAppointmentLimit', ...)`, con los mismos imports ya presentes más `checkNoOverlapForCustomer`):

Actualiza la línea de import al principio del archivo:

```typescript
import { checkActiveAppointmentLimit, checkNoOverlapForCustomer } from './anti-fraud';
```

Y añade:

```typescript
describe('checkNoOverlapForCustomer', () => {
  it('permite reservar si el nuevo horario no solapa con otra cita activa del mismo cliente', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente solape',
        phone: '+34644000000',
        email: 'cliente-solape@example.com',
      },
    });

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

    const allowed = await checkNoOverlapForCustomer(prisma, {
      businessId: seed.business.id,
      phone: customer.phone,
      email: customer.email,
      start: new Date('2026-07-14T14:00:00.000Z'),
      end: new Date('2026-07-14T14:35:00.000Z'),
      now,
    });

    expect(allowed).toBe(true);
  });

  it('bloquea la reserva si el nuevo horario solapa con otra cita activa del mismo cliente', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente solape',
        phone: '+34644000001',
        email: 'cliente-solape-2@example.com',
      },
    });

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

    const allowed = await checkNoOverlapForCustomer(prisma, {
      businessId: seed.business.id,
      phone: customer.phone,
      email: customer.email,
      start: new Date('2026-07-14T08:20:00.000Z'), // solapa con 08:00-08:35
      end: new Date('2026-07-14T08:55:00.000Z'),
      now,
    });

    expect(allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/anti-fraud.test.ts
```

Expected: FAIL con `checkNoOverlapForCustomer is not a function` (aún no exportada).

- [ ] **Step 3: Implementar `checkNoOverlapForCustomer`**

Reemplaza el contenido completo de `src/lib/booking/anti-fraud.ts` por:

```typescript
import type { PrismaClient } from '@prisma/client';
import { activeAppointmentWhere } from './active-appointments';

export interface CheckActiveAppointmentLimitParams {
  businessId: string;
  phone: string;
  email: string;
  now?: Date;
  maxActive?: number;
}

export async function checkActiveAppointmentLimit(
  prisma: PrismaClient,
  params: CheckActiveAppointmentLimitParams
): Promise<boolean> {
  const now = params.now ?? new Date();
  const maxActive = params.maxActive ?? 2;

  const count = await prisma.appointment.count({
    where: {
      businessId: params.businessId,
      AND: [
        { OR: [{ customerPhone: params.phone }, { customerEmail: params.email }] },
        activeAppointmentWhere(now),
      ],
    },
  });

  return count < maxActive;
}

export interface CheckNoOverlapForCustomerParams {
  businessId: string;
  phone: string;
  email: string;
  start: Date;
  end: Date;
  now?: Date;
}

export async function checkNoOverlapForCustomer(
  prisma: PrismaClient,
  params: CheckNoOverlapForCustomerParams
): Promise<boolean> {
  const now = params.now ?? new Date();

  const overlapping = await prisma.appointment.findFirst({
    where: {
      businessId: params.businessId,
      AND: [
        { OR: [{ customerPhone: params.phone }, { customerEmail: params.email }] },
        activeAppointmentWhere(now),
        { start: { lt: params.end } },
        { end: { gt: params.start } },
      ],
    },
  });

  return overlapping === null;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/anti-fraud.test.ts
```

Expected: los 4 tests pasan (`Tests 4 passed (4)`).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/booking/anti-fraud.ts src/lib/booking/anti-fraud.test.ts
git commit -m "feat: impedir solapes entre citas activas del mismo cliente"
```

Expected: commit creado.

---

### Tarea 16: Anti-fraude — lista negra por negocio

**Files:**
- Modify: `src/lib/booking/anti-fraud.ts`, `src/lib/booking/anti-fraud.test.ts`

**Interfaces:**
- Consumes: nada nuevo (usa `prisma.blacklistEntry` directamente).
- Produces: `checkBlacklist(prisma: PrismaClient, params: { businessId: string; phone: string; email: string }): Promise<boolean>` — usada por la Tarea 18.

- [ ] **Step 1: Añadir el test que falla**

Actualiza el import en `src/lib/booking/anti-fraud.test.ts`:

```typescript
import { checkActiveAppointmentLimit, checkNoOverlapForCustomer, checkBlacklist } from './anti-fraud';
```

Y añade:

```typescript
describe('checkBlacklist', () => {
  it('permite reservar si el cliente no está en la lista negra', async () => {
    const seed = await seedDemoBusiness(prisma);

    const allowed = await checkBlacklist(prisma, {
      businessId: seed.business.id,
      phone: '+34655000000',
      email: 'cliente-limpio@example.com',
    });

    expect(allowed).toBe(true);
  });

  it('bloquea la reserva si el teléfono o el email están en la lista negra del negocio', async () => {
    const seed = await seedDemoBusiness(prisma);

    await prisma.blacklistEntry.create({
      data: {
        businessId: seed.business.id,
        phone: '+34655000001',
        reason: 'Faltas repetidas sin avisar',
      },
    });

    const allowed = await checkBlacklist(prisma, {
      businessId: seed.business.id,
      phone: '+34655000001',
      email: 'otro-email@example.com',
    });

    expect(allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/anti-fraud.test.ts
```

Expected: FAIL con `checkBlacklist is not a function`.

- [ ] **Step 3: Implementar `checkBlacklist`**

Añade esta exportación al final de `src/lib/booking/anti-fraud.ts` (mantén todo el contenido anterior):

```typescript
export interface CheckBlacklistParams {
  businessId: string;
  phone: string;
  email: string;
}

export async function checkBlacklist(prisma: PrismaClient, params: CheckBlacklistParams): Promise<boolean> {
  const entry = await prisma.blacklistEntry.findFirst({
    where: {
      businessId: params.businessId,
      OR: [{ phone: params.phone }, { email: params.email }],
    },
  });

  return entry === null;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/anti-fraud.test.ts
```

Expected: los 6 tests pasan (`Tests 6 passed (6)`).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/booking/anti-fraud.ts src/lib/booking/anti-fraud.test.ts
git commit -m "feat: bloquear reservas de clientes en la lista negra del negocio"
```

Expected: commit creado.

---

### Tarea 17: Anti-fraude — rate limit de 5 intentos/hora por IP

**Files:**
- Modify: `src/lib/booking/anti-fraud.ts`, `src/lib/booking/anti-fraud.test.ts`

**Interfaces:**
- Consumes: nada nuevo (usa `prisma.bookingAttempt` directamente).
- Produces: `recordBookingAttempt(prisma: PrismaClient, params: { businessId: string; ipAddress: string }): Promise<void>`, `checkRateLimit(prisma: PrismaClient, params: { businessId: string; ipAddress: string; now?: Date; maxAttemptsPerHour?: number }): Promise<boolean>` — ambas usadas por la Tarea 18.

- [ ] **Step 1: Añadir el test que falla**

Actualiza el import en `src/lib/booking/anti-fraud.test.ts`:

```typescript
import {
  checkActiveAppointmentLimit,
  checkNoOverlapForCustomer,
  checkBlacklist,
  checkRateLimit,
  recordBookingAttempt,
} from './anti-fraud';
```

Y añade:

```typescript
describe('checkRateLimit', () => {
  it('permite el intento si hay menos de 5 registrados en la última hora para esa IP', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T10:00:00.000Z');

    for (let i = 0; i < 4; i++) {
      await prisma.bookingAttempt.create({
        data: {
          businessId: seed.business.id,
          ipAddress: '203.0.113.10',
          createdAt: new Date(now.getTime() - i * 60 * 1000),
        },
      });
    }

    const allowed = await checkRateLimit(prisma, {
      businessId: seed.business.id,
      ipAddress: '203.0.113.10',
      now,
    });

    expect(allowed).toBe(true);
  });

  it('bloquea el intento al llegar a 5 registrados en la última hora para esa IP', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T10:00:00.000Z');

    for (let i = 0; i < 5; i++) {
      await prisma.bookingAttempt.create({
        data: {
          businessId: seed.business.id,
          ipAddress: '203.0.113.11',
          createdAt: new Date(now.getTime() - i * 60 * 1000),
        },
      });
    }

    const allowed = await checkRateLimit(prisma, {
      businessId: seed.business.id,
      ipAddress: '203.0.113.11',
      now,
    });

    expect(allowed).toBe(false);
  });

  it('ignora intentos de hace más de una hora', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T10:00:00.000Z');

    for (let i = 0; i < 5; i++) {
      await prisma.bookingAttempt.create({
        data: {
          businessId: seed.business.id,
          ipAddress: '203.0.113.12',
          createdAt: new Date(now.getTime() - 90 * 60 * 1000), // hace 90 minutos
        },
      });
    }

    const allowed = await checkRateLimit(prisma, {
      businessId: seed.business.id,
      ipAddress: '203.0.113.12',
      now,
    });

    expect(allowed).toBe(true);
  });

  it('recordBookingAttempt persiste un nuevo intento', async () => {
    const seed = await seedDemoBusiness(prisma);

    await recordBookingAttempt(prisma, { businessId: seed.business.id, ipAddress: '203.0.113.13' });

    const count = await prisma.bookingAttempt.count({
      where: { businessId: seed.business.id, ipAddress: '203.0.113.13' },
    });

    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/anti-fraud.test.ts
```

Expected: FAIL con `checkRateLimit is not a function`.

- [ ] **Step 3: Implementar `recordBookingAttempt` y `checkRateLimit`**

Añade estas exportaciones al final de `src/lib/booking/anti-fraud.ts` (mantén todo el contenido anterior):

```typescript
export interface RecordBookingAttemptParams {
  businessId: string;
  ipAddress: string;
}

export async function recordBookingAttempt(
  prisma: PrismaClient,
  params: RecordBookingAttemptParams
): Promise<void> {
  await prisma.bookingAttempt.create({
    data: { businessId: params.businessId, ipAddress: params.ipAddress },
  });
}

export interface CheckRateLimitParams {
  businessId: string;
  ipAddress: string;
  now?: Date;
  maxAttemptsPerHour?: number;
}

export async function checkRateLimit(prisma: PrismaClient, params: CheckRateLimitParams): Promise<boolean> {
  const now = params.now ?? new Date();
  const maxAttemptsPerHour = params.maxAttemptsPerHour ?? 5;
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000);

  const count = await prisma.bookingAttempt.count({
    where: {
      businessId: params.businessId,
      ipAddress: params.ipAddress,
      createdAt: { gt: windowStart },
    },
  });

  return count < maxAttemptsPerHour;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/anti-fraud.test.ts
```

Expected: los 10 tests pasan (`Tests 10 passed (10)`).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/booking/anti-fraud.ts src/lib/booking/anti-fraud.test.ts
git commit -m "feat: limitar a 5 intentos de reserva por hora por IP"
```

Expected: commit creado.

---

### Tarea 18: `createAppointment` — transacción de reserva completa

**Files:**
- Create: `src/lib/booking/create-appointment.ts`, `src/lib/booking/create-appointment.test.ts`

**Interfaces:**
- Consumes: `getAvailableSlots` (Tarea 12), `assignAnyAvailableEmployee` (Tarea 13), `checkRateLimit`/`recordBookingAttempt`/`checkBlacklist`/`checkActiveAppointmentLimit`/`checkNoOverlapForCustomer` (Tareas 14-17), `getLocalDateString` (Tarea 8), `PENDING_EXPIRY_MINUTES` (Tarea 11).
- Produces: `CreateAppointmentInput`, `CreateAppointmentResult`, `createAppointment(prisma: PrismaClient, input: CreateAppointmentInput): Promise<CreateAppointmentResult>` — es la función central del motor, no consumida por otras tareas de este plan pero sí por fases futuras (Server Actions).

- [ ] **Step 1: Escribir los tests que fallan**

Crea `src/lib/booking/create-appointment.test.ts`:

```typescript
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
      expect(failed[0].reason).toBe('SLOT_TAKEN');
    }
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
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/create-appointment.test.ts
```

Expected: FAIL con `Cannot find module './create-appointment'`.

- [ ] **Step 3: Implementar `createAppointment`**

Crea `src/lib/booking/create-appointment.ts`:

```typescript
import { Prisma, type PrismaClient, type Appointment } from '@prisma/client';
import { getAvailableSlots } from './slots';
import { assignAnyAvailableEmployee } from './assignment';
import {
  checkRateLimit,
  recordBookingAttempt,
  checkBlacklist,
  checkActiveAppointmentLimit,
  checkNoOverlapForCustomer,
} from './anti-fraud';
import { getLocalDateString } from './timezone';
import { PENDING_EXPIRY_MINUTES } from './active-appointments';

export interface CreateAppointmentInput {
  businessId: string;
  serviceId: string;
  employeeId?: string;
  start: Date;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  source: 'QR' | 'WEB' | 'MANUAL';
  ipAddress: string;
  now?: Date;
}

export type CreateAppointmentFailureReason =
  | 'RATE_LIMITED'
  | 'BLACKLISTED'
  | 'CUSTOMER_LIMIT_REACHED'
  | 'CUSTOMER_OVERLAP'
  | 'EMPLOYEE_UNAVAILABLE'
  | 'NO_EMPLOYEE_AVAILABLE'
  | 'SLOT_TAKEN';

export type CreateAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: CreateAppointmentFailureReason };

async function isEmployeeAvailableAt(
  prisma: PrismaClient,
  params: { businessId: string; serviceId: string; employeeId: string; start: Date; now: Date }
): Promise<boolean> {
  const localDate = getLocalDateString(params.start);
  const slots = await getAvailableSlots(prisma, {
    businessId: params.businessId,
    serviceId: params.serviceId,
    employeeId: params.employeeId,
    dateFrom: localDate,
    dateTo: localDate,
    now: params.now,
  });

  return slots.some((slot) => slot.start.getTime() === params.start.getTime());
}

export async function createAppointment(
  prisma: PrismaClient,
  input: CreateAppointmentInput
): Promise<CreateAppointmentResult> {
  const now = input.now ?? new Date();

  await recordBookingAttempt(prisma, { businessId: input.businessId, ipAddress: input.ipAddress });

  const withinRateLimit = await checkRateLimit(prisma, {
    businessId: input.businessId,
    ipAddress: input.ipAddress,
    now,
  });
  if (!withinRateLimit) {
    return { ok: false, reason: 'RATE_LIMITED' };
  }

  const notBlacklisted = await checkBlacklist(prisma, {
    businessId: input.businessId,
    phone: input.customerPhone,
    email: input.customerEmail,
  });
  if (!notBlacklisted) {
    return { ok: false, reason: 'BLACKLISTED' };
  }

  const withinActiveLimit = await checkActiveAppointmentLimit(prisma, {
    businessId: input.businessId,
    phone: input.customerPhone,
    email: input.customerEmail,
    now,
  });
  if (!withinActiveLimit) {
    return { ok: false, reason: 'CUSTOMER_LIMIT_REACHED' };
  }

  const service = await prisma.service.findUniqueOrThrow({ where: { id: input.serviceId } });
  const end = new Date(input.start.getTime() + (service.durationMinutes + service.bufferAfterMinutes) * 60 * 1000);

  const noOverlap = await checkNoOverlapForCustomer(prisma, {
    businessId: input.businessId,
    phone: input.customerPhone,
    email: input.customerEmail,
    start: input.start,
    end,
    now,
  });
  if (!noOverlap) {
    return { ok: false, reason: 'CUSTOMER_OVERLAP' };
  }

  let employeeId: string;
  if (input.employeeId) {
    const available = await isEmployeeAvailableAt(prisma, {
      businessId: input.businessId,
      serviceId: input.serviceId,
      employeeId: input.employeeId,
      start: input.start,
      now,
    });
    if (!available) {
      return { ok: false, reason: 'EMPLOYEE_UNAVAILABLE' };
    }
    employeeId = input.employeeId;
  } else {
    const assigned = await assignAnyAvailableEmployee(prisma, {
      businessId: input.businessId,
      serviceId: input.serviceId,
      start: input.start,
      now,
    });
    if (!assigned) {
      return { ok: false, reason: 'NO_EMPLOYEE_AVAILABLE' };
    }
    employeeId = assigned;
  }

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      // Libera las PENDING caducadas que ocupan este mismo (employeeId, start):
      // getAvailableSlots ya las ignora (expiración perezosa), pero siguen
      // cumpliendo el predicado del índice único parcial
      // WHERE status IN ('PENDING','CONFIRMED'), y sin este paso el INSERT
      // chocaría con el índice y devolvería un SLOT_TAKEN falso.
      const pendingCutoff = new Date(now.getTime() - PENDING_EXPIRY_MINUTES * 60 * 1000);
      await tx.appointment.updateMany({
        where: {
          employeeId,
          start: input.start,
          status: 'PENDING',
          createdAt: { lte: pendingCutoff },
        },
        data: { status: 'CANCELLED' },
      });

      const customer = await tx.customer.upsert({
        where: {
          businessId_email: { businessId: input.businessId, email: input.customerEmail },
        },
        update: { name: input.customerName, phone: input.customerPhone },
        create: {
          businessId: input.businessId,
          name: input.customerName,
          phone: input.customerPhone,
          email: input.customerEmail,
        },
      });

      return tx.appointment.create({
        data: {
          businessId: input.businessId,
          serviceId: input.serviceId,
          employeeId,
          customerId: customer.id,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerEmail: input.customerEmail,
          start: input.start,
          end,
          status: 'PENDING',
          source: input.source,
        },
      });
    });

    return { ok: true, appointment };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'SLOT_TAKEN' };
    }
    throw error;
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/create-appointment.test.ts
```

Expected: los 10 tests pasan (`Tests 10 passed (10)`).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/booking/create-appointment.ts src/lib/booking/create-appointment.test.ts
git commit -m "feat: implementar la transaccion completa de reserva con reglas anti-fraude"
```

Expected: commit creado.

---

### Tarea 19: `confirmAppointment` — confirmación con expiración a los 30 minutos

**Files:**
- Create: `src/lib/booking/tokens.ts`, `src/lib/booking/tokens.test.ts`

**Interfaces:**
- Consumes: `PENDING_EXPIRY_MINUTES` (Tarea 11).
- Produces: `ConfirmAppointmentResult`, `confirmAppointment(prisma: PrismaClient, token: string, now?: Date): Promise<ConfirmAppointmentResult>` — usada por fases futuras (ruta `/confirmar/{token}`); base para la Tarea 20.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `src/lib/booking/tokens.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from './create-appointment';
import { confirmAppointment } from './tokens';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z');

async function createPendingAppointment(overrides: { createdAt?: Date } = {}) {
  const seed = await seedDemoBusiness(prisma);
  const result = await createAppointment(prisma, {
    businessId: seed.business.id,
    serviceId: seed.services.corteHombre.id,
    employeeId: seed.employees.marta.id,
    start: VALID_START,
    customerName: 'Cliente token',
    customerPhone: '+34677000001',
    customerEmail: 'token@example.com',
    source: 'WEB',
    ipAddress: '198.51.100.20',
    now: NOW,
  });

  if (!result.ok) {
    throw new Error(`No se pudo crear la cita de prueba: ${result.reason}`);
  }

  if (overrides.createdAt) {
    await prisma.appointment.update({
      where: { id: result.appointment.id },
      data: { createdAt: overrides.createdAt },
    });
  }

  return result.appointment;
}

describe('confirmAppointment', () => {
  it('confirma una cita PENDING dentro de los 30 minutos', async () => {
    const appointment = await createPendingAppointment();
    const confirmAt = new Date(NOW.getTime() + 10 * 60 * 1000); // 10 min después

    const result = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('CONFIRMED');
    }
  });

  it('devuelve EXPIRED si han pasado más de 30 minutos desde la creación', async () => {
    const appointment = await createPendingAppointment();
    const confirmAt = new Date(NOW.getTime() + 31 * 60 * 1000); // 31 min después

    const result = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('devuelve NOT_FOUND si el token no existe', async () => {
    const result = await confirmAppointment(prisma, 'token-inexistente', NOW);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('devuelve INVALID_STATE si la cita ya no está PENDING', async () => {
    const appointment = await createPendingAppointment();
    const confirmAt = new Date(NOW.getTime() + 5 * 60 * 1000);

    await confirmAppointment(prisma, appointment.confirmToken, confirmAt);
    const secondAttempt = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(secondAttempt).toEqual({ ok: false, reason: 'INVALID_STATE' });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/tokens.test.ts
```

Expected: FAIL con `Cannot find module './tokens'`.

- [ ] **Step 3: Implementar `confirmAppointment`**

Crea `src/lib/booking/tokens.ts`:

```typescript
import type { PrismaClient, Appointment } from '@prisma/client';
import { PENDING_EXPIRY_MINUTES } from './active-appointments';

export type ConfirmAppointmentFailureReason = 'NOT_FOUND' | 'EXPIRED' | 'INVALID_STATE';

export type ConfirmAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: ConfirmAppointmentFailureReason };

export async function confirmAppointment(
  prisma: PrismaClient,
  token: string,
  now: Date = new Date()
): Promise<ConfirmAppointmentResult> {
  const appointment = await prisma.appointment.findUnique({ where: { confirmToken: token } });

  if (!appointment) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (appointment.status !== 'PENDING') {
    return { ok: false, reason: 'INVALID_STATE' };
  }

  const expiresAt = new Date(appointment.createdAt.getTime() + PENDING_EXPIRY_MINUTES * 60 * 1000);
  if (now > expiresAt) {
    return { ok: false, reason: 'EXPIRED' };
  }

  const confirmed = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'CONFIRMED' },
  });

  return { ok: true, appointment: confirmed };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/tokens.test.ts
```

Expected: los 4 tests pasan (`Tests 4 passed (4)`).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/booking/tokens.ts src/lib/booking/tokens.test.ts
git commit -m "feat: confirmar citas por token con caducidad de 30 minutos"
```

Expected: commit creado.

---

### Tarea 20: `cancelAppointment` — cancelación por token

**Files:**
- Modify: `src/lib/booking/tokens.ts`, `src/lib/booking/tokens.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `CancelAppointmentResult`, `cancelAppointment(prisma: PrismaClient, token: string): Promise<CancelAppointmentResult>` — usada por fases futuras (ruta `/cita/{token}`).

- [ ] **Step 1: Añadir los tests que fallan**

Actualiza el import en `src/lib/booking/tokens.test.ts`:

```typescript
import { confirmAppointment, cancelAppointment } from './tokens';
```

Y añade:

```typescript
describe('cancelAppointment', () => {
  it('cancela una cita PENDING', async () => {
    const appointment = await createPendingAppointment();

    const result = await cancelAppointment(prisma, appointment.cancelToken);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('CANCELLED');
    }
  });

  it('cancela una cita CONFIRMED', async () => {
    const appointment = await createPendingAppointment();
    await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 5 * 60 * 1000));

    const result = await cancelAppointment(prisma, appointment.cancelToken);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('CANCELLED');
    }
  });

  it('es idempotente si la cita ya estaba CANCELLED', async () => {
    const appointment = await createPendingAppointment();
    await cancelAppointment(prisma, appointment.cancelToken);

    const secondAttempt = await cancelAppointment(prisma, appointment.cancelToken);

    expect(secondAttempt.ok).toBe(true);
    if (secondAttempt.ok) {
      expect(secondAttempt.appointment.status).toBe('CANCELLED');
    }
  });

  it('devuelve NOT_FOUND si el token no existe', async () => {
    const result = await cancelAppointment(prisma, 'token-inexistente');

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('devuelve INVALID_STATE si la cita ya está COMPLETED', async () => {
    const appointment = await createPendingAppointment();
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: 'COMPLETED' } });

    const result = await cancelAppointment(prisma, appointment.cancelToken);

    expect(result).toEqual({ ok: false, reason: 'INVALID_STATE' });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/tokens.test.ts
```

Expected: FAIL con `cancelAppointment is not a function`.

- [ ] **Step 3: Implementar `cancelAppointment`**

Añade esta exportación al final de `src/lib/booking/tokens.ts` (mantén todo el contenido anterior):

```typescript
export type CancelAppointmentFailureReason = 'NOT_FOUND' | 'INVALID_STATE';

export type CancelAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: CancelAppointmentFailureReason };

export async function cancelAppointment(prisma: PrismaClient, token: string): Promise<CancelAppointmentResult> {
  const appointment = await prisma.appointment.findUnique({ where: { cancelToken: token } });

  if (!appointment) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (appointment.status === 'CANCELLED') {
    return { ok: true, appointment };
  }

  if (appointment.status === 'COMPLETED' || appointment.status === 'NO_SHOW') {
    return { ok: false, reason: 'INVALID_STATE' };
  }

  const cancelled = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'CANCELLED' },
  });

  return { ok: true, appointment: cancelled };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/tokens.test.ts
```

Expected: los 9 tests pasan (`Tests 9 passed (9)`).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/booking/tokens.ts src/lib/booking/tokens.test.ts
git commit -m "feat: cancelar citas por token de forma idempotente"
```

Expected: commit creado.

---

### Tarea 21: Transiciones de estado — completar y marcar no-show

**Files:**
- Create: `src/lib/booking/state.ts`, `src/lib/booking/state.test.ts`

**Interfaces:**
- Consumes: nada nuevo (usa `prisma.appointment` directamente).
- Produces: `canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean`, `completeAppointment(prisma: PrismaClient, appointmentId: string): Promise<TransitionAppointmentResult>`, `markNoShow(prisma: PrismaClient, appointmentId: string): Promise<TransitionAppointmentResult>` — cierran el ciclo de vida de la cita; consumidas por el panel del negocio en fases futuras.

- [ ] **Step 1: Escribir los tests que fallan**

Crea `src/lib/booking/state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { canTransition, completeAppointment, markNoShow } from './state';

async function createConfirmedAppointment() {
  const seed = await seedDemoBusiness(prisma);
  const customer = await prisma.customer.create({
    data: {
      businessId: seed.business.id,
      name: 'Cliente estado',
      phone: '+34688000001',
      email: 'estado@example.com',
    },
  });

  return prisma.appointment.create({
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
}

describe('canTransition', () => {
  it('permite las transiciones válidas', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'NO_SHOW')).toBe(true);
  });

  it('rechaza las transiciones inválidas', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false);
    expect(canTransition('COMPLETED', 'CONFIRMED')).toBe(false);
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransition('NO_SHOW', 'COMPLETED')).toBe(false);
  });
});

describe('completeAppointment', () => {
  it('marca como COMPLETED una cita CONFIRMED', async () => {
    const appointment = await createConfirmedAppointment();

    const result = await completeAppointment(prisma, appointment.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('COMPLETED');
    }
  });

  it('devuelve INVALID_TRANSITION si la cita está PENDING', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente pendiente',
        phone: '+34688000002',
        email: 'pendiente@example.com',
      },
    });
    const appointment = await prisma.appointment.create({
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
        status: 'PENDING',
      },
    });

    const result = await completeAppointment(prisma, appointment.id);

    expect(result).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
  });

  it('devuelve NOT_FOUND si el id no existe', async () => {
    const result = await completeAppointment(prisma, 'id-inexistente');

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('markNoShow', () => {
  it('marca como NO_SHOW una cita CONFIRMED', async () => {
    const appointment = await createConfirmedAppointment();

    const result = await markNoShow(prisma, appointment.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('NO_SHOW');
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```powershell
pnpm test src/lib/booking/state.test.ts
```

Expected: FAIL con `Cannot find module './state'`.

- [ ] **Step 3: Implementar `state.ts`**

Crea `src/lib/booking/state.ts`:

```typescript
import type { PrismaClient, Appointment, AppointmentStatus } from '@prisma/client';

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type TransitionAppointmentFailureReason = 'NOT_FOUND' | 'INVALID_TRANSITION';

export type TransitionAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: TransitionAppointmentFailureReason };

async function transitionAppointment(
  prisma: PrismaClient,
  appointmentId: string,
  to: AppointmentStatus
): Promise<TransitionAppointmentResult> {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });

  if (!appointment) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (!canTransition(appointment.status, to)) {
    return { ok: false, reason: 'INVALID_TRANSITION' };
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: to },
  });

  return { ok: true, appointment: updated };
}

export async function completeAppointment(
  prisma: PrismaClient,
  appointmentId: string
): Promise<TransitionAppointmentResult> {
  return transitionAppointment(prisma, appointmentId, 'COMPLETED');
}

export async function markNoShow(
  prisma: PrismaClient,
  appointmentId: string
): Promise<TransitionAppointmentResult> {
  return transitionAppointment(prisma, appointmentId, 'NO_SHOW');
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```powershell
pnpm test src/lib/booking/state.test.ts
```

Expected: los 6 tests pasan (`Tests 6 passed (6)`).

- [ ] **Step 5: Ejecutar toda la suite de tests del proyecto**

```powershell
pnpm test
```

Expected: todos los archivos de test de las Fases 1 y 2 pasan — `Test Files 9 passed (9)`, con un total de 52 tests en verde: 2 de `setup.test.ts` + 2 de `demo-business.test.ts` + 5 de `timezone.test.ts` + 6 de `slots.test.ts` + 2 de `assignment.test.ts` + 10 de `anti-fraud.test.ts` + 10 de `create-appointment.test.ts` + 9 de `tokens.test.ts` + 6 de `state.test.ts` = 52. Confirma que no hay ningún `FAIL` en la salida.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/booking/state.ts src/lib/booking/state.test.ts
git commit -m "feat: implementar transiciones de estado completar y marcar no-show"
```

Expected: commit creado.

---

## Auto-revisión

**1. Cobertura de la spec (Fases 1 y 2):**

- Proyecto Next.js App Router + TS strict + Tailwind v4 → Tarea 1.
- Prisma sobre Supabase vía `DATABASE_URL`/`DIRECT_URL` en `.env` → Tarea 2.
- Esquema completo: `Business`, `Membership`, `Service`, `Employee`, `ServiceEmployee`, `WorkingHours`, `TimeOff`, `Appointment`, `Customer`, `BlacklistEntry` (+ `BookingAttempt`, adición justificada para el rate limit) → Tarea 3.
- Restricción única parcial `(employeeId, start)` para citas activas vía SQL manual → Tarea 4.
- Vitest contra BD Postgres de test real, sin mocks → Tarea 5.
- Seed con negocio demo "Salón Aura", peluquería, 2 empleados, 4 servicios, horarios realistas → Tareas 6-7.
- `getAvailableSlots` (horario − citas activas − ausencias, granularidad configurable, expiración perezosa de `PENDING`, antelación mínima, ventana máxima, "cualquier profesional") → Tareas 8-12.
- Asignación "cualquier profesional" = menor carga del día → Tarea 13.
- Anti-fraude: límite de 2 citas activas por teléfono/email → Tarea 14; sin solapes del mismo cliente → Tarea 15; lista negra → Tarea 16; rate limit 5/hora por IP → Tarea 17.
- `createAppointment` transaccional, con red de seguridad del índice único ante condiciones de carrera y liberación (dentro de la transacción) de las PENDING caducadas que ocupan el mismo hueco exacto, para evitar falsos `SLOT_TAKEN` en huecos que la expiración perezosa ya considera libres → Tarea 18.
- Confirmación por token con caducidad a los 30 min → Tarea 19.
- Cancelación por token → Tarea 20.
- Transiciones de estado (`PENDING → CONFIRMED → COMPLETED | CANCELLED | NO_SHOW`) → Tarea 21 (más las transiciones a `CONFIRMED`/`CANCELLED` ya cubiertas en Tareas 19-20).

No quedan gaps: todo lo descrito en las Fases 1 y 2 de la spec tiene una tarea que lo implementa y un test que lo verifica. Los elementos de fases posteriores (theming, emails, panel, super-admin, pagos, SMS/WhatsApp, i18n, lista de espera) quedan explícitamente fuera de este plan, como indica su alcance.

**2. Escaneo de placeholders:** revisado el documento completo — no hay `TBD`, `TODO`, "añadir validación", "similar a la Tarea N" ni pasos sin código. Cada paso de implementación muestra el archivo completo o el bloque exacto a añadir.

**3. Consistencia de tipos entre tareas:**

- `AvailableSlot { start: Date; end: Date; employeeId: string }` y `GetAvailableSlotsParams` se mantienen idénticos desde la Tarea 9 hasta la 18.
- `activeAppointmentWhere(now: Date)` (Tarea 11) se reutiliza sin cambios de firma en las Tareas 12, 13, 14 y 15; `PENDING_EXPIRY_MINUTES` (Tarea 11) se reutiliza en las Tareas 18 (liberación de PENDING caducadas dentro de la transacción) y 19 (caducidad del token de confirmación).
- `rangesOverlap` (Tarea 10) se reutiliza sin cambios en la Tarea 11 (vía `slots.ts`) y conceptualmente en las comprobaciones de solape de `anti-fraud.ts` (Tarea 15, expresado como condición Prisma equivalente).
- `CreateAppointmentResult` (Tarea 18) usa exactamente los mismos literales de `reason` que se prueban en `create-appointment.test.ts`.
- `ConfirmAppointmentResult`/`CancelAppointmentResult` (Tareas 19-20) y `TransitionAppointmentResult` (Tarea 21) siguen el mismo patrón `{ ok: true; appointment } | { ok: false; reason }` de forma consistente.
- `seedDemoBusiness` (Tarea 6) devuelve `DemoBusinessSeed` con las claves `business`, `employees.{marta,carlos}`, `services.{corteMujer,corteHombre,coloracion,peinadoEvento}`, usadas literalmente igual en las Tareas 7 y 9-21.

No se detectaron incoherencias de nombres ni de tipos entre tareas.

---

Plan completo y guardado en `docs/superpowers/plans/2026-07-12-fase1-2-fundacion-y-motor.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — despliego un subagente nuevo por tarea, con revisión entre tareas, iteración rápida.

**2. Ejecución en línea** — ejecuto las tareas en esta misma sesión usando executing-plans, por lotes con puntos de control.

¿Qué opción prefieres?
