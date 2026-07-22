# Limpieza de minors (post-Fase 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar tres minors documentados en `docs/superpowers/CONTINUAR.md`: límites de fecha razonables en `TimeOff` (ausencias), paginación en `/panel/clientes` y `/admin/negocios`, y una acción de "reenviar invitación" en `/admin/negocios`.

**Architecture:** Mantenimiento acotado sobre código ya existente, sin nuevas piezas de infraestructura. Extiende funciones de servicio ya presentes (`time-off-service.ts`, `customers-service.ts`, `platform-business-service.ts`, `owner-inviter.ts`) siguiendo los patrones ya establecidos en el proyecto (resultado `{ok, reason}` tipado, `?aviso=` para feedback tras redirect, inyección de dependencias externas vía interfaz + Fake en tests). Se añade un único módulo nuevo pequeño, `src/lib/pagination.ts`, para no duplicar la aritmética de paginación entre los dos listados.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Prisma sobre PostgreSQL, Vitest contra Postgres real, Supabase Auth Admin API.

## Global Constraints

- Español en toda la UI y mensajes de error, igual que el resto del proyecto.
- TDD obligatorio: cada regla de negocio nueva lleva su test antes/junto a la implementación.
- Toda consulta a tablas de negocio sigue filtrando por `businessId` en la capa de aplicación.
- No se introduce zod ni ninguna librería de validación nueva — el proyecto valida a mano, seguir ese patrón.
- Commits frecuentes, uno por tarea completada, mensajes en español siguiendo el estilo del historial (`fix:`, `feat:`, `test:`).
- No tocar ningún otro minor de `CONTINUAR.md` fuera de los tres descritos aquí.

---

## Task 1: Límites de fecha en TimeOff (ausencias)

**Files:**
- Modify: `src/lib/panel/time-off-service.ts`
- Modify: `src/lib/panel/time-off-service.test.ts`
- Modify: `src/app/panel/(protected)/equipo/[id]/actions.ts`
- Modify: `src/app/panel/(protected)/equipo/[id]/page.tsx`

**Interfaces:**
- Consumes: nada de otras tareas de este plan.
- Produces: `TimeOffMutationResult` con `reason` ampliado a `'INVALID_INPUT' | 'NOT_FOUND' | 'START_IN_PAST' | 'DURATION_TOO_LONG' | 'TOO_FAR_IN_FUTURE' | 'OVERLAPPING'`. `createTimeOffForEmployee(prisma, businessId, employeeId, { start, end, reason, now? })` — `now` es opcional, por defecto `new Date()`.

- [ ] **Step 1: Escribir los tests que fallan para las 4 reglas nuevas + actualizar los tests existentes para que no dependan del reloj real**

Reemplaza el contenido completo de `src/lib/panel/time-off-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { listTimeOffForEmployee, createTimeOffForEmployee, deleteTimeOffForBusiness } from './time-off-service';

const NOW = new Date('2026-08-01T00:00:00.000Z');

describe('createTimeOffForEmployee', () => {
  it('crea la ausencia si el empleado pertenece al negocio', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: 'Vacaciones',
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });

  it('devuelve INVALID_INPUT si start >= end', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T18:00:00.000Z'),
      end: new Date('2026-09-01T08:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve NOT_FOUND si el empleado pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-ausencia', name: 'Otro', type: 'OTHER' } });

    const result = await createTimeOffForEmployee(prisma, otherBusiness.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('createTimeOffForEmployee — límites de fecha', () => {
  it('devuelve START_IN_PAST si la fecha de inicio es anterior a ahora', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-07-01T08:00:00.000Z'),
      end: new Date('2026-07-01T18:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'START_IN_PAST' });
  });

  it('devuelve DURATION_TOO_LONG si la ausencia dura más de 90 días', async () => {
    const seed = await seedDemoBusiness(prisma);
    const start = new Date('2026-08-02T00:00:00.000Z');
    const end = new Date(start.getTime() + 91 * 24 * 60 * 60 * 1000);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start,
      end,
      reason: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'DURATION_TOO_LONG' });
  });

  it('acepta una ausencia de exactamente 90 días', async () => {
    const seed = await seedDemoBusiness(prisma);
    const start = new Date('2026-08-02T00:00:00.000Z');
    const end = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start,
      end,
      reason: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });

  it('devuelve TOO_FAR_IN_FUTURE si empieza más de 2 años vista', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2028-08-02T00:00:00.000Z'),
      end: new Date('2028-08-03T00:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'TOO_FAR_IN_FUTURE' });
  });

  it('acepta una ausencia que empieza exactamente 2 años después de ahora', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2028-08-01T00:00:00.000Z'),
      end: new Date('2028-08-01T08:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });

  it('devuelve OVERLAPPING si se solapa con otra ausencia del mismo empleado', async () => {
    const seed = await seedDemoBusiness(prisma);
    await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-08-10T08:00:00.000Z'),
      end: new Date('2026-08-10T18:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-08-10T12:00:00.000Z'),
      end: new Date('2026-08-10T20:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'OVERLAPPING' });
  });

  it('acepta dos ausencias contiguas que solo se tocan en el límite (no se solapan)', async () => {
    const seed = await seedDemoBusiness(prisma);
    await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-08-10T08:00:00.000Z'),
      end: new Date('2026-08-10T18:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    const result = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-08-10T18:00:00.000Z'),
      end: new Date('2026-08-10T20:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
  });
});

describe('listTimeOffForEmployee', () => {
  it('devuelve las ausencias del empleado, vacío si pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: null,
      now: NOW,
    });

    const list = await listTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id);
    expect(list.length).toBeGreaterThan(0);

    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-ausencia-2', name: 'Otro', type: 'OTHER' } });
    const listFromOther = await listTimeOffForEmployee(prisma, otherBusiness.id, seed.employees.marta.id);
    expect(listFromOther).toEqual([]);
  });
});

describe('deleteTimeOffForBusiness', () => {
  it('elimina la ausencia si pertenece (por su empleado) al negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const created = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: null,
      now: NOW,
    });
    if (!created.ok) throw new Error('setup falló');

    const result = await deleteTimeOffForBusiness(prisma, seed.business.id, created.timeOff.id);

    expect(result).toEqual({ ok: true });
    const remaining = await prisma.timeOff.findUnique({ where: { id: created.timeOff.id } });
    expect(remaining).toBeNull();
  });

  it('devuelve NOT_FOUND y no borra nada si pertenece a otro negocio', async () => {
    const seed = await seedDemoBusiness(prisma);
    const created = await createTimeOffForEmployee(prisma, seed.business.id, seed.employees.marta.id, {
      start: new Date('2026-09-01T08:00:00.000Z'),
      end: new Date('2026-09-01T18:00:00.000Z'),
      reason: null,
      now: NOW,
    });
    if (!created.ok) throw new Error('setup falló');
    const otherBusiness = await prisma.business.create({ data: { slug: 'otro-negocio-ausencia-3', name: 'Otro', type: 'OTHER' } });

    const result = await deleteTimeOffForBusiness(prisma, otherBusiness.id, created.timeOff.id);

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    const stillThere = await prisma.timeOff.findUnique({ where: { id: created.timeOff.id } });
    expect(stillThere).not.toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan (por falta de implementación de los reasons nuevos)**

Run: `pnpm exec vitest run src/lib/panel/time-off-service.test.ts`
Expected: FAIL — los tests de "límites de fecha" fallan porque el `reason` devuelto es `'INVALID_INPUT'` en vez de `'START_IN_PAST'`/`'DURATION_TOO_LONG'`/`'TOO_FAR_IN_FUTURE'`, y la comprobación de `OVERLAPPING` no existe (TypeScript incluso puede fallar antes de ejecutar si `now` no es un campo válido del input — eso también cuenta como "falla" en este paso).

- [ ] **Step 3: Implementar las 4 reglas nuevas en `time-off-service.ts`**

Reemplaza el contenido completo de `src/lib/panel/time-off-service.ts`:

```ts
import type { PrismaClient, TimeOff } from '@prisma/client';

export type TimeOffMutationResult =
  | { ok: true; timeOff: TimeOff }
  | { ok: false; reason: 'INVALID_INPUT' | 'NOT_FOUND' | 'START_IN_PAST' | 'DURATION_TOO_LONG' | 'TOO_FAR_IN_FUTURE' | 'OVERLAPPING' };
export type TimeOffDeleteResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' };

const MAX_TIME_OFF_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_ADVANCE_YEARS = 2;

function addYearsUtc(date: Date, years: number): Date {
  const result = new Date(date.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

export async function listTimeOffForEmployee(prisma: PrismaClient, businessId: string, employeeId: string): Promise<TimeOff[]> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.businessId !== businessId) {
    return [];
  }
  return prisma.timeOff.findMany({ where: { employeeId }, orderBy: { start: 'asc' } });
}

/**
 * `input.start`/`input.end` deben ser instantes UTC ya resueltos por quien
 * llama (usando `parseLocalWallTimeToUtc`/`localMinutesToUtc` de
 * `src/lib/booking/timezone.ts`), nunca `new Date('YYYY-MM-DDTHH:mm')` sobre
 * hora local de Europe/Madrid. Estas filas se consumen tal cual en el motor
 * de huecos (`slots.ts`): una Date sin convertir corrompe la disponibilidad
 * en silencio.
 *
 * `input.now` es inyectable para tests (mismo patrón que `now` en
 * `createAppointment`); en producción se omite y se usa `new Date()`.
 */
export async function createTimeOffForEmployee(
  prisma: PrismaClient,
  businessId: string,
  employeeId: string,
  input: { start: Date; end: Date; reason: string | null; now?: Date }
): Promise<TimeOffMutationResult> {
  const now = input.now ?? new Date();

  if (Number.isNaN(input.start.getTime()) || Number.isNaN(input.end.getTime()) || input.start >= input.end) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  if (input.start < now) {
    return { ok: false, reason: 'START_IN_PAST' };
  }
  if (input.end.getTime() - input.start.getTime() > MAX_TIME_OFF_DURATION_MS) {
    return { ok: false, reason: 'DURATION_TOO_LONG' };
  }
  if (input.start > addYearsUtc(now, MAX_ADVANCE_YEARS)) {
    return { ok: false, reason: 'TOO_FAR_IN_FUTURE' };
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.businessId !== businessId) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const overlapping = await prisma.timeOff.findFirst({
    where: { employeeId, start: { lt: input.end }, end: { gt: input.start } },
  });
  if (overlapping) {
    return { ok: false, reason: 'OVERLAPPING' };
  }

  const timeOff = await prisma.timeOff.create({
    data: { employeeId, start: input.start, end: input.end, reason: input.reason?.trim() || null },
  });
  return { ok: true, timeOff };
}

export async function deleteTimeOffForBusiness(
  prisma: PrismaClient,
  businessId: string,
  timeOffId: string
): Promise<TimeOffDeleteResult> {
  const timeOff = await prisma.timeOff.findUnique({ where: { id: timeOffId }, include: { employee: true } });
  if (!timeOff || timeOff.employee.businessId !== businessId) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  await prisma.timeOff.delete({ where: { id: timeOffId } });
  return { ok: true };
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm exec vitest run src/lib/panel/time-off-service.test.ts`
Expected: PASS — todos los tests en verde.

- [ ] **Step 5: Propagar los códigos de error nuevos al Server Action y al mensaje de aviso en la UI**

En `src/app/panel/(protected)/equipo/[id]/actions.ts`, sustituye la función `createTimeOffAction` y añade la tabla de mapeo justo antes:

```ts
const TIME_OFF_ERROR_AVISOS: Record<
  'INVALID_INPUT' | 'NOT_FOUND' | 'START_IN_PAST' | 'DURATION_TOO_LONG' | 'TOO_FAR_IN_FUTURE' | 'OVERLAPPING',
  string
> = {
  INVALID_INPUT: 'ausencia-invalida',
  NOT_FOUND: 'accion-no-aplicada',
  START_IN_PAST: 'ausencia-en-el-pasado',
  DURATION_TOO_LONG: 'ausencia-demasiado-larga',
  TOO_FAR_IN_FUTURE: 'ausencia-demasiado-lejana',
  OVERLAPPING: 'ausencia-solapada',
};

export async function createTimeOffAction(employeeId: string, formData: FormData): Promise<void> {
  const { businessId } = await requirePanelSession();
  const start = parseLocalWallTimeToUtc(String(formData.get('start')));
  const end = parseLocalWallTimeToUtc(String(formData.get('end')));
  const reason = String(formData.get('reason') ?? '') || null;
  const result = await createTimeOffForEmployee(prisma, businessId, employeeId, { start, end, reason });
  revalidatePath(`/panel/equipo/${employeeId}`);
  if (!result.ok) {
    redirectToEmployeeNotice(employeeId, TIME_OFF_ERROR_AVISOS[result.reason]);
  }
}
```

(El resto del archivo — imports, `replaceWorkingHoursAction`, `redirectToEmployeeNotice`, `deleteTimeOffAction` — no cambia.)

En `src/app/panel/(protected)/equipo/[id]/page.tsx`, sustituye el objeto `AVISO_MESSAGES`:

```ts
const AVISO_MESSAGES: Record<string, string> = {
  'accion-no-aplicada': 'Esa acción ya no se puede aplicar: el empleado o la ausencia cambiaron mientras tanto. La página se ha actualizado.',
  'ausencia-invalida': 'Revisa las fechas de la ausencia: el fin debe ser posterior al inicio.',
  'ausencia-en-el-pasado': 'La ausencia no puede empezar en el pasado.',
  'ausencia-demasiado-larga': 'Una ausencia no puede durar más de 90 días. Divídela en varias si hace falta.',
  'ausencia-demasiado-lejana': 'No se pueden crear ausencias con más de 2 años de antelación.',
  'ausencia-solapada': 'Ese empleado ya tiene otra ausencia que se solapa con esas fechas.',
};
```

(El resto del archivo no cambia.)

- [ ] **Step 6: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/panel/time-off-service.ts src/lib/panel/time-off-service.test.ts src/app/panel/\(protected\)/equipo/\[id\]/actions.ts src/app/panel/\(protected\)/equipo/\[id\]/page.tsx
git commit -m "feat(panel): límites de fecha razonables en ausencias (pasado, 90 días, 2 años, solape)"
```

---

## Task 2: Paginación en `/panel/clientes`

**Files:**
- Create: `src/lib/pagination.ts`
- Modify: `src/lib/panel/customers-service.ts`
- Modify: `src/lib/panel/customers-service.test.ts`
- Modify: `src/app/panel/(protected)/clientes/page.tsx`

**Interfaces:**
- Consumes: nada de otras tareas de este plan.
- Produces: `src/lib/pagination.ts` exporta `PAGE_SIZE = 20`, `PaginatedResult<T>` (`{ items: T[]; hasNextPage: boolean; hasPreviousPage: boolean }`) y `paginationMeta(page: number, totalCount: number): { safePage: number; hasNextPage: boolean; hasPreviousPage: boolean }`. `listCustomersForBusiness(prisma, businessId, page?: number)` ahora devuelve `Promise<PaginatedResult<CustomerListItem>>` (antes devolvía `CustomerListItem[]` directamente). Task 3 reutiliza `src/lib/pagination.ts`.

- [ ] **Step 1: Crear el helper de paginación**

Crea `src/lib/pagination.ts`:

```ts
export const PAGE_SIZE = 20;

export interface PaginatedResult<T> {
  items: T[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function paginationMeta(page: number, totalCount: number): { safePage: number; hasNextPage: boolean; hasPreviousPage: boolean } {
  const safePage = Math.max(1, Math.floor(page) || 1);
  return {
    safePage,
    hasPreviousPage: safePage > 1,
    hasNextPage: safePage * PAGE_SIZE < totalCount,
  };
}
```

- [ ] **Step 2: Escribir los tests que fallan para la paginación de clientes**

En `src/lib/panel/customers-service.test.ts`, sustituye el `describe('listCustomersForBusiness', ...)` existente (líneas 31-43 del archivo actual) por:

```ts
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
```

- [ ] **Step 3: Ejecutar los tests y verificar que fallan**

Run: `pnpm exec vitest run src/lib/panel/customers-service.test.ts`
Expected: FAIL — `result.items` es `undefined` porque `listCustomersForBusiness` todavía devuelve un array plano.

- [ ] **Step 4: Paginar `listCustomersForBusiness`**

En `src/lib/panel/customers-service.ts`, añade el import y sustituye la función `listCustomersForBusiness`:

```ts
import type { PrismaClient, Customer, BlacklistEntry } from '@prisma/client';
import { PAGE_SIZE, paginationMeta, type PaginatedResult } from '../pagination';

export interface CustomerListItem extends Customer {
  appointmentCount: number;
  lastAppointmentStart: Date | null;
  blacklisted: boolean;
}

export async function listCustomersForBusiness(
  prisma: PrismaClient,
  businessId: string,
  page: number = 1
): Promise<PaginatedResult<CustomerListItem>> {
  const { safePage, hasNextPage, hasPreviousPage } = paginationMeta(page, await prisma.customer.count({ where: { businessId } }));

  const [customers, blacklistEntries] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId },
      include: { appointments: { select: { start: true } } },
      orderBy: { name: 'asc' },
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.blacklistEntry.findMany({ where: { businessId } }),
  ]);

  const items = customers.map((customer) => {
    const starts = customer.appointments.map((a) => a.start.getTime());
    // entry.phone/email se comprueban como truthy ANTES de comparar: así un
    // customer.phone === null nunca "empareja" con una entrada de blacklist
    // que también tenga phone === null pero sea de otro cliente distinto.
    const blacklisted = blacklistEntries.some(
      (entry) => (entry.phone && entry.phone === customer.phone) || (entry.email && entry.email === customer.email)
    );
    return {
      ...customer,
      appointmentCount: starts.length,
      lastAppointmentStart: starts.length > 0 ? new Date(Math.max(...starts)) : null,
      blacklisted,
    };
  });

  return { items, hasNextPage, hasPreviousPage };
}
```

(El resto del archivo — `CustomerDetail`, `buildContactFilters`, `getCustomerDetail`, blacklist — no cambia.)

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `pnpm exec vitest run src/lib/panel/customers-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Actualizar la página para paginar y mostrar Anterior/Siguiente**

Reemplaza el contenido completo de `src/app/panel/(protected)/clientes/page.tsx`:

```tsx
import Link from 'next/link';
import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { listCustomersForBusiness } from '@/lib/panel/customers-service';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { businessId } = await requirePanelSession();
  const { page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);
  const { items: customers, hasNextPage, hasPreviousPage } = await listCustomersForBusiness(prisma, businessId, currentPage);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Clientes</h1>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Teléfono</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Citas</th>
              <th className="px-4 py-2">Última cita</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <Link href={`/panel/clientes/${customer.id}`} className="font-medium text-slate-900 underline">
                    {customer.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{customer.phone ?? '—'}</td>
                <td className="px-4 py-2">{customer.email ?? '—'}</td>
                <td className="px-4 py-2">{customer.appointmentCount}</td>
                <td className="px-4 py-2">{customer.lastAppointmentStart ? formatAppointmentDateTime(customer.lastAppointmentStart) : '—'}</td>
                <td className="px-4 py-2">
                  {customer.blacklisted ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Bloqueado</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Todavía no hay clientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        {hasPreviousPage ? (
          <Link href={`/panel/clientes?page=${currentPage - 1}`} className="text-slate-600 underline">
            Anterior
          </Link>
        ) : (
          <span className="text-slate-300">Anterior</span>
        )}
        <span className="text-slate-500">Página {currentPage}</span>
        {hasNextPage ? (
          <Link href={`/panel/clientes?page=${currentPage + 1}`} className="text-slate-600 underline">
            Siguiente
          </Link>
        ) : (
          <span className="text-slate-300">Siguiente</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verificar tipos, lint y build**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pagination.ts src/lib/panel/customers-service.ts src/lib/panel/customers-service.test.ts src/app/panel/\(protected\)/clientes/page.tsx
git commit -m "feat(panel): paginación de 20 en 20 en /panel/clientes"
```

---

## Task 3: Paginación en `/admin/negocios`

**Files:**
- Modify: `src/lib/admin/platform-business-service.ts`
- Modify: `src/lib/admin/platform-business-service.test.ts`
- Modify: `src/app/admin/(protected)/negocios/page.tsx`

**Interfaces:**
- Consumes: `PAGE_SIZE`, `PaginatedResult<T>`, `paginationMeta` de `src/lib/pagination.ts` (Task 2).
- Produces: `listPlatformBusinesses(prisma, page?: number)` ahora devuelve `Promise<PaginatedResult<PlatformBusinessSummary>>` (antes `PlatformBusinessSummary[]`). Task 5 vuelve a modificar `src/app/admin/(protected)/negocios/page.tsx` por encima de esta versión — no es un conflicto, son ediciones secuenciales.

- [ ] **Step 1: Escribir el test que falla para la paginación de negocios**

En `src/lib/admin/platform-business-service.test.ts`, sustituye el `describe('listPlatformBusinesses', ...)` existente (al final del archivo) por:

```ts
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

    const result = await listPlatformBusinesses(prisma);

    expect(result.items.map((b) => b.id)).toEqual([second.business.id, first.business.id]);
  });

  it('pagina de 20 en 20 y calcula hasNextPage/hasPreviousPage', async () => {
    const inviter = new FakeOwnerInviter();
    const before = await prisma.business.count();
    for (let i = 0; i < 25; i++) {
      await createPlatformBusiness(prisma, inviter, {
        ...VALID_INPUT,
        slug: `negocio-paginado-${i}`,
        businessEmail: null,
        ownerEmail: `dueno-paginado-${i}@example.com`,
      });
    }
    const total = before + 25;

    const page1 = await listPlatformBusinesses(prisma, 1);
    expect(page1.items).toHaveLength(20);
    expect(page1.hasPreviousPage).toBe(false);
    expect(page1.hasNextPage).toBe(true);

    const lastPage = Math.ceil(total / 20);
    const pageLast = await listPlatformBusinesses(prisma, lastPage);
    expect(pageLast.hasNextPage).toBe(false);
    expect(pageLast.hasPreviousPage).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm exec vitest run src/lib/admin/platform-business-service.test.ts`
Expected: FAIL — `result.items` es `undefined`.

- [ ] **Step 3: Paginar `listPlatformBusinesses`**

Reemplaza el contenido completo de `src/lib/admin/platform-business-service.ts`:

```ts
import { Prisma, BusinessType } from '@prisma/client';
import type { PrismaClient, Business } from '@prisma/client';
import type { OwnerInviter, OwnerInvitationLink } from './owner-inviter';
import { PAGE_SIZE, paginationMeta, type PaginatedResult } from '../pagination';

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

export async function listPlatformBusinesses(prisma: PrismaClient, page: number = 1): Promise<PaginatedResult<PlatformBusinessSummary>> {
  const { safePage, hasNextPage, hasPreviousPage } = paginationMeta(page, await prisma.business.count());
  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: 'desc' },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return {
    items: businesses.map((b) => ({ id: b.id, slug: b.slug, name: b.name, active: b.active, createdAt: b.createdAt })),
    hasNextPage,
    hasPreviousPage,
  };
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

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm exec vitest run src/lib/admin/platform-business-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Actualizar la página para paginar y mostrar Anterior/Siguiente**

Reemplaza el contenido completo de `src/app/admin/(protected)/negocios/page.tsx`:

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
  searchParams: Promise<{ aviso?: string; page?: string }>;
}) {
  await requireAdminSession();
  const { aviso, page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);
  const { items: businesses, hasNextPage, hasPreviousPage } = await listPlatformBusinesses(prisma, currentPage);

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

      <div className="flex items-center justify-between text-sm">
        {hasPreviousPage ? (
          <Link href={`/admin/negocios?page=${currentPage - 1}`} className="text-slate-600 underline">
            Anterior
          </Link>
        ) : (
          <span className="text-slate-300">Anterior</span>
        )}
        <span className="text-slate-500">Página {currentPage}</span>
        {hasNextPage ? (
          <Link href={`/admin/negocios?page=${currentPage + 1}`} className="text-slate-600 underline">
            Siguiente
          </Link>
        ) : (
          <span className="text-slate-300">Siguiente</span>
        )}
      </div>

      <CreateBusinessForm />
    </div>
  );
}
```

- [ ] **Step 6: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/platform-business-service.ts src/lib/admin/platform-business-service.test.ts src/app/admin/\(protected\)/negocios/page.tsx
git commit -m "feat(admin): paginación de 20 en 20 en /admin/negocios"
```

---

## Task 4: Señal de invitación completada + `resendOwnerInvitation` (capa de servicio)

**Files:**
- Modify: `src/lib/admin/owner-inviter.ts`
- Modify: `src/lib/admin/platform-business-service.ts`
- Modify: `src/lib/admin/platform-business-service.test.ts`

**Interfaces:**
- Consumes: nada de otras tareas de este plan (usa `Business`, `OwnerInviter` ya existentes).
- Produces: `OwnerInviter` gana dos métodos: `getInvitationStatus(userId: string): Promise<OwnerInvitationStatus | null>` y `markInvitationCompleted(userId: string): Promise<void>`, donde `OwnerInvitationStatus = { email: string; completed: boolean }`. Nuevas funciones en `platform-business-service.ts`: `resendOwnerInvitation(prisma, ownerInviter, businessId): Promise<ResendOwnerInvitationResult>` (`ResendOwnerInvitationResult = { ok: true; business: Business; ownerEmail: string; invitationTokenHash: string } | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_COMPLETED' | 'OWNER_INVITE_FAILED' }`) y `getOwnerInvitationCompletionMap(prisma, ownerInviter, businessIds: string[]): Promise<Map<string, boolean>>`. Task 5 consume ambas.

- [ ] **Step 1: Ampliar la interfaz `OwnerInviter` y su implementación real**

Reemplaza el contenido completo de `src/lib/admin/owner-inviter.ts`:

```ts
import { getSupabaseAdminAuthClient } from '@/lib/supabase/admin';

export interface OwnerInvitationLink {
  userId: string;
  hashedToken: string;
}

export interface OwnerInvitationStatus {
  email: string;
  completed: boolean;
}

// Alcance de plataforma (no tenant-scoped): genera el enlace de invitación
// real de Supabase Auth para el dueño de un negocio nuevo, usado solo desde
// /admin. Se inyecta como interfaz (mismo patrón que EmailSender en
// src/lib/email/types.ts) para poder testear createPlatformBusiness
// (Tarea 12) con un FakeOwnerInviter sin llamar a la Admin API real — igual
// que el resto del proyecto evita golpear Supabase Auth desde Vitest (ver
// src/lib/seed/demo-owner.ts: ensureDemoOwnerAuthUser no tiene test directo,
// solo seedDemoOwnerMembership y getDemoOwnerCredentials).
//
// getInvitationStatus/markInvitationCompleted usan una señal PROPIA
// (app_metadata.invitationCompletedAt) en vez de los campos nativos de
// Supabase (last_sign_in_at/confirmed_at): verifyOtp de tipo invite ya
// autentica al usuario y puede tocar esos campos ANTES de que updateUser
// fije la contraseña — que es justo el caso límite que esta señal permite
// recuperar desde /admin (ver docs/superpowers/CONTINUAR.md, "No existe
// acción de reenviar invitación").
export interface OwnerInviter {
  generateInviteLink(email: string): Promise<OwnerInvitationLink>;
  getInvitationStatus(userId: string): Promise<OwnerInvitationStatus | null>;
  markInvitationCompleted(userId: string): Promise<void>;
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

  async getInvitationStatus(userId: string): Promise<OwnerInvitationStatus | null> {
    const admin = getSupabaseAdminAuthClient();
    const { data, error } = await admin.getUserById(userId);
    if (error || !data.user) {
      return null;
    }
    return {
      email: data.user.email ?? '',
      completed: Boolean(data.user.app_metadata?.invitationCompletedAt),
    };
  }

  async markInvitationCompleted(userId: string): Promise<void> {
    const admin = getSupabaseAdminAuthClient();
    const { error } = await admin.updateUserById(userId, {
      app_metadata: { invitationCompletedAt: new Date().toISOString() },
    });
    if (error) {
      throw new Error(`No se pudo marcar la invitación como completada para el usuario ${userId}: ${error.message}`);
    }
  }
}

export function getOwnerInviter(): OwnerInviter {
  return new SupabaseOwnerInviter();
}
```

- [ ] **Step 2: Escribir los tests que fallan para `resendOwnerInvitation` y `getOwnerInvitationCompletionMap`**

En `src/lib/admin/platform-business-service.test.ts`, sustituye las clases `FakeOwnerInviter`/`FailingOwnerInviter` y el import de tipos (líneas 1-23 del archivo actual) por:

```ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import {
  listPlatformBusinesses,
  createPlatformBusiness,
  setPlatformBusinessActive,
  resendOwnerInvitation,
  getOwnerInvitationCompletionMap,
  type NewBusinessInput,
} from './platform-business-service';
import type { OwnerInviter, OwnerInvitationLink, OwnerInvitationStatus } from './owner-inviter';

class FakeOwnerInviter implements OwnerInviter {
  calls: string[] = [];
  statuses = new Map<string, OwnerInvitationStatus>();

  async generateInviteLink(email: string): Promise<OwnerInvitationLink> {
    this.calls.push(email);
    return { userId: `fake-user-${email}`, hashedToken: `fake-token-${email}` };
  }

  async getInvitationStatus(userId: string): Promise<OwnerInvitationStatus | null> {
    return this.statuses.get(userId) ?? null;
  }

  async markInvitationCompleted(userId: string): Promise<void> {
    const existing = this.statuses.get(userId);
    if (existing) {
      this.statuses.set(userId, { ...existing, completed: true });
    }
  }
}

class FailingOwnerInviter implements OwnerInviter {
  async generateInviteLink(): Promise<OwnerInvitationLink> {
    throw new Error('fallo de red simulado');
  }

  async getInvitationStatus(): Promise<OwnerInvitationStatus | null> {
    return null;
  }

  async markInvitationCompleted(): Promise<void> {}
}
```

Añade estos dos `describe` nuevos al final de `src/lib/admin/platform-business-service.test.ts` (después del `describe('listPlatformBusinesses', ...)` de la Tarea 3):

```ts
describe('resendOwnerInvitation', () => {
  it('reenvía la invitación si el dueño no ha completado el alta', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');
    inviter.statuses.set(created.ownerUserId, { email: VALID_INPUT.ownerEmail, completed: false });
    inviter.calls = [];

    const result = await resendOwnerInvitation(prisma, inviter, created.business.id);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('esperaba ok:true');
    expect(result.ownerEmail).toBe(VALID_INPUT.ownerEmail);
    expect(inviter.calls).toEqual([VALID_INPUT.ownerEmail]);
  });

  it('devuelve ALREADY_COMPLETED si el dueño ya fijó su contraseña', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');
    inviter.statuses.set(created.ownerUserId, { email: VALID_INPUT.ownerEmail, completed: true });

    const result = await resendOwnerInvitation(prisma, inviter, created.business.id);

    expect(result).toEqual({ ok: false, reason: 'ALREADY_COMPLETED' });
  });

  it('devuelve NOT_FOUND si el negocio no existe', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await resendOwnerInvitation(prisma, inviter, 'negocio-inexistente');

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('devuelve OWNER_INVITE_FAILED si el reenvío falla', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');
    inviter.statuses.set(created.ownerUserId, { email: VALID_INPUT.ownerEmail, completed: false });
    const failingInviter: OwnerInviter = {
      generateInviteLink: async () => {
        throw new Error('fallo de red simulado');
      },
      getInvitationStatus: () => inviter.getInvitationStatus(created.ownerUserId),
      markInvitationCompleted: async () => {},
    };

    const result = await resendOwnerInvitation(prisma, failingInviter, created.business.id);

    expect(result).toEqual({ ok: false, reason: 'OWNER_INVITE_FAILED' });
  });
});

describe('getOwnerInvitationCompletionMap', () => {
  it('devuelve el estado de finalización de cada negocio por su dueño', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');
    inviter.statuses.set(created.ownerUserId, { email: VALID_INPUT.ownerEmail, completed: true });

    const map = await getOwnerInvitationCompletionMap(prisma, inviter, [created.business.id]);

    expect(map.get(created.business.id)).toBe(true);
  });

  it('trata como completada (oculta el botón) si no se puede resolver el estado', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');
    // sin registrar el status en el fake => getInvitationStatus devuelve null

    const map = await getOwnerInvitationCompletionMap(prisma, inviter, [created.business.id]);

    expect(map.get(created.business.id)).toBe(true);
  });
});
```

- [ ] **Step 3: Ejecutar los tests y verificar que fallan**

Run: `pnpm exec vitest run src/lib/admin/platform-business-service.test.ts`
Expected: FAIL — `resendOwnerInvitation`/`getOwnerInvitationCompletionMap` no existen todavía (error de compilación TypeScript también cuenta como fallo en este paso).

- [ ] **Step 4: Implementar `resendOwnerInvitation` y `getOwnerInvitationCompletionMap`**

Añade al final de `src/lib/admin/platform-business-service.ts` (después de `setPlatformBusinessActive`):

```ts
export type ResendOwnerInvitationResult =
  | { ok: true; business: Business; ownerEmail: string; invitationTokenHash: string }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_COMPLETED' | 'OWNER_INVITE_FAILED' };

// Recuperación manual para el caso límite documentado en CONTINUAR.md
// (verifyOtp con éxito pero updateUser falla justo después): reutiliza
// ownerInviter.generateInviteLink, el mismo mecanismo que el alta inicial,
// generando un hashed_token nuevo. `getInvitationStatus` es quien decide si
// procede (ALREADY_COMPLETED si el dueño ya fijó su contraseña).
export async function resendOwnerInvitation(
  prisma: PrismaClient,
  ownerInviter: OwnerInviter,
  businessId: string
): Promise<ResendOwnerInvitationResult> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  const membership = await prisma.membership.findFirst({ where: { businessId, role: 'OWNER' } });
  if (!membership) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  const status = await ownerInviter.getInvitationStatus(membership.userId);
  if (!status) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  if (status.completed) {
    return { ok: false, reason: 'ALREADY_COMPLETED' };
  }

  try {
    const invite = await ownerInviter.generateInviteLink(status.email);
    return { ok: true, business, ownerEmail: status.email, invitationTokenHash: invite.hashedToken };
  } catch (error) {
    console.error('[admin] fallo al reenviar la invitación al dueño', { businessId, error });
    return { ok: false, reason: 'OWNER_INVITE_FAILED' };
  }
}

// Si no se puede resolver el estado de un negocio (sin Membership OWNER, o
// la Admin API no devuelve el usuario) se trata como "completada": oculta
// el botón de reenviar en vez de mostrarlo para un caso que no se sabe
// arreglar desde la UI (evita un botón que siempre fallaría).
export async function getOwnerInvitationCompletionMap(
  prisma: PrismaClient,
  ownerInviter: OwnerInviter,
  businessIds: string[]
): Promise<Map<string, boolean>> {
  const memberships = await prisma.membership.findMany({
    where: { businessId: { in: businessIds }, role: 'OWNER' },
  });
  const entries = await Promise.all(
    memberships.map(async (membership) => {
      const status = await ownerInviter.getInvitationStatus(membership.userId);
      return [membership.businessId, status?.completed ?? true] as const;
    })
  );
  const map = new Map(entries);
  for (const businessId of businessIds) {
    if (!map.has(businessId)) {
      map.set(businessId, true);
    }
  }
  return map;
}
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `pnpm exec vitest run src/lib/admin/platform-business-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Verificar tipos y lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/owner-inviter.ts src/lib/admin/platform-business-service.ts src/lib/admin/platform-business-service.test.ts
git commit -m "feat(admin): señal de invitación completada + resendOwnerInvitation (capa de servicio)"
```

---

## Task 5: Wiring de "Reenviar invitación" en `/panel/invitacion` y `/admin/negocios`

**Files:**
- Modify: `src/app/panel/invitacion/actions.ts`
- Modify: `src/app/admin/(protected)/negocios/actions.ts`
- Modify: `src/app/admin/(protected)/negocios/page.tsx`

**Interfaces:**
- Consumes: `getOwnerInviter()`, `resendOwnerInvitation`, `getOwnerInvitationCompletionMap` (Task 4); `listPlatformBusinesses` paginado (Task 3); `sendOwnerInvitationEmail`, `getEmailSender`, `getAppBaseUrl` (ya existentes, usados igual que en `createBusinessAction`).
- Produces: nada consumido por otras tareas de este plan (última tarea).

- [ ] **Step 1: Marcar la invitación como completada al fijar la contraseña**

Reemplaza el contenido completo de `src/app/panel/invitacion/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getOwnerInviter } from '@/lib/admin/owner-inviter';

export interface AcceptInvitationResult {
  ok: false;
  message: string;
}

const MIN_PASSWORD_LENGTH = 8;

// Mecánica del flujo de invitación (ver también src/lib/admin/owner-inviter.ts
// para por qué no se usa `action_link`):
// Esta Server Action verifica el `token_hash` con
// `supabase.auth.verifyOtp({ token_hash, type: 'invite' })`. TIENE que
// ejecutarse en una Server Action (o Route Handler), NUNCA en un Server
// Component: createSupabaseServerClient() (src/lib/supabase/server.ts)
// envuelve la escritura de cookies en un try/catch silencioso porque
// Next.js prohíbe escribir cookies desde un Server Component — si
// verifyOtp se llamara desde page.tsx, la sesión se establecería en
// memoria para ese único render pero el navegador nunca recibiría la
// cookie, y la siguiente petición (este mismo Server Action) no vería
// ninguna sesión.
//
// IMPORTANTE (seguridad): verifyOtp se llama SIEMPRE, incluso si ya hay una
// sesión activa (p. ej. una pestaña de /panel abierta, o cualquiera con un
// token_hash inválido/manipulado). No existe atajo que se salte la
// verificación cuando `getUser()` ya devuelve un usuario: sin esto,
// cualquiera con una sesión de /panel vigente podría visitar
// /panel/invitacion con un token_hash arbitrario y cambiar su propia
// contraseña sin volver a autenticarse — convirtiendo esta página en un
// endpoint de cambio de contraseña sin verificación real. Si `token_hash`
// es inválido o ha caducado, verifyOtp devuelve error y no se llega a
// updateUser.
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

  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: input.tokenHash, type: 'invite' });
  if (verifyError || !verifyData.user) {
    return {
      ok: false,
      message: 'El enlace de invitación no es válido o ha caducado. Pide al super-admin que te envíe uno nuevo.',
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: input.password });
  if (updateError) {
    return { ok: false, message: 'No se pudo establecer la contraseña. Inténtalo de nuevo.' };
  }

  // Señal propia para que /admin/negocios sepa que ya no hace falta poder
  // reenviar la invitación (ver owner-inviter.ts). Best-effort: si falla, no
  // bloquea al dueño (ya tiene contraseña y sesión funcionando), solo deja
  // el botón "Reenviar invitación" visible de más en /admin hasta que se
  // reintente.
  try {
    await getOwnerInviter().markInvitationCompleted(verifyData.user.id);
  } catch (error) {
    console.error('[panel] no se pudo marcar la invitación como completada', { userId: verifyData.user.id, error });
  }

  redirect('/panel');
}
```

- [ ] **Step 2: Añadir la Server Action `resendOwnerInvitationAction`**

En `src/app/admin/(protected)/negocios/actions.ts`, añade el import de `resendOwnerInvitation` y la función nueva al final del archivo:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdminSession } from '@/lib/admin/session';
import {
  createPlatformBusiness,
  setPlatformBusinessActive,
  resendOwnerInvitation,
  type NewBusinessInput,
} from '@/lib/admin/platform-business-service';
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

// Reenvía la invitación (nuevo hashed_token + email) al dueño de un negocio
// que todavía no ha completado su alta (ver resendOwnerInvitation). Igual
// que setBusinessActiveAction, es un botón suelto sin campos que perder:
// sigue el patrón `?aviso=`.
export async function resendOwnerInvitationAction(businessId: string): Promise<void> {
  await requireAdminSession();
  const result = await resendOwnerInvitation(prisma, getOwnerInviter(), businessId);
  if (!result.ok) {
    const aviso = result.reason === 'ALREADY_COMPLETED' ? 'invitacion-ya-completada' : 'accion-no-aplicada';
    redirect(`/admin/negocios?aviso=${aviso}`);
  }

  await sendOwnerInvitationEmail(getEmailSender(), {
    business: { name: result.business.name, accentColor: result.business.accentColor, logoUrl: result.business.logoUrl },
    ownerEmail: result.ownerEmail,
    invitationUrl: `${getAppBaseUrl()}/panel/invitacion?token_hash=${result.invitationTokenHash}`,
  });

  redirect('/admin/negocios?aviso=invitacion-reenviada');
}
```

- [ ] **Step 3: Mostrar el botón "Reenviar invitación" y los avisos nuevos en la página**

Reemplaza el contenido completo de `src/app/admin/(protected)/negocios/page.tsx`:

```tsx
import Link from 'next/link';
import { requireAdminSession } from '@/lib/admin/session';
import { prisma } from '@/lib/db';
import { listPlatformBusinesses, getOwnerInvitationCompletionMap } from '@/lib/admin/platform-business-service';
import { getOwnerInviter } from '@/lib/admin/owner-inviter';
import { setBusinessActiveAction, resendOwnerInvitationAction } from './actions';
import { CreateBusinessForm } from './CreateBusinessForm';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date
  );
}

const AVISO_MESSAGES: Record<string, string> = {
  'accion-no-aplicada': 'Esa acción ya no se puede aplicar: el negocio cambió mientras tanto. La lista se ha actualizado.',
  'invitacion-reenviada': 'Invitación reenviada al dueño por email.',
  'invitacion-ya-completada': 'Ese dueño ya había completado su alta: no hacía falta reenviar la invitación.',
};

export default async function AdminNegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; page?: string }>;
}) {
  await requireAdminSession();
  const { aviso, page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);
  const { items: businesses, hasNextPage, hasPreviousPage } = await listPlatformBusinesses(prisma, currentPage);
  const completionMap = await getOwnerInvitationCompletionMap(
    prisma,
    getOwnerInviter(),
    businesses.map((b) => b.id)
  );

  const avisoMessage = aviso ? AVISO_MESSAGES[aviso] : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Negocios</h1>

      {avisoMessage && (
        <div className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{avisoMessage}</span>
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
                  <div className="flex items-center gap-3">
                    <form action={setBusinessActiveAction.bind(null, business.id, !business.active)}>
                      <button type="submit" className="text-xs text-slate-500 underline">
                        {business.active ? 'Suspender' : 'Activar'}
                      </button>
                    </form>
                    {completionMap.get(business.id) === false && (
                      <form action={resendOwnerInvitationAction.bind(null, business.id)}>
                        <button type="submit" className="text-xs text-slate-500 underline">
                          Reenviar invitación
                        </button>
                      </form>
                    )}
                  </div>
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

      <div className="flex items-center justify-between text-sm">
        {hasPreviousPage ? (
          <Link href={`/admin/negocios?page=${currentPage - 1}`} className="text-slate-600 underline">
            Anterior
          </Link>
        ) : (
          <span className="text-slate-300">Anterior</span>
        )}
        <span className="text-slate-500">Página {currentPage}</span>
        {hasNextPage ? (
          <Link href={`/admin/negocios?page=${currentPage + 1}`} className="text-slate-600 underline">
            Siguiente
          </Link>
        ) : (
          <span className="text-slate-300">Siguiente</span>
        )}
      </div>

      <CreateBusinessForm />
    </div>
  );
}
```

- [ ] **Step 4: Verificar tipos, lint y suite completa**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: sin errores, todos los tests en verde (los de las Tareas 1-4 incluidos).

- [ ] **Step 5: Verificación manual end-to-end contra Supabase local**

Este paso comprueba un supuesto técnico que ningún test unitario cubre: que `generateLink({type:'invite', email})` de Supabase funciona correctamente al llamarse una SEGUNDA vez para el mismo email de un usuario ya invitado pero sin confirmar. Con el entorno local levantado (`pnpm exec supabase start`, `pnpm dev`):

1. Entra en `/admin` como super-admin demo y da de alta un negocio nuevo con un email de dueño de prueba.
2. Ve a `/admin/negocios`: confirma que aparece el botón "Reenviar invitación" junto a ese negocio.
3. Pulsa "Reenviar invitación". Confirma que redirige con el aviso "Invitación reenviada al dueño por email." y que en la consola del servidor (`ConsoleEmailSender`, sin `RESEND_API_KEY`) aparece un nuevo email con un `token_hash` DISTINTO al de la invitación original.
4. Visita `/panel/invitacion?token_hash=<el nuevo token>` y completa el alta de contraseña. Confirma que funciona igual que con el token original.
5. Vuelve a `/admin/negocios`: confirma que el botón "Reenviar invitación" ya NO aparece para ese negocio (la señal `invitationCompletedAt` se marcó).

Si el paso 3 falla (Supabase rechaza una segunda invitación al mismo email con un error tipo "user already registered"), es un hallazgo a resolver antes de dar la tarea por completa — no hay fallback ya escrito en este plan para ese caso porque toda la evidencia disponible (comportamiento estándar de GoTrue para invitaciones no confirmadas) indica que no debería ocurrir.

- [ ] **Step 6: Commit**

```bash
git add src/app/panel/invitacion/actions.ts src/app/admin/\(protected\)/negocios/actions.ts src/app/admin/\(protected\)/negocios/page.tsx
git commit -m "feat(admin): reenviar invitación de dueño desde /admin/negocios"
```

---

## Verificación final (tras las 5 tareas)

- [ ] Run: `pnpm test` — 140+ tests existentes más los nuevos, todos en verde.
- [ ] Run: `pnpm lint`
- [ ] Run: `pnpm exec tsc --noEmit`
- [ ] Run: `pnpm build`
- [ ] Run: `pnpm exec playwright test` — confirma que no se ha roto `admin-flow.spec.ts` (usa `/admin/negocios`) ni `panel-approval.spec.ts` (usa `/panel/equipo` indirectamente vía citas... revisar si toca TimeOff; si no lo toca, basta con que compile y pase igual que antes).
- [ ] Actualizar `docs/superpowers/CONTINUAR.md`: mover las tres entradas resueltas ("No existe acción de reenviar invitación", "Sin paginación en /panel/clientes", "Sin paginación en /admin/negocios", las ausencias sin límites de fecha razonables) fuera de "Minors conocidos" o marcarlas como resueltas, y añadir una nota de qué se hizo y cuándo.
