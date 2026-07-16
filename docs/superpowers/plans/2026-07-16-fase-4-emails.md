# Appoint — Fase 4 (Emails y recordatorios) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir la capa de emails transaccionales de Appoint (Resend + React Email) con una interfaz de envío intercambiable, hacer que la confirmación por token sea una acción explícita del cliente (nunca automática al abrir el enlace), implementar la semántica de doble paso de `manualApproval` (confirmar email ≠ aprobar la cita), y añadir el cron horario de recordatorios 24h antes — de modo que el copy "te hemos enviado un email" de la Fase 3 deje de ser una promesa y pase a ser cierto.

**Architecture:** `src/lib/email/` contiene la capa de envío intercambiable: una interfaz `EmailSender` con dos implementaciones de producción (`ResendEmailSender`, `ConsoleEmailSender`, elegidas en runtime por `getEmailSender()` según exista o no `RESEND_API_KEY`) y una tercera en memoria (`FakeEmailSender`, solo en tests) inyectada explícitamente. Las plantillas viven en `src/lib/email/templates/` como componentes de React Email que comparten un `EmailLayout` con el nombre/logo/acento del negocio. `src/lib/email/appointment-notifications.tsx` contiene las funciones "de más alto nivel" (`sendBookingConfirmationEmail`, `sendReminderEmail`, etc.) que construyen el `EmailMessage` a partir de datos de dominio (cita + servicio + empleado + negocio) y envían con try/catch interno (un fallo de envío nunca lanza ni rompe el flujo que lo invoca). Los puntos de integración (`src/lib/public/booking-service.ts`, un nuevo `src/lib/public/cancellation-service.ts`, y el nuevo `src/lib/email/reminders.ts` para el cron) aceptan un `EmailSender` inyectable opcional (mismo patrón que el `now?: Date` ya usado en todo `src/lib/booking/`), lo que permite testear con Postgres real + `FakeEmailSender` sin tocar red. La confirmación por token dobla de ser una operación de solo lectura ejecutada en el render de la página (bug conocido, ver aviso ⚠️ en `CONTINUAR.md`) a una Server Action explícita (`POST` disparado por un botón); el motor (`src/lib/booking/tokens.ts`, `active-appointments.ts`, `create-appointment.ts`) gana el campo `emailVerifiedAt` que, cuando está fijado en una cita `PENDING` con `manualApproval`, la excluye indefinidamente de la expiración perezosa de 30 minutos. El cron de recordatorios es un Route Handler fino protegido por `Authorization: Bearer ${CRON_SECRET}` que delega toda la lógica de selección/envío/marcado en una función de librería totalmente testeada con Postgres real.

**Tech Stack:** Next.js 15.5.20 (App Router, Server Components + Server Actions + Route Handlers), TypeScript strict, React 19.1.0, React Email (`@react-email/components` 1.0.12, `@react-email/render` 2.1.0) + Resend (`resend` 6.17.2) para el envío, Prisma 6.19.3 sobre PostgreSQL de Supabase, Vitest 4.1.10 (TDD, Postgres real) + `@vitejs/plugin-react` 6.0.3 (necesario para poder testear componentes `.tsx` con Vitest — ver Tarea 1, Step 2), Playwright 1.61.1 para el e2e, `date-fns`/`date-fns-tz` para fechas, Vercel Cron, pnpm.

## Global Constraints

- **Idioma:** toda la UI, los copys de los emails y los mensajes de error van en español. Los identificadores de código van en inglés.
- **Multi-tenancy:** toda consulta a tablas de negocio filtra por `businessId` en la capa de aplicación (no hay RLS). Nunca debe ser posible que un email revele o enlace a datos de un negocio distinto al de la cita.
- **Zona horaria:** las citas se almacenan en UTC; los negocios son españoles (`Europe/Madrid`). Los emails muestran fecha/hora con `formatAppointmentDateTime()` de `src/lib/public/format-datetime.ts` (ya existente, no reimplementar el formateo).
- **TDD obligatorio** en toda la lógica de negocio nueva (expiración perezosa con `emailVerifiedAt`, doble paso de confirmación, funciones `sendXEmail`, selección/marcado de recordatorios, autorización del cron): escribe el test en rojo antes que la implementación. Los tests que tocan Prisma corren contra Postgres real (`TEST_DATABASE_URL`, `appoint_test`, `pnpm test`) — nunca mockees `PrismaClient`. `fileParallelism` está desactivado a propósito en `vitest.config.ts` (BD compartida): no lo reactives.
- **Confirmar-en-GET se elimina (Tarea 9):** `/confirmar/{token}` en `GET` es de solo lectura (resumen + botón); la confirmación real ocurre en una Server Action (`POST`) disparada por el botón. Actualiza el e2e Playwright (`e2e/booking-flow.spec.ts`) para pulsar el botón en vez de asumir que el `goto` confirma.
- **`manualApproval` = doble paso (Tareas 3-4, ya decidido, no reabrir):** sin `manualApproval`, confirmar por token pone la cita en `CONFIRMED` y fija `emailVerifiedAt`. Con `manualApproval`, confirmar por token fija `emailVerifiedAt` pero la cita **sigue `PENDING`** (la aprobará el negocio desde el panel en la Fase 5, fuera de alcance). Una `PENDING` con `emailVerifiedAt` fijado ya no caduca a los 30 minutos y sigue bloqueando el hueco indefinidamente.
- **Los fallos de envío no rompen nada:** todas las funciones `sendXEmail` capturan sus propios errores (try/catch interno vía un helper compartido) y nunca lanzan; el llamador nunca necesita su propio try/catch. Los envíos ocurren siempre después de que la operación de negocio (reserva o cancelación) ya ha tenido éxito.
- **Capa de email intercambiable:** `EmailSender` con `ResendEmailSender` (producción, si hay `RESEND_API_KEY`) y `ConsoleEmailSender` (dev/test, por defecto). En los tests Vitest se inyecta `FakeEmailSender` (en memoria) explícitamente vía el parámetro opcional `emailSender` — nunca se llama a `getEmailSender()` dentro de un test.
- **Enlaces absolutos:** todo enlace dentro de un email se construye con `getAppBaseUrl()` / `buildConfirmUrl()` / `buildCancelUrl()` de `src/lib/email/urls.ts` (Tarea 5), nunca con rutas relativas. Variable de entorno nueva `APP_BASE_URL` (por defecto `http://localhost:3000` en dev).
- **Variables de entorno nuevas** (documentar en `.env.example` en la tarea que las introduce): `RESEND_API_KEY` (opcional), `EMAIL_FROM` (por defecto `onboarding@resend.dev`), `APP_BASE_URL`, `CRON_SECRET`.
- **Theming en emails:** las plantillas usan `business.accentColor`, `business.name` y `business.logoUrl` (con fallback a texto si no hay logo). No hay tipografías personalizadas en emails (soporte de fuentes web poco fiable en clientes de correo) — solo una pila de fuentes segura (`Georgia, 'Times New Roman', serif`), consistente con la decisión ya tomada.
- **Plantilla "invitación de dueño" EXCLUIDA** de esta fase (Fase 6, fuera de alcance).
- **Versiones ancladas exactas (sin caret):** todas las dependencias nuevas (`resend`, `@react-email/components`, `@react-email/render`, `@vitejs/plugin-react`) se instalan con `--save-exact`. No actualizar versiones ya fijadas (Next 15.5.20, Prisma 6.19.3, React 19.1.0, etc.) sin decisión explícita.
- Todos los comandos del plan son compatibles con PowerShell/Windows.
- **Deuda consciente aceptada del motor (no tocar sin necesidad):** TOCTOU en límites anti-fraude fuera de la transacción; `checkRateLimit` acoplado al flujo insertar-antes-de-contar; los tests de carrera aceptan `EMPLOYEE_UNAVAILABLE` además de `SLOT_TAKEN`.
- **Modelo sugerido por tarea:** cada tarea indica `haiku` (código completo en el plan, transcripción mecánica) o `sonnet` (integración, entorno, o cambios cross-cutting) según la política del proyecto (`docs/superpowers/CONTINUAR.md`). Todos los revisores por tarea usan sonnet igualmente, independientemente del modelo del implementador.

---

## Capa de email e infraestructura

### Tarea 1: Infraestructura de envío de emails (interfaz intercambiable)

**Modelo sugerido:** sonnet

**Files:**
- Create: `src/lib/email/types.ts`, `src/lib/email/console-sender.ts`, `src/lib/email/resend-sender.ts`, `src/lib/email/get-email-sender.ts`, `src/test/fake-email-sender.ts`
- Test: `src/lib/email/console-sender.test.tsx`, `src/lib/email/resend-sender.test.ts`, `src/lib/email/get-email-sender.test.ts`
- Modify: `package.json`, `vitest.config.ts`, `.env.example`

**Interfaces:**
- Consumes: nada de código existente (tarea fundacional).
- Produces:
  - `EmailMessage = { to: string; subject: string; react: ReactElement }`
  - `EmailSender = { send(message: EmailMessage): Promise<void> }`
  - `class ConsoleEmailSender implements EmailSender`
  - `class ResendEmailSender implements EmailSender` (constructor `(apiKey: string, from?: string)`)
  - `getEmailSender(): EmailSender`
  - `class FakeEmailSender implements EmailSender` (test-only, en `src/test/fake-email-sender.ts`, con `sent: EmailMessage[]`)

  Usados por todas las tareas siguientes de este plan.

- [ ] **Step 1: Instalar las dependencias de email**

```powershell
pnpm add resend@6.17.2 @react-email/components@1.0.12 @react-email/render@2.1.0 --save-exact
pnpm add -D @vitejs/plugin-react@6.0.3 --save-exact
```

Expected: ambos comandos terminan con código de salida 0; `package.json` queda con `resend: "6.17.2"`, `@react-email/components: "1.0.12"` y `@react-email/render: "2.1.0"` en `dependencies`, y `@vitejs/plugin-react: "6.0.3"` en `devDependencies` (verificado: `@react-email/components@1.0.12` declara `peerDependencies.react: "^18.0 || ^19.0 || ^19.0.0-rc"`, compatible con React 19.1.0 ya instalado; `resend@6.17.2` declara `peerDependencies["@react-email/render"]: "*"`, satisfecha por la instalación explícita de `@react-email/render@2.1.0`).

- [ ] **Step 2: Registrar el plugin de React en Vitest**

Los templates de email de las tareas siguientes son componentes `.tsx` con JSX; Vitest usa esbuild vía Vite y por defecto no transforma JSX en modo `"preserve"` (el que usa `tsconfig.json` para que Next.js gestione su propio pipeline de compilación). Sin este plugin, cualquier test que importe un `.tsx` con JSX falla con `Failed to parse source for import analysis... make sure to not set jsx to preserve` (comprobado empíricamente). Modifica `vitest.config.ts`:

```typescript
import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
    // e2e/ contiene specs de Playwright (test.afterAll de @playwright/test
    // choca con el runner de Vitest si se recogen aquí).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

Este cambio no afecta a `next dev`/`next build` (usan su propio compilador SWC vía `tsconfig.json`, no Vite/esbuild): solo cambia cómo Vitest transforma los archivos que importa.

- [ ] **Step 3: Documentar las variables de entorno de Resend en `.env.example`**

```
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/appoint_test"

# Fase 4 — emails (opcional en dev: sin RESEND_API_KEY se usa ConsoleEmailSender,
# que registra el email en consola sin enviarlo).
RESEND_API_KEY=""
EMAIL_FROM="onboarding@resend.dev"
```

- [ ] **Step 4: Crear los tipos compartidos de la capa de email**

Crea `src/lib/email/types.ts`:

```typescript
import type { ReactElement } from 'react';

export interface EmailMessage {
  to: string;
  subject: string;
  react: ReactElement;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
```

- [ ] **Step 5: Escribir el test de `ConsoleEmailSender`**

Crea `src/lib/email/console-sender.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ConsoleEmailSender } from './console-sender';

describe('ConsoleEmailSender', () => {
  it('registra el email en consola (para/asunto/contenido) sin lanzar y sin enviar nada', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sender = new ConsoleEmailSender();

    await sender.send({
      to: 'cliente@example.com',
      subject: 'Confirma tu cita',
      react: <div>Contenido de prueba</div>,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const loggedText = logSpy.mock.calls[0][0] as string;
    expect(loggedText).toContain('cliente@example.com');
    expect(loggedText).toContain('Confirma tu cita');
    expect(loggedText).toContain('Contenido de prueba');

    logSpy.mockRestore();
  });
});
```

- [ ] **Step 6: Ejecutar el test y comprobar que falla**

```powershell
pnpm test console-sender.test.tsx
```

Expected: falla con `Cannot find module './console-sender'` (o equivalente "no such file").

- [ ] **Step 7: Implementar `ConsoleEmailSender`**

Crea `src/lib/email/console-sender.ts`:

```typescript
import { render } from '@react-email/render';
import type { EmailMessage, EmailSender } from './types';

export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    const text = await render(message.react, { plainText: true });
    console.log(`[email:consola] Para: ${message.to} | Asunto: ${message.subject}\n${text}`);
  }
}
```

- [ ] **Step 8: Ejecutar el test y comprobar que pasa**

```powershell
pnpm test console-sender.test.tsx
```

Expected: `1 passed`.

- [ ] **Step 9: Escribir el test de `ResendEmailSender`**

Crea `src/lib/email/resend-sender.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { ResendEmailSender } from './resend-sender';

describe('ResendEmailSender', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('envía el mensaje usando el remitente por defecto si no se indica uno', async () => {
    sendMock.mockResolvedValue({ data: { id: 'abc' }, error: null });
    const sender = new ResendEmailSender('re_test_key');

    await sender.send({ to: 'cliente@example.com', subject: 'Asunto', react: createElement('div', null, 'Hola') });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'onboarding@resend.dev',
        to: 'cliente@example.com',
        subject: 'Asunto',
      })
    );
  });

  it('usa el remitente indicado explícitamente', async () => {
    sendMock.mockResolvedValue({ data: { id: 'abc' }, error: null });
    const sender = new ResendEmailSender('re_test_key', 'reservas@salonaura.example');

    await sender.send({ to: 'cliente@example.com', subject: 'Asunto', react: createElement('div', null, 'Hola') });

    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ from: 'reservas@salonaura.example' }));
  });

  it('lanza un error si Resend devuelve un error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'clave inválida' } });
    const sender = new ResendEmailSender('re_test_key');

    await expect(
      sender.send({ to: 'cliente@example.com', subject: 'Asunto', react: createElement('div', null, 'Hola') })
    ).rejects.toThrow('clave inválida');
  });
});
```

- [ ] **Step 10: Ejecutar el test y comprobar que falla**

```powershell
pnpm test resend-sender.test.ts
```

Expected: falla con `Cannot find module './resend-sender'`.

- [ ] **Step 11: Implementar `ResendEmailSender`**

Crea `src/lib/email/resend-sender.ts`:

```typescript
import { Resend } from 'resend';
import type { EmailMessage, EmailSender } from './types';

const DEFAULT_FROM = 'onboarding@resend.dev';

export class ResendEmailSender implements EmailSender {
  private client: Resend;
  private from: string;

  constructor(apiKey: string, from: string = process.env.EMAIL_FROM || DEFAULT_FROM) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const result = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      react: message.react,
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }
  }
}
```

- [ ] **Step 12: Ejecutar el test y comprobar que pasa**

```powershell
pnpm test resend-sender.test.ts
```

Expected: `3 passed`.

- [ ] **Step 13: Escribir el test de `getEmailSender`**

Crea `src/lib/email/get-email-sender.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { getEmailSender } from './get-email-sender';
import { ResendEmailSender } from './resend-sender';
import { ConsoleEmailSender } from './console-sender';

describe('getEmailSender', () => {
  const originalApiKey = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
  });

  it('devuelve ResendEmailSender si RESEND_API_KEY está definida', () => {
    process.env.RESEND_API_KEY = 're_test_key';
    expect(getEmailSender()).toBeInstanceOf(ResendEmailSender);
  });

  it('devuelve ConsoleEmailSender si RESEND_API_KEY no está definida', () => {
    delete process.env.RESEND_API_KEY;
    expect(getEmailSender()).toBeInstanceOf(ConsoleEmailSender);
  });
});
```

- [ ] **Step 14: Ejecutar el test y comprobar que falla**

```powershell
pnpm test get-email-sender.test.ts
```

Expected: falla con `Cannot find module './get-email-sender'`.

- [ ] **Step 15: Implementar `getEmailSender`**

Crea `src/lib/email/get-email-sender.ts`:

```typescript
import { ConsoleEmailSender } from './console-sender';
import { ResendEmailSender } from './resend-sender';
import type { EmailSender } from './types';

export function getEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return new ResendEmailSender(apiKey);
  }
  return new ConsoleEmailSender();
}
```

- [ ] **Step 16: Ejecutar el test y comprobar que pasa**

```powershell
pnpm test get-email-sender.test.ts
```

Expected: `2 passed`.

- [ ] **Step 17: Crear el sender falso para tests (infraestructura de test, sin test propio)**

Crea `src/test/fake-email-sender.ts`:

```typescript
import type { EmailMessage, EmailSender } from '@/lib/email/types';

export class FakeEmailSender implements EmailSender {
  sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}
```

- [ ] **Step 18: Ejecutar toda la suite para comprobar que nada se ha roto**

```powershell
pnpm test
```

Expected: todos los tests existentes (140) más los 6 nuevos de esta tarea en verde.

- [ ] **Step 19: Commit**

```powershell
git add package.json pnpm-lock.yaml vitest.config.ts .env.example src/lib/email/types.ts src/lib/email/console-sender.ts src/lib/email/console-sender.test.tsx src/lib/email/resend-sender.ts src/lib/email/resend-sender.test.ts src/lib/email/get-email-sender.ts src/lib/email/get-email-sender.test.ts src/test/fake-email-sender.ts
git commit -m "feat(email): capa de envío intercambiable (Resend/consola) con selección por entorno"
```

---

### Tarea 2: Migración Prisma — `emailVerifiedAt` y `reminderSentAt`

**Modelo sugerido:** sonnet

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_appointment_email_tracking/migration.sql`

**Interfaces:**
- Consumes: nada de código de aplicación.
- Produces: columnas `Appointment.emailVerifiedAt DateTime?` y `Appointment.reminderSentAt DateTime?`, disponibles vía `@prisma/client` para todas las tareas siguientes.

- [ ] **Step 1: Añadir los campos al modelo `Appointment`**

Edita `prisma/schema.prisma`. Localiza el modelo `Appointment` (tiene un comentario largo justo antes explicando el índice único parcial manual: no lo toques) y añade los dos campos nuevos justo después de `cancelToken`:

```prisma
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
  emailVerifiedAt DateTime?
  reminderSentAt  DateTime?
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
```

- [ ] **Step 2: Generar la migración sin aplicarla**

```powershell
pnpm exec prisma migrate dev --name add_appointment_email_tracking --create-only
```

Expected: termina con `Prisma Migrate created the following migration without applying it` y la ruta `prisma/migrations/<timestamp>_add_appointment_email_tracking/migration.sql` (el timestamp real será distinto en cada ejecución).

- [ ] **Step 3: Revisar el SQL generado (aviso del índice único parcial manual)**

Abre el archivo `migration.sql` generado. Debe contener únicamente:

```sql
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
```

**Importante:** el comentario en `schema.prisma` junto al modelo `Appointment` advierte que Prisma podría proponer eliminar el índice único parcial `Appointment_employeeId_start_active_key` (creado a mano en la migración `20260712225310_init`, no representado en el DSL del schema). Si el archivo generado contiene alguna sentencia `DROP INDEX "Appointment_employeeId_start_active_key"`, bórrala del archivo antes de continuar — ese índice debe seguir existiendo. Si el archivo solo contiene las dos líneas `ALTER TABLE` de arriba (caso esperado, igual que ocurrió en la migración `20260714080402_add_business_image_urls` que solo añadió una columna), no hay nada que editar.

- [ ] **Step 4: Aplicar la migración y regenerar el cliente**

```powershell
pnpm exec prisma migrate dev
```

Expected: salida indica que la migración pendiente se aplicó (`Applying migration '<timestamp>_add_appointment_email_tracking'`) seguida de `Your database is now in sync with your schema.` y `✔ Generated Prisma Client`.

- [ ] **Step 5: Verificar que el resto de la suite sigue en verde (regresión, sin lógica nueva aún)**

```powershell
pnpm test
```

Expected: los 140 tests existentes siguen en verde (la migración solo añade columnas nulas; no cambia ningún comportamiento todavía).

- [ ] **Step 6: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): añade emailVerifiedAt y reminderSentAt a Appointment"
```

---

## Motor: expiración perezosa y confirmación de doble paso

### Tarea 3: Una `PENDING` con `emailVerifiedAt` fijado ya no caduca

**Modelo sugerido:** sonnet

**Files:**
- Modify: `src/lib/booking/active-appointments.ts`, `src/lib/booking/create-appointment.ts`
- Test: `src/lib/booking/active-appointments.test.ts` (nuevo), `src/lib/booking/slots.test.ts`, `src/lib/booking/anti-fraud.test.ts`, `src/lib/booking/create-appointment.test.ts`

**Interfaces:**
- Consumes: `PENDING_EXPIRY_MINUTES` (ya existente en `active-appointments.ts`); `Appointment.emailVerifiedAt` (Tarea 2).
- Produces:
  - `activeAppointmentWhere(now: Date): Prisma.AppointmentWhereInput` (firma sin cambios, comportamiento extendido) — consumida ya por `slots.ts`, `anti-fraud.ts`, `assignment.ts`.
  - `releaseExpiredPendingSlot(tx: Prisma.TransactionClient | PrismaClient, params: { employeeId: string; start: Date; now: Date }): Promise<void>` (nueva, extraída de dentro de `createAppointment`) — consumida por `create-appointment.ts` y testeada de forma independiente.

- [ ] **Step 1: Escribir el test directo de `releaseExpiredPendingSlot`**

Crea `src/lib/booking/active-appointments.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { releaseExpiredPendingSlot } from './active-appointments';

const NOW = new Date('2026-07-14T13:00:00.000Z');
const SLOT_START = new Date('2026-07-14T16:00:00.000Z');

async function createStalePending(overrides: { emailVerifiedAt?: Date } = {}) {
  const seed = await seedDemoBusiness(prisma);
  const customer = await prisma.customer.create({
    data: { businessId: seed.business.id, name: 'Cliente', phone: '+34611000200', email: 'stale@example.com' },
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
      start: SLOT_START,
      end: new Date(SLOT_START.getTime() + 35 * 60 * 1000),
      status: 'PENDING',
      createdAt: new Date(NOW.getTime() - 40 * 60 * 1000), // caducada por tiempo (> 30 min)
      emailVerifiedAt: overrides.emailVerifiedAt ?? null,
    },
  });
  return { seed, appointment };
}

describe('releaseExpiredPendingSlot', () => {
  it('cancela una PENDING caducada por tiempo sin emailVerifiedAt', async () => {
    const { appointment } = await createStalePending();

    await releaseExpiredPendingSlot(prisma, {
      employeeId: appointment.employeeId,
      start: appointment.start,
      now: NOW,
    });

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('CANCELLED');
  });

  it('NO cancela una PENDING caducada por tiempo si tiene emailVerifiedAt fijado', async () => {
    const { appointment } = await createStalePending({ emailVerifiedAt: new Date(NOW.getTime() - 35 * 60 * 1000) });

    await releaseExpiredPendingSlot(prisma, {
      employeeId: appointment.employeeId,
      start: appointment.start,
      now: NOW,
    });

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('PENDING');
  });

  it('no toca una PENDING que aún no ha caducado (createdAt reciente)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const customer = await prisma.customer.create({
      data: { businessId: seed.business.id, name: 'Cliente reciente', phone: '+34611000201', email: 'reciente@example.com' },
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
        start: SLOT_START,
        end: new Date(SLOT_START.getTime() + 35 * 60 * 1000),
        status: 'PENDING',
        createdAt: new Date(NOW.getTime() - 5 * 60 * 1000),
      },
    });

    await releaseExpiredPendingSlot(prisma, {
      employeeId: appointment.employeeId,
      start: appointment.start,
      now: NOW,
    });

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.status).toBe('PENDING');
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

```powershell
pnpm test active-appointments.test.ts
```

Expected: falla porque `releaseExpiredPendingSlot` no existe todavía (`does not provide an export named 'releaseExpiredPendingSlot'` o similar).

- [ ] **Step 3: Añadir el test de bloqueo indefinido en `slots.test.ts`**

Añade este `it` dentro del `describe('getAvailableSlots — huecos base', ...)` existente en `src/lib/booking/slots.test.ts`, justo después del test `'una PENDING con createdAt exactamente en el límite de 30 minutos no bloquea el hueco (frontera de caducidad)'` (antes del cierre `});` del `describe`):

```typescript
  it('una PENDING con emailVerifiedAt fijado sigue bloqueando el hueco aunque hayan pasado más de 30 minutos (manualApproval, esperando aprobación del negocio)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-14T13:00:00.000Z'); // 15:00 local

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente verificado',
        phone: '+34611000202',
        email: 'verificado-slots@example.com',
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
        start: new Date('2026-07-14T16:00:00.000Z'),
        end: new Date('2026-07-14T16:35:00.000Z'),
        status: 'PENDING',
        createdAt: new Date(now.getTime() - 40 * 60 * 1000), // caducada por tiempo
        emailVerifiedAt: new Date(now.getTime() - 35 * 60 * 1000), // pero ya verificada
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

    expect(slots.some((s) => s.start.toISOString() === '2026-07-14T16:00:00.000Z')).toBe(false);
  });
```

- [ ] **Step 4: Añadir el test de límite anti-fraude en `anti-fraud.test.ts`**

Añade este `it` dentro del `describe('checkActiveAppointmentLimit', ...)` existente en `src/lib/booking/anti-fraud.test.ts`, después del test `'bloquea la reserva si el cliente ya tiene 2 citas activas (por teléfono o por email)'`:

```typescript
  it('cuenta como activa una PENDING con emailVerifiedAt fijado aunque esté caducada por tiempo', async () => {
    const seed = await seedDemoBusiness(prisma);
    const now = new Date('2026-07-13T08:00:00.000Z');

    const customer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente límite verificado',
        phone: '+34633000010',
        email: 'limite-verificado@example.com',
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
          createdAt: new Date(now.getTime() - 40 * 60 * 1000), // caducada por tiempo
          emailVerifiedAt: new Date(now.getTime() - 35 * 60 * 1000), // pero ya verificada: sigue activa
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
```

- [ ] **Step 5: Añadir el test de integración en `create-appointment.test.ts`**

Añade este `it` dentro del `describe('createAppointment', ...)` existente en `src/lib/booking/create-appointment.test.ts`, después del test `'libera una PENDING caducada que ocupa el mismo hueco exacto y crea la nueva cita (sin falso SLOT_TAKEN)'`:

```typescript
  it('no permite reservar el mismo hueco de una PENDING con emailVerifiedAt fijado, y no la cancela aunque esté caducada por tiempo (bloqueo indefinido a la espera de aprobación del negocio)', async () => {
    const seed = await seedDemoBusiness(prisma);

    const staleCustomer = await prisma.customer.create({
      data: {
        businessId: seed.business.id,
        name: 'Cliente verificado',
        phone: '+34666000014',
        email: 'verificado-create@example.com',
      },
    });

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
        createdAt: new Date(NOW.getTime() - 40 * 60 * 1000), // caducada por tiempo
        emailVerifiedAt: new Date(NOW.getTime() - 35 * 60 * 1000), // pero ya verificada
      },
    });

    const result = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Otro cliente',
      customerPhone: '+34666000015',
      customerEmail: 'otro-verificado@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.12',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'EMPLOYEE_UNAVAILABLE' });

    const refreshedStale = await prisma.appointment.findUniqueOrThrow({ where: { id: staleAppointment.id } });
    expect(refreshedStale.status).toBe('PENDING');
  });
```

- [ ] **Step 6: Ejecutar los tres archivos y comprobar que los tests nuevos fallan**

```powershell
pnpm test slots.test.ts anti-fraud.test.ts create-appointment.test.ts
```

Expected: los tests nuevos de esta tarea fallan (el resto de tests de esos archivos sigue en verde); el motivo es que `activeAppointmentWhere` aún no considera `emailVerifiedAt`.

- [ ] **Step 7: Implementar `activeAppointmentWhere` extendido y extraer `releaseExpiredPendingSlot`**

Reemplaza el contenido completo de `src/lib/booking/active-appointments.ts`:

```typescript
import type { Prisma, PrismaClient } from '@prisma/client';

export const PENDING_EXPIRY_MINUTES = 30;

export function activeAppointmentWhere(now: Date): Prisma.AppointmentWhereInput {
  const pendingCutoff = new Date(now.getTime() - PENDING_EXPIRY_MINUTES * 60 * 1000);
  return {
    OR: [
      { status: 'CONFIRMED' },
      { status: 'PENDING', createdAt: { gt: pendingCutoff } },
      // Una PENDING con emailVerifiedAt fijado (el cliente ya confirmó el
      // email, pero el negocio tiene manualApproval activo y aún no ha
      // aprobado la cita) ya no caduca por tiempo: sigue bloqueando el
      // hueco indefinidamente hasta que el negocio decida (Fase 5).
      { status: 'PENDING', emailVerifiedAt: { not: null } },
    ],
  };
}

// Libera (cancela) las PENDING que ocupan un (employeeId, start) exacto y ya
// han caducado por tiempo. Se usa dentro de la transacción de
// createAppointment como red de seguridad ante el índice único parcial
// (employeeId, start) — ver el comentario en create-appointment.ts.
//
// Importante: excluye las PENDING con emailVerifiedAt fijado. Aunque hayan
// "caducado por tiempo" (createdAt antiguo), siguen bloqueando el hueco según
// activeAppointmentWhere de arriba (esperan aprobación del negocio, no
// caducidad), así que cancelarlas aquí sería un bug: liberaría un hueco que
// en realidad sigue ocupado.
export async function releaseExpiredPendingSlot(
  tx: Prisma.TransactionClient | PrismaClient,
  params: { employeeId: string; start: Date; now: Date }
): Promise<void> {
  const pendingCutoff = new Date(params.now.getTime() - PENDING_EXPIRY_MINUTES * 60 * 1000);
  await tx.appointment.updateMany({
    where: {
      employeeId: params.employeeId,
      start: params.start,
      status: 'PENDING',
      createdAt: { lte: pendingCutoff },
      emailVerifiedAt: null,
    },
    data: { status: 'CANCELLED' },
  });
}
```

- [ ] **Step 8: Usar `releaseExpiredPendingSlot` desde `createAppointment`**

En `src/lib/booking/create-appointment.ts`, cambia el import de `active-appointments`:

```typescript
import { PENDING_EXPIRY_MINUTES, releaseExpiredPendingSlot } from './active-appointments';
```

Y dentro de `prisma.$transaction(async (tx) => { ... })`, reemplaza el bloque manual de liberación (el `updateMany` inline con su comentario) por:

```typescript
      // Libera las PENDING caducadas (por tiempo, no verificadas) que ocupan
      // este mismo (employeeId, start): getAvailableSlots ya las ignora
      // (expiración perezosa), pero siguen cumpliendo el predicado del
      // índice único parcial WHERE status IN ('PENDING','CONFIRMED'), y sin
      // este paso el INSERT chocaría con el índice y devolvería un
      // SLOT_TAKEN falso.
      await releaseExpiredPendingSlot(tx, { employeeId, start: input.start, now });
```

Elimina la variable `pendingCutoff` que quedaba huérfana en ese bloque (ya no se usa directamente en `create-appointment.ts`, la calcula internamente `releaseExpiredPendingSlot`).

- [ ] **Step 9: Ejecutar los cuatro archivos y comprobar que todos los tests pasan**

```powershell
pnpm test active-appointments.test.ts slots.test.ts anti-fraud.test.ts create-appointment.test.ts
```

Expected: todos los tests (nuevos y preexistentes) en verde.

- [ ] **Step 10: Ejecutar toda la suite**

```powershell
pnpm test
```

Expected: 140 tests preexistentes + los nuevos de esta tarea, todos en verde.

- [ ] **Step 11: Commit**

```powershell
git add src/lib/booking/active-appointments.ts src/lib/booking/active-appointments.test.ts src/lib/booking/create-appointment.ts src/lib/booking/slots.test.ts src/lib/booking/anti-fraud.test.ts src/lib/booking/create-appointment.test.ts
git commit -m "fix(booking): una PENDING con emailVerifiedAt fijado ya no caduca ni se libera automáticamente"
```

---

### Tarea 4: Confirmación de doble paso (`confirmAppointment` + `manualApproval`)

**Modelo sugerido:** sonnet

**Files:**
- Modify: `src/lib/booking/tokens.ts`
- Test: `src/lib/booking/tokens.test.ts`

**Interfaces:**
- Consumes: `PENDING_EXPIRY_MINUTES` de `./active-appointments` (ya importado); `canTransition` de `./state` (ya importado).
- Produces:
  - `isPendingAppointmentExpired(appointment: Pick<Appointment, 'createdAt'>, now?: Date): boolean` (nueva, exportada) — consumida por la Tarea 9 (página `/confirmar/{token}`).
  - `ConfirmAppointmentResult = { ok: true; appointment: Appointment; pendingApproval: boolean } | { ok: false; reason: ConfirmAppointmentFailureReason }` (el caso `ok: true` gana el campo `pendingApproval`) — consumida por la Tarea 9.
  - `confirmAppointment(prisma: PrismaClient, token: string, now?: Date): Promise<ConfirmAppointmentResult>` (firma sin cambios).

- [ ] **Step 1: Escribir los tests de la nueva semántica**

En `src/lib/booking/tokens.test.ts`, añade (después del `import` existente, sin quitar nada) un segundo helper y sustituye el `describe('confirmAppointment', ...)` completo por esta versión ampliada:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from './create-appointment';
import { confirmAppointment, cancelAppointment, isPendingAppointmentExpired } from './tokens';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z');

async function createPendingAppointment(overrides: { createdAt?: Date; manualApproval?: boolean } = {}) {
  const seed = await seedDemoBusiness(prisma);
  if (overrides.manualApproval) {
    await prisma.business.update({ where: { id: seed.business.id }, data: { manualApproval: true } });
  }

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

describe('isPendingAppointmentExpired', () => {
  it('es false justo antes de los 30 minutos', () => {
    const createdAt = new Date('2026-07-14T10:00:00.000Z');
    const now = new Date(createdAt.getTime() + 29 * 60 * 1000);
    expect(isPendingAppointmentExpired({ createdAt }, now)).toBe(false);
  });

  it('es true en el instante exacto de los 30 minutos (frontera de caducidad)', () => {
    const createdAt = new Date('2026-07-14T10:00:00.000Z');
    const now = new Date(createdAt.getTime() + 30 * 60 * 1000);
    expect(isPendingAppointmentExpired({ createdAt }, now)).toBe(true);
  });

  it('es true bastante después de los 30 minutos', () => {
    const createdAt = new Date('2026-07-14T10:00:00.000Z');
    const now = new Date(createdAt.getTime() + 60 * 60 * 1000);
    expect(isPendingAppointmentExpired({ createdAt }, now)).toBe(true);
  });
});

describe('confirmAppointment', () => {
  it('sin manualApproval: confirma una cita PENDING dentro de los 30 minutos y la deja CONFIRMED', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW });
    const confirmAt = new Date(NOW.getTime() + 10 * 60 * 1000); // 10 min después

    const result = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('CONFIRMED');
      expect(result.appointment.emailVerifiedAt).not.toBeNull();
      expect(result.pendingApproval).toBe(false);
    }
  });

  it('con manualApproval: confirmar fija emailVerifiedAt pero la cita SIGUE PENDING (pendiente de aprobación del negocio)', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW, manualApproval: true });
    const confirmAt = new Date(NOW.getTime() + 10 * 60 * 1000);

    const result = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('PENDING');
      expect(result.appointment.emailVerifiedAt).not.toBeNull();
      expect(result.pendingApproval).toBe(true);
    }
  });

  it('con manualApproval: reconfirmar 40 minutos después (ya habría caducado) sigue siendo ok (idempotente, no reevalúa la caducidad)', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW, manualApproval: true });

    const first = await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(first.ok).toBe(true);

    const second = await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 40 * 60 * 1000));

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.appointment.status).toBe('PENDING');
      expect(second.pendingApproval).toBe(true);
    }
  });

  it('sin manualApproval: reconfirmar tras ya CONFIRMED (segundo click, aunque hayan pasado más de 30 min) sigue siendo ok (idempotente)', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW });

    const first = await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 5 * 60 * 1000));
    expect(first.ok).toBe(true);

    const second = await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 40 * 60 * 1000));

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.appointment.status).toBe('CONFIRMED');
      expect(second.pendingApproval).toBe(false);
    }
  });

  it('devuelve EXPIRED si han pasado más de 30 minutos desde la creación y nunca se verificó el email', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW });
    const confirmAt = new Date(NOW.getTime() + 31 * 60 * 1000); // 31 min después

    const result = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('devuelve EXPIRED en el instante exacto de los 30 minutos (frontera de caducidad)', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW });
    const confirmAt = new Date(NOW.getTime() + 30 * 60 * 1000); // exactamente 30 min después

    const result = await confirmAppointment(prisma, appointment.confirmToken, confirmAt);

    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('devuelve NOT_FOUND si el token no existe', async () => {
    const result = await confirmAppointment(prisma, 'token-inexistente', NOW);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('devuelve INVALID_STATE si la cita ya está en un estado terminal (nunca se llegó a verificar el email)', async () => {
    const appointment = await createPendingAppointment({ createdAt: NOW });
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: 'CANCELLED' } });

    const result = await confirmAppointment(prisma, appointment.confirmToken, new Date(NOW.getTime() + 5 * 60 * 1000));

    expect(result).toEqual({ ok: false, reason: 'INVALID_STATE' });
  });
});

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

- [ ] **Step 2: Ejecutar el archivo y comprobar que fallan los tests nuevos**

```powershell
pnpm test tokens.test.ts
```

Expected: los tests que esperan `result.pendingApproval` fallan (la propiedad no existe todavía) y los de `isPendingAppointmentExpired` fallan porque la función no está exportada; los tests preexistentes de `cancelAppointment` siguen en verde.

- [ ] **Step 3: Reescribir `confirmAppointment` con la semántica de doble paso**

Reemplaza el contenido completo de `src/lib/booking/tokens.ts`:

```typescript
import type { PrismaClient, Appointment } from '@prisma/client';
import { PENDING_EXPIRY_MINUTES } from './active-appointments';
import { canTransition } from './state';

export type ConfirmAppointmentFailureReason = 'NOT_FOUND' | 'EXPIRED' | 'INVALID_STATE';

export type ConfirmAppointmentResult =
  | { ok: true; appointment: Appointment; pendingApproval: boolean }
  | { ok: false; reason: ConfirmAppointmentFailureReason };

export function isPendingAppointmentExpired(
  appointment: Pick<Appointment, 'createdAt'>,
  now: Date = new Date()
): boolean {
  // Misma convención canónica que activeAppointmentWhere: en el instante
  // exacto de los 30 minutos, ya está caducada (comparación >=, no >).
  const expiresAt = new Date(appointment.createdAt.getTime() + PENDING_EXPIRY_MINUTES * 60 * 1000);
  return now >= expiresAt;
}

export async function confirmAppointment(
  prisma: PrismaClient,
  token: string,
  now: Date = new Date()
): Promise<ConfirmAppointmentResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { confirmToken: token },
    include: { business: true },
  });

  if (!appointment) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  // Idempotencia: si el email ya se verificó antes (con o sin
  // manualApproval), un segundo click en el mismo enlace no debe volver a
  // evaluar la caducidad ni fallar — ya cumplió su función la primera vez.
  // Esto sustituye el caso especial que antes vivía en la página
  // /confirmar/{token} (comparar status === 'CONFIRMED' tras un
  // INVALID_STATE): con manualApproval el status nunca cambia a CONFIRMED
  // en este paso, así que ese caso especial ya no serviría.
  if (appointment.emailVerifiedAt) {
    return { ok: true, appointment, pendingApproval: appointment.business.manualApproval };
  }

  // Único estado con transición válida hacia CONFIRMED: PENDING. Cualquier
  // otro estado terminal (CANCELLED, COMPLETED, NO_SHOW) cae aquí como
  // INVALID_STATE.
  if (!canTransition(appointment.status, 'CONFIRMED')) {
    return { ok: false, reason: 'INVALID_STATE' };
  }

  if (isPendingAppointmentExpired(appointment, now)) {
    return { ok: false, reason: 'EXPIRED' };
  }

  // Sin manualApproval: confirmar por token es suficiente, la cita pasa a
  // CONFIRMED. Con manualApproval: confirmar por token solo fija
  // emailVerifiedAt (verifica que el email es del cliente real); la cita
  // sigue PENDING hasta que el negocio la apruebe manualmente (Fase 5).
  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: appointment.business.manualApproval
      ? { emailVerifiedAt: now }
      : { status: 'CONFIRMED', emailVerifiedAt: now },
  });

  return { ok: true, appointment: updated, pendingApproval: appointment.business.manualApproval };
}

export type CancelAppointmentFailureReason = 'NOT_FOUND' | 'INVALID_STATE';

export type CancelAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: CancelAppointmentFailureReason };

export async function cancelAppointment(prisma: PrismaClient, token: string): Promise<CancelAppointmentResult> {
  const appointment = await prisma.appointment.findUnique({ where: { cancelToken: token } });

  if (!appointment) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  // Cancelar una cita ya CANCELLED es idempotente: CANCELLED -> CANCELLED no
  // es una transición válida en la máquina de estados, así que se
  // comprueba aparte antes de delegar en canTransition.
  if (appointment.status === 'CANCELLED') {
    return { ok: true, appointment };
  }

  if (!canTransition(appointment.status, 'CANCELLED')) {
    return { ok: false, reason: 'INVALID_STATE' };
  }

  const cancelled = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'CANCELLED' },
  });

  return { ok: true, appointment: cancelled };
}
```

- [ ] **Step 4: Ejecutar el archivo y comprobar que todos los tests pasan**

```powershell
pnpm test tokens.test.ts
```

Expected: todos los tests (nuevos y preexistentes) en verde.

- [ ] **Step 5: Ejecutar toda la suite (esta tarea cambia el contrato de `confirmAppointment`, consumido hoy por `/confirmar/{token}`)**

```powershell
pnpm test
```

Expected: la suite de Vitest pasa entera. **Nota:** `pnpm build`/`pnpm lint` fallarán hasta la Tarea 9 porque `src/app/(public)/confirmar/[token]/page.tsx` todavía desestructura `result.ok`/`result.reason` de `confirmAppointment` con el shape antiguo (sigue siendo válido, `pendingApproval` es un campo añadido, no rompe ese acceso) — no hay incompatibilidad de tipos real, así que no es necesario tocar la página en esta tarea. Compruébalo:

```powershell
pnpm lint
```

Expected: sin errores nuevos relacionados con `tokens.ts` o `confirmar/[token]/page.tsx`.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/booking/tokens.ts src/lib/booking/tokens.test.ts
git commit -m "feat(booking): confirmAppointment implementa el doble paso de manualApproval"
```

---

## Plantillas de email

### Tarea 5: Fundamentos de plantillas — `EmailLayout` y URLs absolutas

**Modelo sugerido:** haiku

**Files:**
- Create: `src/lib/email/urls.ts`, `src/lib/email/templates/EmailLayout.tsx`
- Test: `src/lib/email/urls.test.ts`, `src/lib/email/templates/EmailLayout.test.tsx`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nada de código existente.
- Produces:
  - `getAppBaseUrl(): string`
  - `buildConfirmUrl(token: string): string`
  - `buildCancelUrl(token: string): string`
  - `EmailLayout(props: EmailLayoutProps): ReactElement` donde `EmailLayoutProps = { previewText: string; businessName: string; accentColor: string; logoUrl?: string | null; children: ReactNode }`

  Consumidos por las Tareas 6, 7, 10 y 11.

- [ ] **Step 1: Documentar `APP_BASE_URL` en `.env.example`**

Añade al final de `.env.example` (después de las variables de Resend de la Tarea 1):

```
# URL pública base de la app, usada para construir enlaces absolutos en los
# emails (confirmar/cancelar). En Vercel, usa la URL de producción del
# dominio propio cuando exista.
APP_BASE_URL="http://localhost:3000"
```

- [ ] **Step 2: Escribir el test de `urls.ts`**

Crea `src/lib/email/urls.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { getAppBaseUrl, buildConfirmUrl, buildCancelUrl } from './urls';

describe('urls de email', () => {
  const originalBaseUrl = process.env.APP_BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = originalBaseUrl;
    }
  });

  it('usa http://localhost:3000 por defecto si APP_BASE_URL no está definida', () => {
    delete process.env.APP_BASE_URL;
    expect(getAppBaseUrl()).toBe('http://localhost:3000');
  });

  it('usa APP_BASE_URL cuando está definida', () => {
    process.env.APP_BASE_URL = 'https://salonaura.example';
    expect(getAppBaseUrl()).toBe('https://salonaura.example');
  });

  it('construye una URL absoluta de confirmación con el token', () => {
    process.env.APP_BASE_URL = 'https://salonaura.example';
    expect(buildConfirmUrl('abc123')).toBe('https://salonaura.example/confirmar/abc123');
  });

  it('construye una URL absoluta de cancelación con el token', () => {
    process.env.APP_BASE_URL = 'https://salonaura.example';
    expect(buildCancelUrl('abc123')).toBe('https://salonaura.example/cita/abc123');
  });
});
```

- [ ] **Step 3: Ejecutar el test y comprobar que falla**

```powershell
pnpm test urls.test.ts
```

Expected: falla con `Cannot find module './urls'`.

- [ ] **Step 4: Implementar `urls.ts`**

Crea `src/lib/email/urls.ts`:

```typescript
export function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

export function buildConfirmUrl(token: string): string {
  return `${getAppBaseUrl()}/confirmar/${token}`;
}

export function buildCancelUrl(token: string): string {
  return `${getAppBaseUrl()}/cita/${token}`;
}
```

- [ ] **Step 5: Ejecutar el test y comprobar que pasa**

```powershell
pnpm test urls.test.ts
```

Expected: `4 passed`.

- [ ] **Step 6: Escribir el test de `EmailLayout`**

Crea `src/lib/email/templates/EmailLayout.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

describe('EmailLayout', () => {
  it('incluye el nombre del negocio como texto cuando no hay logo', async () => {
    const html = await render(
      <EmailLayout previewText="Vista previa" businessName="Salón Aura" accentColor="#B25539" logoUrl={null}>
        <Text>Contenido</Text>
      </EmailLayout>
    );

    expect(html).toContain('Salón Aura');
    expect(html).toContain('Contenido');
  });

  it('renderiza sin lanzar cuando se indica un logoUrl', async () => {
    const html = await render(
      <EmailLayout
        previewText="Vista previa"
        businessName="Salón Aura"
        accentColor="#B25539"
        logoUrl="https://example.com/logo.png"
      >
        <Text>Contenido</Text>
      </EmailLayout>
    );

    expect(html).toContain('Contenido');
  });
});
```

- [ ] **Step 7: Ejecutar el test y comprobar que falla**

```powershell
pnpm test EmailLayout.test.tsx
```

Expected: falla con `Cannot find module './EmailLayout'`.

- [ ] **Step 8: Implementar `EmailLayout`**

Crea `src/lib/email/templates/EmailLayout.tsx`:

```typescript
import type { ReactNode } from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Img } from '@react-email/components';

export interface EmailLayoutProps {
  previewText: string;
  businessName: string;
  accentColor: string;
  logoUrl?: string | null;
  children: ReactNode;
}

export function EmailLayout({ previewText, businessName, accentColor, logoUrl, children }: EmailLayoutProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{
          backgroundColor: '#f4f4f5',
          fontFamily: "Georgia, 'Times New Roman', serif",
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container style={{ backgroundColor: '#ffffff', borderRadius: 8, padding: 32, maxWidth: 480 }}>
          <Section style={{ textAlign: 'center', marginBottom: 24 }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={businessName} width={120} style={{ margin: '0 auto' }} />
            ) : (
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: accentColor, margin: 0 }}>{businessName}</Text>
            )}
          </Section>
          {children}
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 9: Ejecutar el test y comprobar que pasa**

```powershell
pnpm test EmailLayout.test.tsx
```

Expected: `2 passed`.

- [ ] **Step 10: Commit**

```powershell
git add .env.example src/lib/email/urls.ts src/lib/email/urls.test.ts src/lib/email/templates/EmailLayout.tsx src/lib/email/templates/EmailLayout.test.tsx
git commit -m "feat(email): layout compartido y helpers de URLs absolutas para las plantillas"
```

---

### Tarea 6: Plantillas y envíos al cliente en la reserva (confirmación / solicitud pendiente)

**Modelo sugerido:** haiku

**Files:**
- Create: `src/lib/email/templates/BookingConfirmationEmail.tsx`, `src/lib/email/templates/BookingPendingApprovalEmail.tsx`, `src/lib/email/appointment-notifications.tsx`
- Test: `src/lib/email/appointment-notifications.test.ts`

**Interfaces:**
- Consumes: `EmailLayout` (Tarea 5); `buildConfirmUrl` (Tarea 5); `formatAppointmentDateTime` de `@/lib/public/format-datetime` (ya existente); `EmailSender`, `EmailMessage` (Tarea 1); `FakeEmailSender` de `@/test/fake-email-sender` (Tarea 1).
- Produces (definidos en `appointment-notifications.tsx`, tipos estables reutilizados por las Tareas 7, 10 y 11):
  - `AppointmentEmailAppointment = { id: string; customerName: string; customerEmail: string; customerPhone: string; confirmToken: string; cancelToken: string; start: Date }`
  - `AppointmentEmailService = { name: string }`
  - `AppointmentEmailEmployee = { name: string }`
  - `AppointmentEmailBusiness = { name: string; email: string | null; accentColor: string; logoUrl: string | null }`
  - `AppointmentEmailContext = { appointment: AppointmentEmailAppointment; service: AppointmentEmailService; employee: AppointmentEmailEmployee; business: AppointmentEmailBusiness }`
  - `sendBookingConfirmationEmail(emailSender: EmailSender, ctx: AppointmentEmailContext): Promise<{ ok: boolean }>`
  - `sendBookingPendingApprovalEmail(emailSender: EmailSender, ctx: AppointmentEmailContext): Promise<{ ok: boolean }>`

  Consumidas por la Tarea 8 (integración en `booking-service.ts`). Las Tareas 7, 10 y 11 añaden más funciones a este mismo archivo reutilizando `AppointmentEmailContext` tal cual (no cambia de forma).

- [ ] **Step 1: Escribir los tests de los dos envíos de esta tarea**

Crea `src/lib/email/appointment-notifications.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { FakeEmailSender } from '../../test/fake-email-sender';
import {
  sendBookingConfirmationEmail,
  sendBookingPendingApprovalEmail,
  type AppointmentEmailContext,
} from './appointment-notifications';

const BASE_CTX: AppointmentEmailContext = {
  appointment: {
    id: 'appt-1',
    customerName: 'Ana López',
    customerEmail: 'ana@example.com',
    customerPhone: '+34600111222',
    confirmToken: 'confirm-token-123',
    cancelToken: 'cancel-token-456',
    start: new Date('2026-07-14T08:00:00.000Z'),
  },
  service: { name: 'Corte de mujer' },
  employee: { name: 'Marta Ruiz' },
  business: { name: 'Salón Aura', email: 'hola@salonaura.example', accentColor: '#B25539', logoUrl: null },
};

describe('sendBookingConfirmationEmail', () => {
  it('envía al email del cliente con el enlace de confirmación y los datos de la cita', async () => {
    const sender = new FakeEmailSender();

    const result = await sendBookingConfirmationEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('ana@example.com');
    expect(sender.sent[0].subject).toContain('Salón Aura');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('Ana López');
    expect(text).toContain('Corte de mujer');
    expect(text).toContain('Marta Ruiz');
    expect(text).toContain('http://localhost:3000/confirmar/confirm-token-123');
  });

  it('devuelve ok:false y no lanza si el envío falla', async () => {
    const failingSender = { send: async () => { throw new Error('fallo de red'); } };

    const result = await sendBookingConfirmationEmail(failingSender, BASE_CTX);

    expect(result.ok).toBe(false);
  });
});

describe('sendBookingPendingApprovalEmail', () => {
  it('envía al cliente explicando el doble paso (verificar email + aprobación del negocio)', async () => {
    const sender = new FakeEmailSender();

    const result = await sendBookingPendingApprovalEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('ana@example.com');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('http://localhost:3000/confirmar/confirm-token-123');
    expect(text.toLowerCase()).toContain('aprob');
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

```powershell
pnpm test appointment-notifications.test.ts
```

Expected: falla con `Cannot find module './appointment-notifications'`.

- [ ] **Step 3: Implementar `BookingConfirmationEmail`**

Crea `src/lib/email/templates/BookingConfirmationEmail.tsx`:

```typescript
import { Heading, Text, Button, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface BookingConfirmationEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
  confirmUrl: string;
}

export function BookingConfirmationEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  employeeName,
  startLabel,
  confirmUrl,
}: BookingConfirmationEmailProps) {
  return (
    <EmailLayout
      previewText={`Confirma tu cita en ${businessName}`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Confirma tu cita</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        Hemos recibido tu solicitud de cita para <strong>{serviceName}</strong> con {employeeName} en {businessName},
        el {startLabel}.
      </Text>
      <Text>Confirma tu email para asegurar tu hueco. Tienes 30 minutos desde la reserva antes de que se libere.</Text>
      <Button
        href={confirmUrl}
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
        Confirmar cita
      </Button>
      <Hr />
      <Text style={{ fontSize: 12, color: '#6b7280' }}>Si no has solicitado esta cita, puedes ignorar este email.</Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Implementar `BookingPendingApprovalEmail`**

Crea `src/lib/email/templates/BookingPendingApprovalEmail.tsx`:

```typescript
import { Heading, Text, Button, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface BookingPendingApprovalEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
  confirmUrl: string;
}

export function BookingPendingApprovalEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  employeeName,
  startLabel,
  confirmUrl,
}: BookingPendingApprovalEmailProps) {
  return (
    <EmailLayout
      previewText={`Confirma tu email — tu solicitud en ${businessName} está pendiente de aprobación`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Confirma tu email</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        Hemos recibido tu solicitud de cita para <strong>{serviceName}</strong> con {employeeName} en {businessName},
        el {startLabel}.
      </Text>
      <Text>
        Este negocio revisa manualmente cada solicitud. Primero confirma tu email con el botón de abajo (tienes 30
        minutos); después, el negocio deberá aprobar tu cita. Te avisaremos por email en cuanto lo haga.
      </Text>
      <Button
        href={confirmUrl}
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
        Confirmar email
      </Button>
      <Hr />
      <Text style={{ fontSize: 12, color: '#6b7280' }}>Si no has solicitado esta cita, puedes ignorar este email.</Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 5: Implementar `appointment-notifications.tsx`**

Crea `src/lib/email/appointment-notifications.tsx`:

```typescript
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import type { EmailMessage, EmailSender } from './types';
import { buildConfirmUrl } from './urls';
import { BookingConfirmationEmail } from './templates/BookingConfirmationEmail';
import { BookingPendingApprovalEmail } from './templates/BookingPendingApprovalEmail';

export interface AppointmentEmailAppointment {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  confirmToken: string;
  cancelToken: string;
  start: Date;
}

export interface AppointmentEmailService {
  name: string;
}

export interface AppointmentEmailEmployee {
  name: string;
}

export interface AppointmentEmailBusiness {
  name: string;
  email: string | null;
  accentColor: string;
  logoUrl: string | null;
}

export interface AppointmentEmailContext {
  appointment: AppointmentEmailAppointment;
  service: AppointmentEmailService;
  employee: AppointmentEmailEmployee;
  business: AppointmentEmailBusiness;
}

// Envuelve emailSender.send en un try/catch común: ninguna función
// sendXEmail de este archivo lanza nunca. Un fallo de envío se registra en
// consola y se refleja como { ok: false }, pero no rompe el flujo que la
// invoca (reserva o cancelación ya han tenido éxito antes de llegar aquí).
async function trySend(emailSender: EmailSender, message: EmailMessage): Promise<{ ok: boolean }> {
  try {
    await emailSender.send(message);
    return { ok: true };
  } catch (error) {
    console.error('[email] fallo al enviar', { to: message.to, subject: message.subject, error });
    return { ok: false };
  }
}

export async function sendBookingConfirmationEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  const message: EmailMessage = {
    to: ctx.appointment.customerEmail,
    subject: `Confirma tu cita en ${ctx.business.name}`,
    react: (
      <BookingConfirmationEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
        confirmUrl={buildConfirmUrl(ctx.appointment.confirmToken)}
      />
    ),
  };

  return trySend(emailSender, message);
}

export async function sendBookingPendingApprovalEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  const message: EmailMessage = {
    to: ctx.appointment.customerEmail,
    subject: `Confirma tu email — tu solicitud en ${ctx.business.name} está pendiente de aprobación`,
    react: (
      <BookingPendingApprovalEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
        confirmUrl={buildConfirmUrl(ctx.appointment.confirmToken)}
      />
    ),
  };

  return trySend(emailSender, message);
}
```

- [ ] **Step 6: Ejecutar el test y comprobar que pasa**

```powershell
pnpm test appointment-notifications.test.ts
```

Expected: `3 passed`.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/email/templates/BookingConfirmationEmail.tsx src/lib/email/templates/BookingPendingApprovalEmail.tsx src/lib/email/appointment-notifications.tsx src/lib/email/appointment-notifications.test.ts
git commit -m "feat(email): plantillas y envío de confirmación de reserva al cliente"
```

---

### Tarea 7: Plantilla y envío al negocio — nueva solicitud pendiente de aprobación

**Modelo sugerido:** haiku

**Files:**
- Create: `src/lib/email/templates/NewPendingRequestEmail.tsx`
- Modify: `src/lib/email/appointment-notifications.tsx`, `src/lib/email/appointment-notifications.test.ts`

**Interfaces:**
- Consumes: `EmailLayout` (Tarea 5); `AppointmentEmailContext` (Tarea 6, sin cambios de forma).
- Produces: `sendNewPendingRequestEmail(emailSender: EmailSender, ctx: AppointmentEmailContext): Promise<{ ok: boolean }>` — consumida por la Tarea 8.

- [ ] **Step 1: Añadir el test de `sendNewPendingRequestEmail`**

Añade en `src/lib/email/appointment-notifications.test.ts`, dentro del import existente de `'./appointment-notifications'`, la nueva función:

```typescript
import {
  sendBookingConfirmationEmail,
  sendBookingPendingApprovalEmail,
  sendNewPendingRequestEmail,
  type AppointmentEmailContext,
} from './appointment-notifications';
```

Y añade este `describe` al final del archivo:

```typescript
describe('sendNewPendingRequestEmail', () => {
  it('envía al email del negocio con los datos del cliente y de la cita', async () => {
    const sender = new FakeEmailSender();

    const result = await sendNewPendingRequestEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('hola@salonaura.example');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('Ana López');
    expect(text).toContain('+34600111222');
    expect(text).toContain('ana@example.com');
    expect(text).toContain('Corte de mujer');
  });

  it('devuelve ok:false sin lanzar si el negocio no tiene email configurado', async () => {
    const sender = new FakeEmailSender();
    const ctxSinEmail: AppointmentEmailContext = {
      ...BASE_CTX,
      business: { ...BASE_CTX.business, email: null },
    };

    const result = await sendNewPendingRequestEmail(sender, ctxSinEmail);

    expect(result.ok).toBe(false);
    expect(sender.sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

```powershell
pnpm test appointment-notifications.test.ts
```

Expected: falla porque `sendNewPendingRequestEmail` no está exportada todavía.

- [ ] **Step 3: Implementar `NewPendingRequestEmail`**

Crea `src/lib/email/templates/NewPendingRequestEmail.tsx`:

```typescript
import { Heading, Text, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface NewPendingRequestEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
}

export function NewPendingRequestEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  customerPhone,
  customerEmail,
  serviceName,
  employeeName,
  startLabel,
}: NewPendingRequestEmailProps) {
  return (
    <EmailLayout
      previewText="Nueva solicitud de cita pendiente de aprobación"
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Nueva solicitud de cita</Heading>
      <Text>Tenéis una nueva solicitud pendiente de aprobación:</Text>
      <Text>
        <strong>Servicio:</strong> {serviceName}
        <br />
        <strong>Profesional:</strong> {employeeName}
        <br />
        <strong>Fecha:</strong> {startLabel}
      </Text>
      <Hr />
      <Text>
        <strong>Cliente:</strong> {customerName}
        <br />
        <strong>Teléfono:</strong> {customerPhone}
        <br />
        <strong>Email:</strong> {customerEmail}
      </Text>
      <Text style={{ fontSize: 12, color: '#6b7280' }}>
        El cliente debe confirmar su email antes de que la solicitud pueda aprobarse.
      </Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Añadir `sendNewPendingRequestEmail` a `appointment-notifications.tsx`**

Actualiza los imports al principio de `src/lib/email/appointment-notifications.tsx`:

```typescript
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import type { EmailMessage, EmailSender } from './types';
import { buildConfirmUrl } from './urls';
import { BookingConfirmationEmail } from './templates/BookingConfirmationEmail';
import { BookingPendingApprovalEmail } from './templates/BookingPendingApprovalEmail';
import { NewPendingRequestEmail } from './templates/NewPendingRequestEmail';
```

Y añade al final del archivo (después de `sendBookingPendingApprovalEmail`):

```typescript
export async function sendNewPendingRequestEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  if (!ctx.business.email) {
    console.warn('[email] el negocio no tiene email configurado, no se envía aviso de nueva solicitud', {
      businessName: ctx.business.name,
    });
    return { ok: false };
  }

  const message: EmailMessage = {
    to: ctx.business.email,
    subject: 'Nueva solicitud de cita pendiente de aprobación',
    react: (
      <NewPendingRequestEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        customerPhone={ctx.appointment.customerPhone}
        customerEmail={ctx.appointment.customerEmail}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
      />
    ),
  };

  return trySend(emailSender, message);
}
```

- [ ] **Step 5: Ejecutar el test y comprobar que pasa**

```powershell
pnpm test appointment-notifications.test.ts
```

Expected: `5 passed`.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/email/templates/NewPendingRequestEmail.tsx src/lib/email/appointment-notifications.tsx src/lib/email/appointment-notifications.test.ts
git commit -m "feat(email): plantilla y envío al negocio de nueva solicitud pendiente"
```

---

## Integración en los flujos públicos

### Tarea 8: Integrar los envíos de email en la reserva

**Modelo sugerido:** sonnet

**Files:**
- Modify: `src/lib/public/booking-service.ts`, `src/lib/public/booking-service.test.ts`, `src/app/(public)/[slug]/components/booking-sheet/StepSuccess.tsx`

**Interfaces:**
- Consumes: `sendBookingConfirmationEmail`, `sendBookingPendingApprovalEmail`, `sendNewPendingRequestEmail` de `@/lib/email/appointment-notifications` (Tareas 6-7); `getEmailSender` de `@/lib/email/get-email-sender` (Tarea 1); `EmailSender` de `@/lib/email/types` (Tarea 1); `FakeEmailSender` de `@/test/fake-email-sender` (Tarea 1).
- Produces: `BookAppointmentBySlugInput` gana el campo opcional `emailSender?: EmailSender` (el resto de la firma no cambia) — no rompe al llamador actual (`src/app/(public)/[slug]/actions.ts`, que no pasa ese campo y usa el valor por defecto).

- [ ] **Step 1: Añadir los tests de envío de email a `booking-service.test.ts`**

En `src/lib/public/booking-service.test.ts`, añade el import de `FakeEmailSender` junto a los existentes:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { bookAppointmentBySlug } from './booking-service';
import { INVALID_INPUT_MESSAGE } from './error-messages';
import { FakeEmailSender } from '../../test/fake-email-sender';
```

Y añade estos `it` dentro del `describe('bookAppointmentBySlug', ...)` existente, justo después del test `'marca pendingApproval en true si el negocio tiene manualApproval activado'`:

```typescript
  it('envía el email de confirmación al cliente cuando la reserva no requiere aprobación manual', async () => {
    const seed = await seedDemoBusiness(prisma);
    const emailSender = new FakeEmailSender();

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente email',
      customerPhone: '+34699000020',
      customerEmail: 'email-confirmacion@example.com',
      ipAddress: '198.51.100.70',
      now: NOW,
      emailSender,
    });

    expect(result.ok).toBe(true);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('email-confirmacion@example.com');
    expect(emailSender.sent[0].subject).toContain('Salón Aura');
  });

  it('envía la solicitud pendiente al cliente y el aviso al negocio cuando manualApproval está activo', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.business.update({ where: { id: seed.business.id }, data: { manualApproval: true } });
    const emailSender = new FakeEmailSender();

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente aprobación email',
      customerPhone: '+34699000021',
      customerEmail: 'email-aprobacion@example.com',
      ipAddress: '198.51.100.71',
      now: NOW,
      emailSender,
    });

    expect(result.ok).toBe(true);
    expect(emailSender.sent).toHaveLength(2);
    expect(emailSender.sent.map((m) => m.to).sort()).toEqual(
      ['email-aprobacion@example.com', 'hola@salonaura.example'].sort()
    );
  });

  it('no envía ningún email si la reserva falla', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.blacklistEntry.create({
      data: { businessId: seed.business.id, email: 'vetado-email@example.com', reason: 'No presentado' },
    });
    const emailSender = new FakeEmailSender();

    await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Vetado email',
      customerPhone: '+34699000022',
      customerEmail: 'vetado-email@example.com',
      ipAddress: '198.51.100.72',
      now: NOW,
      emailSender,
    });

    expect(emailSender.sent).toHaveLength(0);
  });

  it('la reserva sigue teniendo éxito aunque el envío de email falle', async () => {
    const seed = await seedDemoBusiness(prisma);
    const failingSender = { send: async () => { throw new Error('fallo de red simulado'); } };

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente resiliente',
      customerPhone: '+34699000023',
      customerEmail: 'resiliente@example.com',
      ipAddress: '198.51.100.73',
      now: NOW,
      emailSender: failingSender,
    });

    expect(result.ok).toBe(true);
  });
```

- [ ] **Step 2: Ejecutar el archivo y comprobar que fallan los tests nuevos**

```powershell
pnpm test booking-service.test.ts
```

Expected: los 4 tests nuevos fallan (`emailSender` no es un campo reconocido / no se envía nada todavía); los tests preexistentes de `booking-service.test.ts` siguen en verde.

- [ ] **Step 3: Integrar los envíos en `bookAppointmentBySlug`**

Reemplaza el contenido completo de `src/lib/public/booking-service.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { createAppointment } from '@/lib/booking/create-appointment';
import { getLocalDateString } from '@/lib/booking/timezone';
import { getBookingErrorMessage, INVALID_INPUT_MESSAGE } from './error-messages';
import { getAvailableSlotsForBusiness } from './slots-service';
import { validateBookingInput } from './validate-booking-input';
import { getEmailSender } from '@/lib/email/get-email-sender';
import type { EmailSender } from '@/lib/email/types';
import {
  sendBookingConfirmationEmail,
  sendBookingPendingApprovalEmail,
  sendNewPendingRequestEmail,
} from '@/lib/email/appointment-notifications';

export interface BookAppointmentBySlugInput {
  slug: string;
  serviceId: string;
  employeeId?: string;
  start: Date;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  ipAddress: string;
  now?: Date;
  emailSender?: EmailSender;
}

export type BookAppointmentBySlugResult =
  | { ok: true; confirmToken: string; cancelToken: string; pendingApproval: boolean }
  | { ok: false; message: string; alternativeSlots: Date[] };

export async function bookAppointmentBySlug(
  prisma: PrismaClient,
  input: BookAppointmentBySlugInput
): Promise<BookAppointmentBySlugResult> {
  const now = input.now ?? new Date();
  const emailSender = input.emailSender ?? getEmailSender();

  const validation = validateBookingInput({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    start: input.start,
  });
  if (!validation.ok) {
    return { ok: false, message: INVALID_INPUT_MESSAGE, alternativeSlots: [] };
  }

  const business = await prisma.business.findUnique({ where: { slug: input.slug } });

  if (!business || !business.active) {
    return { ok: false, message: getBookingErrorMessage('BUSINESS_NOT_FOUND'), alternativeSlots: [] };
  }

  const result = await createAppointment(prisma, {
    businessId: business.id,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    start: input.start,
    customerName: validation.value.customerName,
    customerPhone: validation.value.customerPhone,
    customerEmail: validation.value.customerEmail,
    source: 'WEB',
    ipAddress: input.ipAddress,
    now,
  });

  if (result.ok) {
    // Los envíos ocurren después de que la reserva ya ha tenido éxito: un
    // fallo de envío (capturado dentro de cada sendXEmail) nunca hace
    // fallar la reserva.
    const withRelations = await prisma.appointment.findUnique({
      where: { id: result.appointment.id },
      include: { service: true, employee: true },
    });

    if (withRelations) {
      const ctx = {
        appointment: withRelations,
        service: withRelations.service,
        employee: withRelations.employee,
        business,
      };

      if (business.manualApproval) {
        await sendBookingPendingApprovalEmail(emailSender, ctx);
        await sendNewPendingRequestEmail(emailSender, ctx);
      } else {
        await sendBookingConfirmationEmail(emailSender, ctx);
      }
    }

    return {
      ok: true,
      confirmToken: result.appointment.confirmToken,
      cancelToken: result.appointment.cancelToken,
      pendingApproval: business.manualApproval,
    };
  }

  const message = getBookingErrorMessage(result.reason);
  let alternativeSlots: Date[] = [];

  if (result.reason === 'SLOT_TAKEN') {
    const localDate = getLocalDateString(input.start);
    const slots = await getAvailableSlotsForBusiness(prisma, {
      slug: input.slug,
      serviceId: input.serviceId,
      employeeId: input.employeeId,
      dateFrom: localDate,
      dateTo: localDate,
      now,
    });
    alternativeSlots = slots.slice(0, 5).map((s) => s.start);
  }

  return { ok: false, message, alternativeSlots };
}
```

- [ ] **Step 4: Ejecutar el archivo y comprobar que todos los tests pasan**

```powershell
pnpm test booking-service.test.ts
```

Expected: todos los tests (nuevos y preexistentes) en verde.

- [ ] **Step 5: Actualizar el copy de la pantalla de éxito con `manualApproval` (ahora sí se envía un email de verificación)**

En `src/app/(public)/[slug]/components/booking-sheet/StepSuccess.tsx`, reemplaza el texto del caso `pendingApproval`:

```typescript
'use client';

export interface StepSuccessProps {
  pendingApproval: boolean;
  onClose: () => void;
}

export function StepSuccess({ pendingApproval, onClose }: StepSuccessProps) {
  return (
    <div className="py-6 text-center">
      <p className="mb-2 font-[family-name:var(--font-heading)] text-xl font-semibold text-[var(--color-text)]">
        {pendingApproval ? 'Solicitud enviada' : '¡Reserva realizada!'}
      </p>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        {pendingApproval
          ? 'Te hemos enviado un email para confirmar tu dirección. Una vez la confirmes, el negocio revisará tu solicitud y te avisaremos por email en cuanto la apruebe.'
          : 'Te hemos enviado un email para confirmar tu cita. Tienes 30 minutos para confirmarla o el hueco se liberará.'}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-[var(--radius-theme)] bg-[var(--color-accent)] px-6 py-3 font-semibold text-[var(--color-accent-contrast)]"
      >
        Entendido
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Ejecutar toda la suite**

```powershell
pnpm test
```

Expected: todos los tests en verde.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/public/booking-service.ts src/lib/public/booking-service.test.ts "src/app/(public)/[slug]/components/booking-sheet/StepSuccess.tsx"
git commit -m "feat(public): envía emails de confirmación/solicitud tras reservar; el copy de éxito ya es cierto"
```

---

### Tarea 9: Confirmar-en-GET se elimina — botón explícito en `/confirmar/{token}`

**Modelo sugerido:** sonnet

**Files:**
- Modify: `src/lib/public/appointment-lookup.ts`, `src/lib/public/appointment-lookup.test.ts`, `src/app/(public)/confirmar/[token]/page.tsx`, `e2e/booking-flow.spec.ts`
- Create: `src/app/(public)/confirmar/[token]/actions.ts`

**Interfaces:**
- Consumes: `confirmAppointment`, `isPendingAppointmentExpired` de `@/lib/booking/tokens` (Tarea 4).
- Produces: `PublicAppointmentSummary` gana los campos `createdAt: Date` y `emailVerifiedAt: Date | null` (el resto no cambia) — usados solo dentro de esta página; `confirmAppointmentAction(token: string): Promise<void>` (Server Action, mismo patrón que `cancelAppointmentAction` de `src/app/(public)/cita/[token]/actions.ts`).

- [ ] **Step 1: Añadir los campos nuevos a los tests de `appointment-lookup.ts`**

Añade este `it` dentro del `describe('getAppointmentByConfirmToken', ...)` existente en `src/lib/public/appointment-lookup.test.ts`, después del test `'devuelve el resumen de la cita cuando el token existe'`:

```typescript
  it('incluye createdAt y emailVerifiedAt (null si aún no se ha confirmado)', async () => {
    const { appointment } = await createTestAppointment();

    const summary = await getAppointmentByConfirmToken(prisma, appointment.confirmToken);

    expect(summary?.createdAt).toBeInstanceOf(Date);
    expect(summary?.emailVerifiedAt).toBeNull();
  });
```

- [ ] **Step 2: Ejecutar el archivo y comprobar que falla**

```powershell
pnpm test appointment-lookup.test.ts
```

Expected: falla porque `summary?.createdAt`/`summary?.emailVerifiedAt` no existen en el tipo/objeto devuelto todavía.

- [ ] **Step 3: Extender `PublicAppointmentSummary`**

Reemplaza el contenido completo de `src/lib/public/appointment-lookup.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';

export interface PublicAppointmentSummary {
  id: string;
  status: string;
  start: Date;
  end: Date;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  businessName: string;
  businessSlug: string;
  cancelToken: string;
  confirmToken: string;
}

interface RawAppointment {
  id: string;
  status: string;
  start: Date;
  end: Date;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  customerName: string;
  cancelToken: string;
  confirmToken: string;
  service: { name: string };
  employee: { name: string };
  business: { name: string; slug: string };
}

function toSummary(appointment: RawAppointment): PublicAppointmentSummary {
  return {
    id: appointment.id,
    status: appointment.status,
    start: appointment.start,
    end: appointment.end,
    createdAt: appointment.createdAt,
    emailVerifiedAt: appointment.emailVerifiedAt,
    customerName: appointment.customerName,
    serviceName: appointment.service.name,
    employeeName: appointment.employee.name,
    businessName: appointment.business.name,
    businessSlug: appointment.business.slug,
    cancelToken: appointment.cancelToken,
    confirmToken: appointment.confirmToken,
  };
}

export async function getAppointmentByConfirmToken(
  prisma: PrismaClient,
  token: string
): Promise<PublicAppointmentSummary | null> {
  const appointment = await prisma.appointment.findUnique({
    where: { confirmToken: token },
    include: { service: true, employee: true, business: true },
  });
  return appointment ? toSummary(appointment) : null;
}

export async function getAppointmentByCancelToken(
  prisma: PrismaClient,
  token: string
): Promise<PublicAppointmentSummary | null> {
  const appointment = await prisma.appointment.findUnique({
    where: { cancelToken: token },
    include: { service: true, employee: true, business: true },
  });
  return appointment ? toSummary(appointment) : null;
}
```

Nota: no hace falta cambiar la consulta Prisma (`include` ya trae todas las columnas escalares de `Appointment` por defecto, incluidas `createdAt` y `emailVerifiedAt`); solo cambian los tipos TypeScript y el mapeo de `toSummary`.

- [ ] **Step 4: Ejecutar el archivo y comprobar que pasa**

```powershell
pnpm test appointment-lookup.test.ts
```

Expected: todos los tests (nuevo y preexistentes) en verde.

- [ ] **Step 5: Crear la Server Action de confirmación**

Crea `src/app/(public)/confirmar/[token]/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { confirmAppointment } from '@/lib/booking/tokens';

export async function confirmAppointmentAction(token: string): Promise<void> {
  await confirmAppointment(prisma, token);
  revalidatePath(`/confirmar/${token}`);
}
```

- [ ] **Step 6: Reescribir la página `/confirmar/{token}` como resumen + botón**

Reemplaza el contenido completo de `src/app/(public)/confirmar/[token]/page.tsx`:

```typescript
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { isPendingAppointmentExpired } from '@/lib/booking/tokens';
import { getAppointmentByConfirmToken, type PublicAppointmentSummary } from '@/lib/public/appointment-lookup';
import { getPublicBusinessBySlug, type PublicBusiness } from '@/lib/public/business-lookup';
import { getThemeCssVariables } from '@/lib/theme/theme';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import { generateAppointmentIcs } from '@/lib/public/ics';
import { confirmAppointmentAction } from './actions';

function ThemedScreen({
  business,
  title,
  children,
}: {
  business: PublicBusiness;
  title: string;
  children?: ReactNode;
}) {
  const theme = getThemeCssVariables(business);
  return (
    <main
      style={{ ...theme, fontFamily: 'var(--font-body, var(--font-lora))' } as CSSProperties}
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[var(--color-bg,#FAF6F0)] px-6 py-12 text-center text-[var(--color-text,#2B211B)]"
    >
      <h1 className="font-[family-name:var(--font-heading,serif)] text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}

function renderSummaryCard(summary: PublicAppointmentSummary) {
  return (
    <div className="w-full rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-surface,#fff)] p-6 shadow-[var(--shadow-theme,none)]">
      <p className="font-semibold">{summary.serviceName}</p>
      <p className="text-sm text-[var(--color-text-muted,#666)]">{formatAppointmentDateTime(summary.start)}</p>
      <p className="text-sm text-[var(--color-text-muted,#666)]">
        Con {summary.employeeName} · {summary.businessName}
      </p>
    </div>
  );
}

function renderSuccess(summary: PublicAppointmentSummary, business: PublicBusiness) {
  const icsDataUrl = `data:text/calendar;charset=utf-8,${encodeURIComponent(
    generateAppointmentIcs({
      uid: `${summary.id}@appoint.app`,
      businessName: summary.businessName,
      serviceName: summary.serviceName,
      employeeName: summary.employeeName,
      address: business.address,
      start: summary.start,
      end: summary.end,
    })
  )}`;

  return (
    <ThemedScreen business={business} title="¡Cita confirmada!">
      {renderSummaryCard(summary)}

      <a
        href={icsDataUrl}
        download="cita.ics"
        className="rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-accent,#B25539)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast,#fff)]"
      >
        Añadir a mi calendario
      </a>

      <Link href={`/cita/${summary.cancelToken}`} className="text-sm underline text-[var(--color-accent,#B25539)]">
        Ver o cancelar mi cita
      </Link>
    </ThemedScreen>
  );
}

export default async function ConfirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const summary = await getAppointmentByConfirmToken(prisma, token);

  if (!summary) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[#FAF6F0] px-6 py-12 text-center text-[#2B211B]">
        <h1 className="text-2xl font-semibold">No hemos podido confirmar tu cita</h1>
        <p className="text-[#6B5D53]">No encontramos ninguna cita con este enlace. Puede que el enlace no sea correcto.</p>
      </main>
    );
  }

  const business = await getPublicBusinessBySlug(prisma, summary.businessSlug);
  if (!business) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[#FAF6F0] px-6 py-12 text-center text-[#2B211B]">
        <h1 className="text-2xl font-semibold">No hemos podido confirmar tu cita</h1>
        <p className="text-[#6B5D53]">Este negocio ya no está disponible.</p>
      </main>
    );
  }

  if (summary.status === 'CONFIRMED') {
    return renderSuccess(summary, business);
  }

  if (summary.status === 'CANCELLED') {
    return (
      <ThemedScreen business={business} title="Esta cita ha sido cancelada">
        {renderSummaryCard(summary)}
      </ThemedScreen>
    );
  }

  if (summary.status === 'COMPLETED' || summary.status === 'NO_SHOW') {
    return (
      <ThemedScreen business={business} title="Esta cita ya no está pendiente de confirmación">
        {renderSummaryCard(summary)}
      </ThemedScreen>
    );
  }

  // status === 'PENDING' a partir de aquí.
  if (summary.emailVerifiedAt) {
    // Solo ocurre con manualApproval: el cliente ya confirmó su email, pero
    // el negocio aún no ha aprobado la cita (panel de aprobación: Fase 5).
    return (
      <ThemedScreen business={business} title="Ya has confirmado tu email">
        {renderSummaryCard(summary)}
        <p className="text-sm text-[var(--color-text-muted,#666)]">
          Tu cita está pendiente de aprobación por parte del negocio. Te avisaremos por email en cuanto la confirmen.
        </p>
      </ThemedScreen>
    );
  }

  if (isPendingAppointmentExpired(summary, new Date())) {
    return (
      <ThemedScreen business={business} title="El enlace de confirmación ha caducado">
        {renderSummaryCard(summary)}
        <p className="text-sm text-[var(--color-text-muted,#666)]">
          Han pasado más de 30 minutos desde la reserva y el hueco ya se ha liberado. Puedes volver a reservar desde
          la página del negocio.
        </p>
      </ThemedScreen>
    );
  }

  return (
    <ThemedScreen business={business} title="Confirma tu cita">
      {renderSummaryCard(summary)}
      <form action={confirmAppointmentAction.bind(null, token)}>
        <button
          type="submit"
          className="rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-accent,#B25539)] px-6 py-3 font-semibold text-[var(--color-accent-contrast,#fff)]"
        >
          Confirmar cita
        </button>
      </form>
    </ThemedScreen>
  );
}
```

- [ ] **Step 7: Actualizar el e2e para pulsar el botón en vez de confiar en el `goto`**

En `e2e/booking-flow.spec.ts`, reemplaza el bloque de confirmación (desde `await page.goto(\`/confirmar/${appointment.confirmToken}\`);` hasta el `expect(stillConfirmed.status).toBe('CONFIRMED');` que le sigue) por:

```typescript
  await page.goto(`/confirmar/${appointment.confirmToken}`);
  await expect(page.getByRole('heading', { name: 'Confirma tu cita' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar cita' }).click();
  await expect(page.getByRole('heading', { name: '¡Cita confirmada!' })).toBeVisible();

  const confirmed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
  expect(confirmed.status).toBe('CONFIRMED');

  // Idempotencia: revisitar el mismo enlace de confirmación (reload/back)
  // tras confirmar con éxito debe seguir mostrando la pantalla de éxito,
  // no la de error, y no debe alterar el estado en BD. Ya no hay botón que
  // pulsar (summary.status === 'CONFIRMED' renderiza renderSuccess
  // directamente en el GET).
  await page.goto(`/confirmar/${appointment.confirmToken}`);
  await expect(page.getByRole('heading', { name: '¡Cita confirmada!' })).toBeVisible();

  const stillConfirmed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
  expect(stillConfirmed.status).toBe('CONFIRMED');
```

El resto del archivo (el bloque de reserva anterior y el bloque de cancelación posterior) no cambia.

- [ ] **Step 8: Ejecutar la suite de Vitest completa**

```powershell
pnpm test
```

Expected: todos los tests en verde.

- [ ] **Step 9: Ejecutar lint y build**

```powershell
pnpm lint
pnpm build
```

Expected: ambos sin errores.

- [ ] **Step 10: Ejecutar el e2e de Playwright**

Asegúrate de que no hay ningún `pnpm dev` corriendo en el puerto 3000 antes de este paso (el `webServer` de Playwright levanta su propio servidor contra `appoint_test`).

```powershell
pnpm exec playwright test
```

Expected: `1 passed`.

- [ ] **Step 11: Commit**

```powershell
git add src/lib/public/appointment-lookup.ts src/lib/public/appointment-lookup.test.ts "src/app/(public)/confirmar/[token]/actions.ts" "src/app/(public)/confirmar/[token]/page.tsx" e2e/booking-flow.spec.ts
git commit -m "fix(public): /confirmar/{token} deja de auto-confirmar en GET; requiere pulsar el botón"
```

---

### Tarea 10: Plantillas de cancelación + envío tras cancelar

**Modelo sugerido:** sonnet

**Files:**
- Create: `src/lib/email/templates/CancellationConfirmationEmail.tsx`, `src/lib/email/templates/CancellationNoticeToBusinessEmail.tsx`, `src/lib/public/cancellation-service.ts`
- Test: `src/lib/public/cancellation-service.test.ts`
- Modify: `src/lib/email/appointment-notifications.tsx`, `src/lib/email/appointment-notifications.test.ts`, `src/app/(public)/cita/[token]/actions.ts`

**Interfaces:**
- Consumes: `AppointmentEmailContext` (Tarea 6, sin cambios de forma); `cancelAppointment`, `CancelAppointmentResult` de `@/lib/booking/tokens` (ya existente); `getEmailSender` (Tarea 1).
- Produces:
  - `sendCancellationConfirmationEmail(emailSender: EmailSender, ctx: AppointmentEmailContext): Promise<{ ok: boolean }>`
  - `sendCancellationNoticeToBusinessEmail(emailSender: EmailSender, ctx: AppointmentEmailContext): Promise<{ ok: boolean }>`
  - `cancelPublicAppointment(prisma: PrismaClient, input: { token: string; emailSender?: EmailSender }): Promise<CancelAppointmentResult>` — consumida por la Server Action `cancelAppointmentAction`.

- [ ] **Step 1: Añadir los tests de las dos plantillas de cancelación**

Añade en `src/lib/email/appointment-notifications.test.ts` los nuevos nombres al import existente:

```typescript
import {
  sendBookingConfirmationEmail,
  sendBookingPendingApprovalEmail,
  sendNewPendingRequestEmail,
  sendCancellationConfirmationEmail,
  sendCancellationNoticeToBusinessEmail,
  type AppointmentEmailContext,
} from './appointment-notifications';
```

Y añade estos dos `describe` al final del archivo:

```typescript
describe('sendCancellationConfirmationEmail', () => {
  it('envía al cliente confirmando la cancelación', async () => {
    const sender = new FakeEmailSender();

    const result = await sendCancellationConfirmationEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('ana@example.com');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('Corte de mujer');
    expect(text.toLowerCase()).toContain('cancelad');
  });
});

describe('sendCancellationNoticeToBusinessEmail', () => {
  it('envía al negocio avisando de la cancelación del cliente', async () => {
    const sender = new FakeEmailSender();

    const result = await sendCancellationNoticeToBusinessEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('hola@salonaura.example');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('Ana López');
  });

  it('devuelve ok:false sin lanzar si el negocio no tiene email configurado', async () => {
    const sender = new FakeEmailSender();
    const ctxSinEmail: AppointmentEmailContext = {
      ...BASE_CTX,
      business: { ...BASE_CTX.business, email: null },
    };

    const result = await sendCancellationNoticeToBusinessEmail(sender, ctxSinEmail);

    expect(result.ok).toBe(false);
    expect(sender.sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Ejecutar el archivo y comprobar que falla**

```powershell
pnpm test appointment-notifications.test.ts
```

Expected: falla porque `sendCancellationConfirmationEmail`/`sendCancellationNoticeToBusinessEmail` no están exportadas todavía.

- [ ] **Step 3: Implementar `CancellationConfirmationEmail`**

Crea `src/lib/email/templates/CancellationConfirmationEmail.tsx`:

```typescript
import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface CancellationConfirmationEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
}

export function CancellationConfirmationEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  employeeName,
  startLabel,
}: CancellationConfirmationEmailProps) {
  return (
    <EmailLayout
      previewText={`Tu cita en ${businessName} ha sido cancelada`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Cita cancelada</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        Tu cita de <strong>{serviceName}</strong> con {employeeName} en {businessName}, el {startLabel}, ha sido
        cancelada correctamente.
      </Text>
      <Text>Si quieres reservar otra cita, visita de nuevo la página del negocio.</Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Implementar `CancellationNoticeToBusinessEmail`**

Crea `src/lib/email/templates/CancellationNoticeToBusinessEmail.tsx`:

```typescript
import { Heading, Text, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface CancellationNoticeToBusinessEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
}

export function CancellationNoticeToBusinessEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  customerPhone,
  customerEmail,
  serviceName,
  employeeName,
  startLabel,
}: CancellationNoticeToBusinessEmailProps) {
  return (
    <EmailLayout previewText="Un cliente ha cancelado su cita" businessName={businessName} accentColor={accentColor} logoUrl={logoUrl}>
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Cita cancelada por el cliente</Heading>
      <Text>
        <strong>Servicio:</strong> {serviceName}
        <br />
        <strong>Profesional:</strong> {employeeName}
        <br />
        <strong>Fecha:</strong> {startLabel}
      </Text>
      <Hr />
      <Text>
        <strong>Cliente:</strong> {customerName}
        <br />
        <strong>Teléfono:</strong> {customerPhone}
        <br />
        <strong>Email:</strong> {customerEmail}
      </Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 5: Añadir las dos funciones de envío a `appointment-notifications.tsx`**

Actualiza los imports al principio de `src/lib/email/appointment-notifications.tsx`:

```typescript
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import type { EmailMessage, EmailSender } from './types';
import { buildConfirmUrl } from './urls';
import { BookingConfirmationEmail } from './templates/BookingConfirmationEmail';
import { BookingPendingApprovalEmail } from './templates/BookingPendingApprovalEmail';
import { NewPendingRequestEmail } from './templates/NewPendingRequestEmail';
import { CancellationConfirmationEmail } from './templates/CancellationConfirmationEmail';
import { CancellationNoticeToBusinessEmail } from './templates/CancellationNoticeToBusinessEmail';
```

Y añade al final del archivo (después de `sendNewPendingRequestEmail`):

```typescript
export async function sendCancellationConfirmationEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  const message: EmailMessage = {
    to: ctx.appointment.customerEmail,
    subject: `Tu cita en ${ctx.business.name} ha sido cancelada`,
    react: (
      <CancellationConfirmationEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
      />
    ),
  };

  return trySend(emailSender, message);
}

export async function sendCancellationNoticeToBusinessEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  if (!ctx.business.email) {
    console.warn('[email] el negocio no tiene email configurado, no se envía aviso de cancelación', {
      businessName: ctx.business.name,
    });
    return { ok: false };
  }

  const message: EmailMessage = {
    to: ctx.business.email,
    subject: 'Un cliente ha cancelado su cita',
    react: (
      <CancellationNoticeToBusinessEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        customerPhone={ctx.appointment.customerPhone}
        customerEmail={ctx.appointment.customerEmail}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
      />
    ),
  };

  return trySend(emailSender, message);
}
```

- [ ] **Step 6: Ejecutar el archivo y comprobar que pasa**

```powershell
pnpm test appointment-notifications.test.ts
```

Expected: `8 passed`.

- [ ] **Step 7: Escribir el test de `cancelPublicAppointment`**

Crea `src/lib/public/cancellation-service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from '@/lib/booking/create-appointment';
import { cancelPublicAppointment } from './cancellation-service';
import { FakeEmailSender } from '../../test/fake-email-sender';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z');

async function createTestAppointment(overrides: { customerEmail?: string } = {}) {
  const seed = await seedDemoBusiness(prisma);
  const result = await createAppointment(prisma, {
    businessId: seed.business.id,
    serviceId: seed.services.corteHombre.id,
    employeeId: seed.employees.marta.id,
    start: VALID_START,
    customerName: 'Cliente cancelación',
    customerPhone: '+34688000010',
    customerEmail: overrides.customerEmail ?? 'cancelacion@example.com',
    source: 'WEB',
    ipAddress: '198.51.100.80',
    now: NOW,
  });
  if (!result.ok) {
    throw new Error(`No se pudo crear la cita de prueba: ${result.reason}`);
  }
  return { seed, appointment: result.appointment };
}

describe('cancelPublicAppointment', () => {
  it('cancela la cita y envía confirmación al cliente + aviso al negocio', async () => {
    const { seed, appointment } = await createTestAppointment();
    const emailSender = new FakeEmailSender();

    const result = await cancelPublicAppointment(prisma, { token: appointment.cancelToken, emailSender });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointment.status).toBe('CANCELLED');
    }
    expect(emailSender.sent).toHaveLength(2);
    expect(emailSender.sent.map((m) => m.to).sort()).toEqual(
      ['cancelacion@example.com', seed.business.email].sort()
    );
  });

  it('no reenvía emails si la cita ya estaba cancelada (idempotencia)', async () => {
    const { appointment } = await createTestAppointment({ customerEmail: 'cancelacion-idempotente@example.com' });
    const emailSender = new FakeEmailSender();

    const first = await cancelPublicAppointment(prisma, { token: appointment.cancelToken, emailSender });
    expect(first.ok).toBe(true);
    expect(emailSender.sent).toHaveLength(2);

    const second = await cancelPublicAppointment(prisma, { token: appointment.cancelToken, emailSender });
    expect(second.ok).toBe(true);
    expect(emailSender.sent).toHaveLength(2); // sin cambios: no se reenvía nada
  });

  it('devuelve NOT_FOUND sin enviar nada si el token no existe', async () => {
    const emailSender = new FakeEmailSender();

    const result = await cancelPublicAppointment(prisma, { token: 'token-inexistente', emailSender });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(emailSender.sent).toHaveLength(0);
  });
});
```

- [ ] **Step 8: Ejecutar el archivo y comprobar que falla**

```powershell
pnpm test cancellation-service.test.ts
```

Expected: falla con `Cannot find module './cancellation-service'`.

- [ ] **Step 9: Implementar `cancelPublicAppointment`**

Crea `src/lib/public/cancellation-service.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { cancelAppointment, type CancelAppointmentResult } from '@/lib/booking/tokens';
import { getEmailSender } from '@/lib/email/get-email-sender';
import type { EmailSender } from '@/lib/email/types';
import { sendCancellationConfirmationEmail, sendCancellationNoticeToBusinessEmail } from '@/lib/email/appointment-notifications';

export interface CancelPublicAppointmentInput {
  token: string;
  emailSender?: EmailSender;
}

export async function cancelPublicAppointment(
  prisma: PrismaClient,
  input: CancelPublicAppointmentInput
): Promise<CancelAppointmentResult> {
  // Se comprueba el estado ANTES de cancelar para no reenviar emails si la
  // cita ya estaba CANCELLED (cancelAppointment es idempotente y devuelve
  // ok:true en ambos casos, sin distinguirlos).
  const before = await prisma.appointment.findUnique({ where: { cancelToken: input.token } });
  const wasAlreadyCancelled = before?.status === 'CANCELLED';

  const result = await cancelAppointment(prisma, input.token);

  if (result.ok && !wasAlreadyCancelled) {
    const emailSender = input.emailSender ?? getEmailSender();
    const withRelations = await prisma.appointment.findUnique({
      where: { id: result.appointment.id },
      include: { service: true, employee: true, business: true },
    });

    if (withRelations) {
      const ctx = {
        appointment: withRelations,
        service: withRelations.service,
        employee: withRelations.employee,
        business: withRelations.business,
      };
      await sendCancellationConfirmationEmail(emailSender, ctx);
      await sendCancellationNoticeToBusinessEmail(emailSender, ctx);
    }
  }

  return result;
}
```

- [ ] **Step 10: Ejecutar el archivo y comprobar que pasa**

```powershell
pnpm test cancellation-service.test.ts
```

Expected: `3 passed`.

- [ ] **Step 11: Usar `cancelPublicAppointment` desde la Server Action de cancelación**

Reemplaza el contenido completo de `src/app/(public)/cita/[token]/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { cancelPublicAppointment } from '@/lib/public/cancellation-service';

export async function cancelAppointmentAction(token: string): Promise<void> {
  await cancelPublicAppointment(prisma, { token });
  revalidatePath(`/cita/${token}`);
}
```

- [ ] **Step 12: Ejecutar toda la suite**

```powershell
pnpm test
```

Expected: todos los tests en verde.

- [ ] **Step 13: Commit**

```powershell
git add src/lib/email/templates/CancellationConfirmationEmail.tsx src/lib/email/templates/CancellationNoticeToBusinessEmail.tsx src/lib/email/appointment-notifications.tsx src/lib/email/appointment-notifications.test.ts src/lib/public/cancellation-service.ts src/lib/public/cancellation-service.test.ts "src/app/(public)/cita/[token]/actions.ts"
git commit -m "feat(email): plantillas y envío de cancelación al cliente y al negocio"
```

---

## Recordatorios

### Tarea 11: Plantilla de recordatorio y selección/marcado de citas a recordar

**Modelo sugerido:** sonnet

**Files:**
- Create: `src/lib/email/templates/ReminderEmail.tsx`, `src/lib/email/reminders.ts`
- Test: `src/lib/email/reminders.test.ts`
- Modify: `src/lib/email/appointment-notifications.tsx`, `src/lib/email/appointment-notifications.test.ts`

**Interfaces:**
- Consumes: `AppointmentEmailContext` (Tarea 6, sin cambios de forma); `buildCancelUrl` de `./urls` (Tarea 5); `getEmailSender` (Tarea 1).
- Produces:
  - `sendReminderEmail(emailSender: EmailSender, ctx: AppointmentEmailContext): Promise<{ ok: boolean }>`
  - `sendDueReminders(prisma: PrismaClient, params?: { now?: Date; emailSender?: EmailSender }): Promise<{ sent: number }>` — consumida por la Tarea 12 (Route Handler del cron).

- [ ] **Step 1: Añadir el test de `sendReminderEmail`**

Añade en `src/lib/email/appointment-notifications.test.ts` el nombre nuevo al import existente:

```typescript
import {
  sendBookingConfirmationEmail,
  sendBookingPendingApprovalEmail,
  sendNewPendingRequestEmail,
  sendCancellationConfirmationEmail,
  sendCancellationNoticeToBusinessEmail,
  sendReminderEmail,
  type AppointmentEmailContext,
} from './appointment-notifications';
```

Y añade este `describe` al final del archivo:

```typescript
describe('sendReminderEmail', () => {
  it('envía al cliente con el enlace de cancelación', async () => {
    const sender = new FakeEmailSender();

    const result = await sendReminderEmail(sender, BASE_CTX);

    expect(result.ok).toBe(true);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('ana@example.com');

    const text = await render(sender.sent[0].react, { plainText: true });
    expect(text).toContain('http://localhost:3000/cita/cancel-token-456');
    expect(text).toContain('Corte de mujer');
  });
});
```

- [ ] **Step 2: Ejecutar el archivo y comprobar que falla**

```powershell
pnpm test appointment-notifications.test.ts
```

Expected: falla porque `sendReminderEmail` no está exportada todavía.

- [ ] **Step 3: Implementar `ReminderEmail`**

Crea `src/lib/email/templates/ReminderEmail.tsx`:

```typescript
import { Heading, Text, Button, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export interface ReminderEmailProps {
  businessName: string;
  accentColor: string;
  logoUrl: string | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  startLabel: string;
  cancelUrl: string;
}

export function ReminderEmail({
  businessName,
  accentColor,
  logoUrl,
  customerName,
  serviceName,
  employeeName,
  startLabel,
  cancelUrl,
}: ReminderEmailProps) {
  return (
    <EmailLayout
      previewText={`Recordatorio: tu cita en ${businessName} es mañana`}
      businessName={businessName}
      accentColor={accentColor}
      logoUrl={logoUrl}
    >
      <Heading style={{ fontSize: 20, textAlign: 'center', margin: '0 0 16px' }}>Recordatorio de tu cita</Heading>
      <Text>Hola {customerName},</Text>
      <Text>
        Te recordamos tu cita de <strong>{serviceName}</strong> con {employeeName} en {businessName}, el {startLabel}.
      </Text>
      <Button
        href={cancelUrl}
        style={{
          backgroundColor: '#ffffff',
          color: accentColor,
          border: `1px solid ${accentColor}`,
          padding: '12px 24px',
          borderRadius: 8,
          textDecoration: 'none',
          fontWeight: 'bold',
          display: 'block',
          textAlign: 'center',
          margin: '24px 0',
        }}
      >
        Cancelar cita
      </Button>
      <Hr />
      <Text style={{ fontSize: 12, color: '#6b7280' }}>
        Si ya no puedes asistir, cancela cuanto antes para liberar el hueco.
      </Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Añadir `sendReminderEmail` a `appointment-notifications.tsx`**

Actualiza los imports al principio de `src/lib/email/appointment-notifications.tsx`:

```typescript
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import type { EmailMessage, EmailSender } from './types';
import { buildConfirmUrl, buildCancelUrl } from './urls';
import { BookingConfirmationEmail } from './templates/BookingConfirmationEmail';
import { BookingPendingApprovalEmail } from './templates/BookingPendingApprovalEmail';
import { NewPendingRequestEmail } from './templates/NewPendingRequestEmail';
import { CancellationConfirmationEmail } from './templates/CancellationConfirmationEmail';
import { CancellationNoticeToBusinessEmail } from './templates/CancellationNoticeToBusinessEmail';
import { ReminderEmail } from './templates/ReminderEmail';
```

Y añade al final del archivo (después de `sendCancellationNoticeToBusinessEmail`):

```typescript
export async function sendReminderEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  const message: EmailMessage = {
    to: ctx.appointment.customerEmail,
    subject: `Recordatorio: tu cita en ${ctx.business.name} es mañana`,
    react: (
      <ReminderEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
        cancelUrl={buildCancelUrl(ctx.appointment.cancelToken)}
      />
    ),
  };

  return trySend(emailSender, message);
}
```

- [ ] **Step 5: Ejecutar el archivo y comprobar que pasa**

```powershell
pnpm test appointment-notifications.test.ts
```

Expected: `9 passed`.

- [ ] **Step 6: Escribir el test de `sendDueReminders`**

Crea `src/lib/email/reminders.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from '@/lib/booking/create-appointment';
import { confirmAppointment } from '@/lib/booking/tokens';
import { sendDueReminders } from './reminders';
import { FakeEmailSender } from '../../test/fake-email-sender';

const NOW = new Date('2026-07-13T08:00:00.000Z');

async function createConfirmedAppointment(start: Date, customerEmail: string) {
  const seed = await seedDemoBusiness(prisma);
  const created = await createAppointment(prisma, {
    businessId: seed.business.id,
    serviceId: seed.services.corteHombre.id,
    employeeId: seed.employees.marta.id,
    start,
    customerName: 'Cliente recordatorio',
    customerPhone: '+34688000030',
    customerEmail,
    source: 'WEB',
    ipAddress: '198.51.100.90',
    now: NOW,
  });
  if (!created.ok) {
    throw new Error(`No se pudo crear la cita de prueba: ${created.reason}`);
  }
  const confirmed = await confirmAppointment(prisma, created.appointment.confirmToken, NOW);
  if (!confirmed.ok) {
    throw new Error('No se pudo confirmar la cita de prueba');
  }
  return { seed, appointment: confirmed.appointment };
}

describe('sendDueReminders', () => {
  it('envía recordatorio y marca reminderSentAt para una cita CONFIRMED que empieza entre now+24h y now+25h', async () => {
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-dentro@example.com');
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(1);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('recordatorio-dentro@example.com');

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).not.toBeNull();
  });

  it('no envía recordatorio a una cita que empieza fuera de la ventana [now+24h, now+25h)', async () => {
    const start = new Date(NOW.getTime() + 26 * 60 * 60 * 1000); // fuera de ventana
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-fuera@example.com');
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);

    const refreshed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(refreshed.reminderSentAt).toBeNull();
  });

  it('no reenvía recordatorio a una cita que ya lo tiene marcado', async () => {
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    const { appointment } = await createConfirmedAppointment(start, 'recordatorio-repetido@example.com');
    await prisma.appointment.update({ where: { id: appointment.id }, data: { reminderSentAt: NOW } });
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('no envía recordatorio a una cita PENDING aunque esté en la ventana horaria', async () => {
    const seed = await seedDemoBusiness(prisma);
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    const created = await createAppointment(prisma, {
      businessId: seed.business.id,
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start,
      customerName: 'Cliente pendiente',
      customerPhone: '+34688000031',
      customerEmail: 'recordatorio-pendiente@example.com',
      source: 'WEB',
      ipAddress: '198.51.100.91',
      now: NOW,
    });
    if (!created.ok) {
      throw new Error(`No se pudo crear la cita de prueba: ${created.reason}`);
    }
    const emailSender = new FakeEmailSender();

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(0);
    expect(emailSender.sent).toHaveLength(0);
  });

  it('procesa varias citas de negocios distintos en la misma pasada', async () => {
    const start = new Date(NOW.getTime() + 24.5 * 60 * 60 * 1000);
    await createConfirmedAppointment(start, 'recordatorio-multi-a@example.com');
    const emailSender = new FakeEmailSender();

    // Segundo negocio con su propia cita en la misma ventana.
    const otherBusiness = await prisma.business.create({
      data: { slug: 'otro-negocio-recordatorio', name: 'Otro Negocio', type: 'OTHER', email: 'otro@example.com' },
    });
    const otherEmployee = await prisma.employee.create({
      data: { businessId: otherBusiness.id, name: 'Empleado ajeno', active: true },
    });
    const otherService = await prisma.service.create({
      data: { businessId: otherBusiness.id, name: 'Servicio ajeno', durationMinutes: 30, priceCents: 1000 },
    });
    await prisma.serviceEmployee.create({ data: { serviceId: otherService.id, employeeId: otherEmployee.id } });
    await prisma.workingHours.create({ data: { employeeId: otherEmployee.id, weekday: start.getUTCDay(), startMinute: 0, endMinute: 1440 } });
    const otherCustomer = await prisma.customer.create({
      data: { businessId: otherBusiness.id, name: 'Cliente ajeno', phone: '+34688000032', email: 'recordatorio-multi-b@example.com' },
    });
    await prisma.appointment.create({
      data: {
        businessId: otherBusiness.id,
        serviceId: otherService.id,
        employeeId: otherEmployee.id,
        customerId: otherCustomer.id,
        customerName: otherCustomer.name,
        customerPhone: otherCustomer.phone,
        customerEmail: otherCustomer.email,
        start,
        end: new Date(start.getTime() + 30 * 60 * 1000),
        status: 'CONFIRMED',
      },
    });

    const result = await sendDueReminders(prisma, { now: NOW, emailSender });

    expect(result.sent).toBe(2);
    expect(emailSender.sent.map((m) => m.to).sort()).toEqual(
      ['recordatorio-multi-a@example.com', 'recordatorio-multi-b@example.com'].sort()
    );
  });
});
```

- [ ] **Step 7: Ejecutar el archivo y comprobar que falla**

```powershell
pnpm test reminders.test.ts
```

Expected: falla con `Cannot find module './reminders'`.

- [ ] **Step 8: Implementar `sendDueReminders`**

Crea `src/lib/email/reminders.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { getEmailSender } from './get-email-sender';
import type { EmailSender } from './types';
import { sendReminderEmail } from './appointment-notifications';

const REMINDER_WINDOW_START_HOURS = 24;
const REMINDER_WINDOW_END_HOURS = 25;

export interface SendDueRemindersParams {
  now?: Date;
  emailSender?: EmailSender;
}

export interface SendDueRemindersResult {
  sent: number;
}

export async function sendDueReminders(
  prisma: PrismaClient,
  params: SendDueRemindersParams = {}
): Promise<SendDueRemindersResult> {
  const now = params.now ?? new Date();
  const emailSender = params.emailSender ?? getEmailSender();

  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_START_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_END_HOURS * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: 'CONFIRMED',
      start: { gte: windowStart, lt: windowEnd },
      reminderSentAt: null,
    },
    include: { service: true, employee: true, business: true },
  });

  let sent = 0;
  for (const appointment of appointments) {
    const result = await sendReminderEmail(emailSender, {
      appointment,
      service: appointment.service,
      employee: appointment.employee,
      business: appointment.business,
    });

    if (result.ok) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { reminderSentAt: now },
      });
      sent += 1;
    }
  }

  return { sent };
}
```

- [ ] **Step 9: Ejecutar el archivo y comprobar que pasa**

```powershell
pnpm test reminders.test.ts
```

Expected: `5 passed`.

- [ ] **Step 10: Ejecutar toda la suite**

```powershell
pnpm test
```

Expected: todos los tests en verde.

- [ ] **Step 11: Commit**

```powershell
git add src/lib/email/templates/ReminderEmail.tsx src/lib/email/appointment-notifications.tsx src/lib/email/appointment-notifications.test.ts src/lib/email/reminders.ts src/lib/email/reminders.test.ts
git commit -m "feat(email): plantilla de recordatorio y selección/marcado de citas a recordar"
```

---

### Tarea 12: Route Handler del cron de recordatorios

**Modelo sugerido:** haiku

**Files:**
- Create: `src/lib/email/cron-auth.ts`, `src/app/api/cron/reminders/route.ts`, `vercel.json`
- Test: `src/lib/email/cron-auth.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `sendDueReminders` de `./reminders` (Tarea 11); `getEmailSender` de `./get-email-sender` (Tarea 1); `prisma` de `@/lib/db` (ya existente).
- Produces: `isAuthorizedCronRequest(authorizationHeader: string | null, cronSecret: string | undefined): boolean`; Route Handler `GET /api/cron/reminders`.

- [ ] **Step 1: Documentar `CRON_SECRET` en `.env.example`**

Añade al final de `.env.example`:

```
# Fase 4 — cron de recordatorios. Vercel Cron añade automáticamente el header
# Authorization: Bearer ${CRON_SECRET} en cada invocación cuando esta variable
# está configurada en el proyecto de Vercel. En local, genera cualquier
# cadena aleatoria.
CRON_SECRET="dev-secret-change-me"
```

- [ ] **Step 2: Escribir el test de `isAuthorizedCronRequest`**

Crea `src/lib/email/cron-auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isAuthorizedCronRequest } from './cron-auth';

describe('isAuthorizedCronRequest', () => {
  it('autoriza cuando el header coincide exactamente con Bearer + el secreto', () => {
    expect(isAuthorizedCronRequest('Bearer abc123', 'abc123')).toBe(true);
  });

  it('rechaza si el header no está presente', () => {
    expect(isAuthorizedCronRequest(null, 'abc123')).toBe(false);
  });

  it('rechaza si el secreto no está configurado en el servidor', () => {
    expect(isAuthorizedCronRequest('Bearer abc123', undefined)).toBe(false);
  });

  it('rechaza si el token del header no coincide', () => {
    expect(isAuthorizedCronRequest('Bearer otro-token', 'abc123')).toBe(false);
  });

  it('rechaza si falta el prefijo "Bearer "', () => {
    expect(isAuthorizedCronRequest('abc123', 'abc123')).toBe(false);
  });
});
```

- [ ] **Step 3: Ejecutar el test y comprobar que falla**

```powershell
pnpm test cron-auth.test.ts
```

Expected: falla con `Cannot find module './cron-auth'`.

- [ ] **Step 4: Implementar `isAuthorizedCronRequest`**

Crea `src/lib/email/cron-auth.ts`:

```typescript
export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  cronSecret: string | undefined
): boolean {
  if (!cronSecret) {
    return false;
  }
  return authorizationHeader === `Bearer ${cronSecret}`;
}
```

- [ ] **Step 5: Ejecutar el test y comprobar que pasa**

```powershell
pnpm test cron-auth.test.ts
```

Expected: `5 passed`.

- [ ] **Step 6: Crear el Route Handler del cron**

Crea `src/app/api/cron/reminders/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendDueReminders } from '@/lib/email/reminders';
import { isAuthorizedCronRequest } from '@/lib/email/cron-auth';

export async function GET(request: Request): Promise<Response> {
  const authorized = isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET);
  if (!authorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const result = await sendDueReminders(prisma);
  return NextResponse.json({ sent: result.sent });
}
```

Este handler es deliberadamente fino: toda su lógica (selección de citas, envío, marcado, autorización) ya está cubierta por los tests de `sendDueReminders` (Tarea 11) e `isAuthorizedCronRequest` (Step 2 de esta tarea) contra Postgres real / en aislado, así que no necesita un test propio que levante un servidor Next — sería una prueba de integración cara que no añade cobertura nueva.

- [ ] **Step 7: Configurar el cron horario de Vercel**

Crea `vercel.json` en la raíz del proyecto:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 * * * *"
    }
  ]
}
```

- [ ] **Step 8: Ejecutar toda la suite**

```powershell
pnpm test
```

Expected: todos los tests en verde.

- [ ] **Step 9: Ejecutar lint y build**

```powershell
pnpm lint
pnpm build
```

Expected: ambos sin errores (el build compila el nuevo Route Handler como una ruta más de la API).

- [ ] **Step 10: Verificación manual del Route Handler en dev**

```powershell
pnpm dev
```

En otra terminal, con el servidor de dev arrancado y `CRON_SECRET="dev-secret-change-me"` en `.env`:

```powershell
curl.exe -i http://localhost:3000/api/cron/reminders
curl.exe -i http://localhost:3000/api/cron/reminders -H "Authorization: Bearer dev-secret-change-me"
```

Expected: la primera petición (sin header) devuelve `401` con `{"error":"No autorizado"}`; la segunda (con el header correcto) devuelve `200` con `{"sent":0}` (no hay citas próximas a 24h en la BD de desarrollo salvo que hayas creado alguna a mano). Detén `pnpm dev` con Ctrl+C al terminar.

- [ ] **Step 11: Commit**

```powershell
git add .env.example src/lib/email/cron-auth.ts src/lib/email/cron-auth.test.ts src/app/api/cron/reminders/route.ts vercel.json
git commit -m "feat(cron): Route Handler de recordatorios protegido por CRON_SECRET + cron horario de Vercel"
```

---

## Cierre de fase

### Tarea 13: Actualizar `CONTINUAR.md` con el estado tras la Fase 4

**Modelo sugerido:** haiku

**Files:**
- Modify: `docs/superpowers/CONTINUAR.md`

**Interfaces:**
- Consumes: nada (documentación).
- Produces: nada (documentación).

- [ ] **Step 1: Reemplazar el contenido de `CONTINUAR.md`**

Reemplaza el contenido completo de `docs/superpowers/CONTINUAR.md`:

```markdown
# Continuación del proyecto — estado y siguientes pasos

_Actualizado: tras completar la Fase 4 (emails y recordatorios)._

## Estado actual

- **Hecho**: Fases 1-2 (fundación + motor de reservas, merge `6492edb`), Fase 3 (página pública, mergeada 2026-07-16) y **Fase 4 (emails y recordatorios)**: capa de envío intercambiable (`ResendEmailSender`/`ConsoleEmailSender` según `RESEND_API_KEY`), plantillas React Email (confirmación, solicitud pendiente de aprobación, nueva solicitud al negocio, cancelación al cliente y al negocio, recordatorio 24h), doble paso de `manualApproval` (`Appointment.emailVerifiedAt`: confirmar por token ya no equivale a aprobar la cita cuando `manualApproval` está activo), expiración perezosa corregida (una `PENDING` con `emailVerifiedAt` fijado ya no caduca ni se libera automáticamente), `/confirmar/{token}` ya no auto-confirma en `GET` (botón + Server Action), y cron horario `/api/cron/reminders` protegido por `CRON_SECRET`.
- **Verificación**: suite Vitest completa + e2e Playwright (actualizado para pulsar el botón de confirmar) + lint + build, todo en verde.
- **Proceso usado**: superpowers — writing-plans → (subagent-driven-development o executing-plans, según se eligiera al ejecutar este plan).
- **Política de modelos** (petición del usuario): haiku para tareas con código completo en el plan (transcripción), sonnet para integración/entorno y para TODOS los revisores por tarea, opus para la revisión global de rama. El modelo principal solo orquesta.

## Siguiente paso: Fase 5 — Panel del negocio

Alcance según la spec (`docs/superpowers/specs/2026-07-12-appoint-design.md`):

1. Requiere configurar Supabase Auth (email+contraseña) para dueños/staff — todavía no está configurado.
2. Contenido esperado: `/panel` (agenda día/semana, confirmar pendientes, marcar completada/no-show, crear cita manual, cancelar), `/panel/servicios`, `/panel/equipo` (CRUD + horarios + ausencias), `/panel/clientes` (listado + lista negra), `/panel/ajustes` (datos del negocio, tema con vista previa en vivo, políticas de reserva, descarga del QR).
3. **Aprobación manual de citas** (pendiente desde la Fase 4): las citas `PENDING` con `emailVerifiedAt` fijado y `business.manualApproval = true` necesitan una acción del negocio en `/panel` para pasar a `CONFIRMED` (o a `CANCELLED` si se rechazan). Esa transición debe enviar también el email de confirmación al cliente (reutilizar `sendBookingConfirmationEmail` de `src/lib/email/appointment-notifications.tsx`, o una plantilla de "cita aprobada" si el copy debe distinguirse — decisión a consultar con el usuario).
4. **Plantilla "invitación de dueño"**: sigue fuera de alcance hasta la Fase 6 (super-admin), pero si la Fase 5 acaba necesitando invitar staff por email antes de eso, consultar con el usuario.

## Avisos técnicos para la Fase 5

- **Contrato de `confirmAppointment`** (`src/lib/booking/tokens.ts`): devuelve `{ ok: true; appointment; pendingApproval: boolean } | { ok: false; reason }`. Con `manualApproval`, `pendingApproval: true` significa "el cliente ya verificó su email, pero la cita sigue PENDING esperando que el negocio la apruebe" — es exactamente el filtro que necesita la vista de "pendientes de aprobación" del panel: `Appointment.status === 'PENDING' && Appointment.emailVerifiedAt !== null && business.manualApproval`.
- **`isPendingAppointmentExpired(appointment, now)`** (`src/lib/booking/tokens.ts`) es la única fuente de verdad sobre si una `PENDING` sin verificar ha caducado; reutilízala en vez de recalcular `createdAt + 30min` a mano.
- **`EmailSender`/`getEmailSender()`/`FakeEmailSender`**: cualquier envío nuevo del panel (aprobar, rechazar, cita manual) debe seguir el mismo patrón de inyección opcional (`emailSender?: EmailSender`, por defecto `getEmailSender()`) para poder testearse con Postgres real sin tocar red.
- **`AppointmentEmailContext`** (`src/lib/email/appointment-notifications.tsx`) es el shape estable que ya usan las 6 funciones `sendXEmail`; cualquier plantilla nueva del panel (aprobación, cita manual) debería reutilizarlo tal cual si los datos encajan.
- En dev, sin `RESEND_API_KEY`, todos los emails se registran en consola (`ConsoleEmailSender`) — no hace falta Resend real para probar el panel manualmente.

## Minors conocidos (no bloquean; candidatos a limpieza oportunista)

- Alternativas de hueco solo se ofrecen con `SLOT_TAKEN`; los mensajes de `EMPLOYEE_UNAVAILABLE`/`NO_EMPLOYEE_AVAILABLE` invitan a "otro horario" sin ofrecerlas (`booking-service.ts`).
- Al volver de un error en la hoja de reserva, se pierden nombre/teléfono/email tecleados (remonta `StepCustomerData`).
- El selector de día renderiza `maxBookingWindowDays` botones (30 por defecto; pesado si un negocio configura ventanas grandes).
- Pantalla neutra de "no encontrado" duplicada (candidato a extraer un `NeutralErrorScreen` compartido); descarga `.ics` vía data-URI sin verificar en iOS Safari; `img` en vez de `next/image` (sin `remotePatterns`).
- **Deuda consciente del motor (no tocar sin necesidad)**: TOCTOU en límites anti-fraude fuera de la transacción; `checkRateLimit` acoplado al flujo insertar-antes-de-contar; los tests de carrera aceptan `EMPLOYEE_UNAVAILABLE` además de `SLOT_TAKEN` (pre-check fuera de la transacción).

## Avisos del motor que siguen vigentes

- **Dedupe de huecos**: con "cualquier profesional" el motor devuelve un slot por empleado; la capa pública ya deduplica por `start` (`getDedupedAvailableSlotsForBusiness`).
- **`manualApproval`**: ver "Avisos técnicos para la Fase 5" arriba — ya no es solo un flag de copy, cambia el comportamiento real de `confirmAppointment`.

## Después de la Fase 5

- **Fase 6**: super-admin + despliegue (falta comprar dominio; usuario familiarizado con Vercel/Supabase). Incluye la plantilla de email "invitación de dueño", excluida de la Fase 4.

## Cómo arrancar el entorno

```powershell
pnpm exec supabase start        # Docker debe estar activo; BD dev en :54322
pnpm test                       # contra appoint_test
pnpm exec playwright test       # e2e (levanta su propio servidor)
pnpm dev                        # Next.js en localhost:3000
```

`.env` no está en git: copiar `.env.example`. Sin `RESEND_API_KEY`/`CRON_SECRET` reales, el dev funciona igual (`ConsoleEmailSender` y el cron devuelve 401 si no mandas el header, pero puedes invocar `sendDueReminders` directamente desde un script si necesitas probarlo sin curl).
```

- [ ] **Step 2: Commit**

```powershell
git add docs/superpowers/CONTINUAR.md
git commit -m "docs: CONTINUAR.md refleja el cierre de la Fase 4 y el arranque de la Fase 5"
```

---

## Resumen de archivos nuevos

```
src/lib/email/types.ts
src/lib/email/console-sender.ts
src/lib/email/console-sender.test.tsx
src/lib/email/resend-sender.ts
src/lib/email/resend-sender.test.ts
src/lib/email/get-email-sender.ts
src/lib/email/get-email-sender.test.ts
src/lib/email/urls.ts
src/lib/email/urls.test.ts
src/lib/email/appointment-notifications.tsx
src/lib/email/appointment-notifications.test.ts
src/lib/email/reminders.ts
src/lib/email/reminders.test.ts
src/lib/email/cron-auth.ts
src/lib/email/cron-auth.test.ts
src/lib/email/templates/EmailLayout.tsx
src/lib/email/templates/EmailLayout.test.tsx
src/lib/email/templates/BookingConfirmationEmail.tsx
src/lib/email/templates/BookingPendingApprovalEmail.tsx
src/lib/email/templates/NewPendingRequestEmail.tsx
src/lib/email/templates/CancellationConfirmationEmail.tsx
src/lib/email/templates/CancellationNoticeToBusinessEmail.tsx
src/lib/email/templates/ReminderEmail.tsx
src/lib/public/cancellation-service.ts
src/lib/public/cancellation-service.test.ts
src/lib/booking/active-appointments.test.ts
src/test/fake-email-sender.ts
src/app/(public)/confirmar/[token]/actions.ts
src/app/api/cron/reminders/route.ts
prisma/migrations/<timestamp>_add_appointment_email_tracking/migration.sql
vercel.json
```

Archivos modificados (no nuevos): `package.json`/`pnpm-lock.yaml` (dependencias nuevas), `vitest.config.ts` (plugin de React), `.env.example` (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`, `CRON_SECRET`), `prisma/schema.prisma` (`emailVerifiedAt`/`reminderSentAt`), `src/lib/booking/active-appointments.ts`, `src/lib/booking/create-appointment.ts`, `src/lib/booking/tokens.ts`, `src/lib/booking/slots.test.ts`, `src/lib/booking/anti-fraud.test.ts`, `src/lib/booking/create-appointment.test.ts`, `src/lib/booking/tokens.test.ts`, `src/lib/public/appointment-lookup.ts`, `src/lib/public/appointment-lookup.test.ts`, `src/lib/public/booking-service.ts`, `src/lib/public/booking-service.test.ts`, `src/app/(public)/[slug]/components/booking-sheet/StepSuccess.tsx`, `src/app/(public)/confirmar/[token]/page.tsx`, `src/app/(public)/cita/[token]/actions.ts`, `e2e/booking-flow.spec.ts`, `docs/superpowers/CONTINUAR.md`.

