# Appoint — Fase 3 (Página pública) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la página pública de Appoint: el escaparate `/{slug}` con el tema visual del negocio, la hoja inferior (bottom sheet) de reserva con transiciones GSAP, las Server Actions que envuelven el motor de `src/lib/booking/` con resolución multi-tenant por slug, las páginas `/confirmar/{token}` y `/cita/{token}`, y un test Playwright end-to-end del flujo reservar → confirmar → cancelar.

**Architecture:** Toda la lógica de negocio nueva (temas, formateo, deduplicación de huecos, mensajes de error, máquina de estados de la hoja de reserva) vive en `src/lib/theme/` y `src/lib/public/` como funciones puras o funciones que reciben `PrismaClient` como parámetro (igual que `src/lib/booking/`), cubiertas por Vitest con la misma disciplina TDD que las Fases 1-2. La UI vive en un route group `src/app/(public)/` con sus propias fuentes (`next/font/google`) y variables CSS de tema calculadas en el servidor (sin FOUC): cada página fija esas variables con un `style` inline sobre un contenedor, y los componentes leen `var(--color-accent)`, `var(--font-heading)`, etc. — nunca colores/fuentes fijos. Las Server Actions (`'use server'`) son wrappers finos que resuelven `slug → businessId`, delegan en los servicios de `src/lib/public/` y traducen los `reason` tipados del motor a mensajes en español. El flujo completo se valida con un test Playwright que corre contra la base de datos de test (`TEST_DATABASE_URL`), reutilizando el patrón de `globalSetup` + truncado ya usado por Vitest.

**Tech Stack:** Next.js 15.5.20 (App Router, Server Components + Server Actions), TypeScript strict, Tailwind CSS v4, Prisma 6.19.3 sobre PostgreSQL de Supabase, Vitest 4 (TDD, Postgres real), GSAP + `@gsap/react` (`useGSAP`) para las transiciones de la hoja inferior, Playwright para el e2e, `date-fns`/`date-fns-tz` para fechas, pnpm.

## Global Constraints

- **Idioma:** toda la UI y los textos van en español. Los identificadores de código van en inglés.
- **Multi-tenancy:** toda consulta a tablas de negocio filtra por `businessId` en la capa de aplicación (no hay RLS). Las páginas públicas solo conocen el `slug`; cualquier servicio de `src/lib/public/` que reciba un `slug` debe resolverlo a `businessId` internamente antes de tocar `Service`/`Employee`/`Appointment` — nunca debe ser posible leer o reservar en un negocio distinto al del slug de la URL.
- **Theming:** las páginas públicas leen variables CSS del tema del negocio (3 presets — Boutique editorial por defecto, crema/terracota `#B25539`, serif; Vibrante; Minimal sereno). Prohibido hardcodear colores o familias de fuente en componentes públicos: todo pasa por `getThemeCssVariables()` y las variables `--color-*`, `--font-*`, `--radius-theme`, `--shadow-theme`. Aplica solo a páginas públicas.
- **Zona horaria:** las citas se almacenan en UTC; los negocios son españoles (`Europe/Madrid`). Toda conversión pasa por `date-fns-tz` y las utilidades ya existentes en `src/lib/booking/timezone.ts` (`getLocalDateString`, `localMinutesToUtc`, `addDaysToLocalDateString`, `BUSINESS_TIMEZONE`). No usar `Intl.DateTimeFormat`/`Intl.NumberFormat` con locale para textos que deban ser deterministas en tests Node en Windows (datos ICU incompletos): el formateo de fecha/precio/duración en `src/lib/public/format-datetime.ts` se implementa a mano.
- **TDD obligatorio** en toda la lógica de negocio nueva (temas, deduplicación de huecos, mensajes de error, máquina de estados, servicios que envuelven el motor): escribe el test en rojo antes que la implementación. Los tests que tocan Prisma corren contra Postgres real (`TEST_DATABASE_URL`, `appoint_test`) igual que los tests de Fase 2: nunca mockees `PrismaClient`.
- **Contrato de `createAppointment`** (`src/lib/booking/create-appointment.ts`): devuelve `{ ok: true; appointment } | { ok: false; reason }` con `reason` uno de `RATE_LIMITED | BLACKLISTED | CUSTOMER_LIMIT_REACHED | CUSTOMER_OVERLAP | EMPLOYEE_UNAVAILABLE | NO_EMPLOYEE_AVAILABLE | SLOT_TAKEN | CUSTOMER_CONFLICT | BUSINESS_NOT_FOUND | SERVICE_NOT_FOUND`. La UI debe traducir los 10 a mensajes amables en español.
- **Dedupe de huecos:** con "cualquier profesional", `getAvailableSlots` devuelve un slot por empleado para el mismo `start` — la capa de servicios públicos deduplica por `start` antes de que la UI los reciba.
- **`manualApproval`:** el motor no cambia de comportamiento (la cita nace `PENDING` igual en ambos casos); solo cambia el texto de la pantalla de éxito de la hoja de reserva según `business.manualApproval`.
- **Versiones ancladas exactas (sin caret):** todas las dependencias nuevas (`gsap`, `@gsap/react`, `@playwright/test`) se instalan con `--save-exact`. No actualizar versiones ya fijadas (Next 15.5.20, Prisma 6.19.3, etc.) sin decisión explícita.
- **`fileParallelism` desactivado a propósito** en `vitest.config.ts` (BD compartida): no lo reactives.
- Todos los comandos del plan son compatibles con PowerShell/Windows.
- Deuda consciente aceptada del motor (no tocar): TOCTOU en límites anti-fraude fuera de la transacción; `checkRateLimit` acoplado al flujo insertar-antes-de-contar.

---

## Página pública

### Tarea 1: Presets de tema y variables CSS

**Files:**
- Create: `src/lib/theme/theme.ts`
- Test: `src/lib/theme/theme.test.ts`

**Interfaces:**
- Consumes: `ThemePreset` (enum de `@prisma/client`, valores `BOUTIQUE_EDITORIAL | VIBRANT | MINIMAL_SERENE`).
- Produces: `THEME_PRESETS: Record<ThemePreset, ThemeDefinition>`, `getContrastTextColor(hexColor: string): string`, `getThemeCssVariables(business: BusinessThemeInput): ThemeCssVariables` (donde `BusinessThemeInput = { themePreset: ThemePreset; accentColor: string }` y `ThemeCssVariables = Record<string, string>` con las claves `--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-contrast`, `--font-heading`, `--font-body`, `--radius-theme`, `--shadow-theme`). Usado por todas las páginas públicas (Tareas 9, 11-13) y por la Tarea 8 (fuentes que definen `--font-playfair`, `--font-lora`, `--font-poppins`, `--font-inter`, `--font-work-sans`).

> **Nota de diseño (no cubierta literalmente por la spec):** la spec solo detalla colores/tipografía del preset "Boutique editorial" (crema/terracota `#B25539`, serif). Los valores de "Vibrante" y "Minimal sereno" de abajo son una propuesta razonable, no una decisión validada con el usuario — repórtalo como duda de negocio si no ha sido confirmado.

- [ ] **Step 1: Escribir los tests de `getContrastTextColor` y `getThemeCssVariables`**

Crea `src/lib/theme/theme.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getThemeCssVariables, getContrastTextColor, THEME_PRESETS } from './theme';

describe('getContrastTextColor', () => {
  it('devuelve un texto oscuro para colores claros', () => {
    expect(getContrastTextColor('#FFFFFF')).toBe('#1A1A1A');
  });

  it('devuelve un texto claro para colores oscuros', () => {
    expect(getContrastTextColor('#000000')).toBe('#FFFFFF');
  });

  it('devuelve un texto claro para el terracota por defecto de Boutique editorial', () => {
    expect(getContrastTextColor('#B25539')).toBe('#FFFFFF');
  });
});

describe('getThemeCssVariables', () => {
  it('usa los valores del preset Boutique editorial por defecto', () => {
    const vars = getThemeCssVariables({ themePreset: 'BOUTIQUE_EDITORIAL', accentColor: '#B25539' });

    expect(vars['--color-bg']).toBe(THEME_PRESETS.BOUTIQUE_EDITORIAL.backgroundColor);
    expect(vars['--color-accent']).toBe('#B25539');
    expect(vars['--font-heading']).toBe('var(--font-playfair)');
    expect(vars['--font-body']).toBe('var(--font-lora)');
  });

  it('respeta el color de acento personalizado del negocio en vez del de preset', () => {
    const vars = getThemeCssVariables({ themePreset: 'VIBRANT', accentColor: '#00A86B' });

    expect(vars['--color-accent']).toBe('#00A86B');
    expect(vars['--color-accent-contrast']).toBe(getContrastTextColor('#00A86B'));
  });

  it('genera variables para los tres presets sin errores', () => {
    for (const preset of ['BOUTIQUE_EDITORIAL', 'VIBRANT', 'MINIMAL_SERENE'] as const) {
      const vars = getThemeCssVariables({ themePreset: preset, accentColor: THEME_PRESETS[preset].accentColor });
      expect(Object.keys(vars).length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

```powershell
pnpm test theme.test.ts
```

Expected: falla con `Cannot find module './theme'` (el archivo `theme.ts` aún no existe).

- [ ] **Step 3: Implementar `src/lib/theme/theme.ts`**

```typescript
import type { ThemePreset } from '@prisma/client';

export interface ThemeDefinition {
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  headingFontVar: string;
  bodyFontVar: string;
  radius: string;
  shadow: string;
}

export const THEME_PRESETS: Record<ThemePreset, ThemeDefinition> = {
  BOUTIQUE_EDITORIAL: {
    backgroundColor: '#FAF6F0',
    surfaceColor: '#FFFFFF',
    textColor: '#2B211B',
    mutedTextColor: '#6B5D53',
    accentColor: '#B25539',
    headingFontVar: '--font-playfair',
    bodyFontVar: '--font-lora',
    radius: '0.25rem',
    shadow: '0 12px 32px -16px rgba(43, 33, 27, 0.35)',
  },
  VIBRANT: {
    backgroundColor: '#FFF7ED',
    surfaceColor: '#FFFFFF',
    textColor: '#1F1147',
    mutedTextColor: '#5B4B8A',
    accentColor: '#E23E7A',
    headingFontVar: '--font-poppins',
    bodyFontVar: '--font-inter',
    radius: '1.25rem',
    shadow: '0 16px 40px -12px rgba(226, 62, 122, 0.45)',
  },
  MINIMAL_SERENE: {
    backgroundColor: '#F7F8F7',
    surfaceColor: '#FFFFFF',
    textColor: '#20281F',
    mutedTextColor: '#5D6B5A',
    accentColor: '#5C7A66',
    headingFontVar: '--font-work-sans',
    bodyFontVar: '--font-work-sans',
    radius: '0.5rem',
    shadow: '0 8px 24px -12px rgba(32, 40, 31, 0.18)',
  },
};

export function getContrastTextColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1A1A1A' : '#FFFFFF';
}

export interface BusinessThemeInput {
  themePreset: ThemePreset;
  accentColor: string;
}

export type ThemeCssVariables = Record<string, string>;

export function getThemeCssVariables(business: BusinessThemeInput): ThemeCssVariables {
  const preset = THEME_PRESETS[business.themePreset];
  const accentColor = business.accentColor || preset.accentColor;

  return {
    '--color-bg': preset.backgroundColor,
    '--color-surface': preset.surfaceColor,
    '--color-text': preset.textColor,
    '--color-text-muted': preset.mutedTextColor,
    '--color-accent': accentColor,
    '--color-accent-contrast': getContrastTextColor(accentColor),
    '--font-heading': `var(${preset.headingFontVar})`,
    '--font-body': `var(${preset.bodyFontVar})`,
    '--radius-theme': preset.radius,
    '--shadow-theme': preset.shadow,
  };
}
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

```powershell
pnpm test theme.test.ts
```

Expected: `6 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/theme/theme.ts src/lib/theme/theme.test.ts
git commit -m "feat(theme): presets de tema y variables CSS por negocio"
```

---

### Tarea 2: Utilidades públicas de formato (fecha, precio, duración, opciones de día)

**Files:**
- Create: `src/lib/public/format-datetime.ts`
- Test: `src/lib/public/format-datetime.test.ts`

**Interfaces:**
- Consumes: `getLocalDateString`, `addDaysToLocalDateString`, `BUSINESS_TIMEZONE` de `@/lib/booking/timezone`.
- Produces: `formatAppointmentDateTime(utcDate: Date): string`, `formatSlotTime(utcDate: Date): string` (hora `HH:mm` en `Europe/Madrid`, sin `Intl`), `formatPriceCents(cents: number): string`, `formatDurationMinutes(minutes: number): string`, `buildDayOptions(now: Date, maxDays: number): DayOption[]` (donde `DayOption = { localDate: string; label: string }`). Usados por los componentes de la hoja de reserva (Tareas 9-10) y las páginas de confirmación/cancelación (Tareas 12-13).

- [ ] **Step 1: Escribir los tests**

Crea `src/lib/public/format-datetime.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatAppointmentDateTime,
  formatSlotTime,
  formatPriceCents,
  formatDurationMinutes,
  buildDayOptions,
} from './format-datetime';

describe('formatAppointmentDateTime', () => {
  it('formatea una fecha UTC en hora local de Madrid en español', () => {
    const utcDate = new Date('2026-07-14T08:00:00.000Z'); // martes, 10:00 en Madrid (verano, UTC+2)
    expect(formatAppointmentDateTime(utcDate)).toBe('martes, 14 de julio a las 10:00');
  });
});

describe('formatSlotTime', () => {
  it('formatea una hora UTC de mañana como HH:mm en hora de Madrid', () => {
    expect(formatSlotTime(new Date('2026-07-14T08:00:00.000Z'))).toBe('10:00'); // verano, UTC+2
  });

  it('formatea una hora UTC de tarde con relleno de ceros', () => {
    expect(formatSlotTime(new Date('2026-07-14T14:05:00.000Z'))).toBe('16:05');
  });
});

describe('formatPriceCents', () => {
  it('formatea céntimos como euros con formato español', () => {
    expect(formatPriceCents(2800)).toBe('28,00 €');
  });

  it('formatea cero correctamente', () => {
    expect(formatPriceCents(0)).toBe('0,00 €');
  });
});

describe('formatDurationMinutes', () => {
  it('formatea minutos por debajo de una hora', () => {
    expect(formatDurationMinutes(45)).toBe('45 min');
  });

  it('formatea horas exactas', () => {
    expect(formatDurationMinutes(60)).toBe('1 h');
  });

  it('formatea horas con minutos', () => {
    expect(formatDurationMinutes(90)).toBe('1 h 30 min');
  });
});

describe('buildDayOptions', () => {
  it('genera N días consecutivos empezando por la fecha local de "now"', () => {
    const now = new Date('2026-07-14T08:00:00.000Z'); // martes en Madrid
    const options = buildDayOptions(now, 5);

    expect(options.length).toBe(5);
    expect(options[0].localDate).toBe('2026-07-14');
    expect(options[0].label).toBe('mar 14 jul');
    expect(options[1].localDate).toBe('2026-07-15');
    expect(options[1].label).toBe('mié 15 jul');
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

```powershell
pnpm test format-datetime.test.ts
```

Expected: falla con `Cannot find module './format-datetime'`.

- [ ] **Step 3: Implementar `src/lib/public/format-datetime.ts`**

```typescript
import { toZonedTime } from 'date-fns-tz';
import { BUSINESS_TIMEZONE, addDaysToLocalDateString, getLocalDateString } from '@/lib/booking/timezone';

const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const SHORT_WEEKDAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const SHORT_MONTH_NAMES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

export function formatAppointmentDateTime(utcDate: Date): string {
  const zoned = toZonedTime(utcDate, BUSINESS_TIMEZONE);
  const weekday = WEEKDAY_NAMES[zoned.getDay()];
  const day = zoned.getDate();
  const month = MONTH_NAMES[zoned.getMonth()];
  const hours = String(zoned.getHours()).padStart(2, '0');
  const minutes = String(zoned.getMinutes()).padStart(2, '0');
  return `${weekday}, ${day} de ${month} a las ${hours}:${minutes}`;
}

export function formatSlotTime(utcDate: Date): string {
  const zoned = toZonedTime(utcDate, BUSINESS_TIMEZONE);
  const hours = String(zoned.getHours()).padStart(2, '0');
  const minutes = String(zoned.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatPriceCents(cents: number): string {
  const euros = (cents / 100).toFixed(2).replace('.', ',');
  return `${euros} €`;
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} h` : `${hours} h ${remaining} min`;
}

export interface DayOption {
  localDate: string;
  label: string;
}

export function buildDayOptions(now: Date, maxDays: number): DayOption[] {
  const options: DayOption[] = [];
  let current = getLocalDateString(now);

  for (let i = 0; i < maxDays; i++) {
    const [, monthStr, dayStr] = current.split('-');
    const month = Number(monthStr);
    const day = Number(dayStr);
    const weekday = new Date(`${current}T12:00:00Z`).getUTCDay();
    options.push({
      localDate: current,
      label: `${SHORT_WEEKDAY_NAMES[weekday]} ${day} ${SHORT_MONTH_NAMES[month - 1]}`,
    });
    current = addDaysToLocalDateString(current, 1);
  }

  return options;
}
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

```powershell
pnpm test format-datetime.test.ts
```

Expected: `9 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/public/format-datetime.ts src/lib/public/format-datetime.test.ts
git commit -m "feat(public): utilidades de formato de fecha, precio y duración"
```

---

### Tarea 3: Deduplicación de huecos para "cualquier profesional"

**Files:**
- Create: `src/lib/public/dedupe-slots.ts`
- Test: `src/lib/public/dedupe-slots.test.ts`

**Interfaces:**
- Consumes: `AvailableSlot` de `@/lib/booking/slots` (`{ start: Date; end: Date; employeeId: string }`).
- Produces: `DedupedSlot` (`{ start: Date; end: Date; employeeIds: string[] }`), `dedupeSlotsByStart(slots: AvailableSlot[]): DedupedSlot[]`. Usado por la Tarea 7 (`getDedupedAvailableSlotsForBusiness`).

- [ ] **Step 1: Escribir los tests**

Crea `src/lib/public/dedupe-slots.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { dedupeSlotsByStart } from './dedupe-slots';
import type { AvailableSlot } from '@/lib/booking/slots';

describe('dedupeSlotsByStart', () => {
  it('agrupa varios huecos del mismo start en una sola entrada con todos los employeeIds', () => {
    const start = new Date('2026-07-14T08:00:00.000Z');
    const end = new Date('2026-07-14T08:35:00.000Z');
    const slots: AvailableSlot[] = [
      { start, end, employeeId: 'empleado-1' },
      { start, end, employeeId: 'empleado-2' },
    ];

    const result = dedupeSlotsByStart(slots);

    expect(result.length).toBe(1);
    expect(result[0].employeeIds.sort()).toEqual(['empleado-1', 'empleado-2']);
  });

  it('mantiene huecos con distinto start como entradas separadas, ordenadas cronológicamente', () => {
    const earlier = new Date('2026-07-14T08:00:00.000Z');
    const later = new Date('2026-07-14T09:00:00.000Z');
    const slots: AvailableSlot[] = [
      { start: later, end: later, employeeId: 'empleado-1' },
      { start: earlier, end: earlier, employeeId: 'empleado-1' },
    ];

    const result = dedupeSlotsByStart(slots);

    expect(result.length).toBe(2);
    expect(result[0].start).toEqual(earlier);
    expect(result[1].start).toEqual(later);
  });

  it('devuelve un array vacío si no hay huecos', () => {
    expect(dedupeSlotsByStart([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

```powershell
pnpm test dedupe-slots.test.ts
```

Expected: falla con `Cannot find module './dedupe-slots'`.

- [ ] **Step 3: Implementar `src/lib/public/dedupe-slots.ts`**

```typescript
import type { AvailableSlot } from '@/lib/booking/slots';

export interface DedupedSlot {
  start: Date;
  end: Date;
  employeeIds: string[];
}

export function dedupeSlotsByStart(slots: AvailableSlot[]): DedupedSlot[] {
  const byStart = new Map<number, DedupedSlot>();

  for (const slot of slots) {
    const key = slot.start.getTime();
    const existing = byStart.get(key);
    if (existing) {
      existing.employeeIds.push(slot.employeeId);
    } else {
      byStart.set(key, { start: slot.start, end: slot.end, employeeIds: [slot.employeeId] });
    }
  }

  return Array.from(byStart.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
}
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

```powershell
pnpm test dedupe-slots.test.ts
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/public/dedupe-slots.ts src/lib/public/dedupe-slots.test.ts
git commit -m "feat(public): deduplicar huecos por start para \"cualquier profesional\""
```

---

### Tarea 4: Mensajes de error amables

**Files:**
- Create: `src/lib/public/error-messages.ts`
- Test: `src/lib/public/error-messages.test.ts`

**Interfaces:**
- Consumes: `CreateAppointmentFailureReason` de `@/lib/booking/create-appointment`; `ConfirmAppointmentFailureReason`, `CancelAppointmentFailureReason` de `@/lib/booking/tokens`.
- Produces: `getBookingErrorMessage(reason: CreateAppointmentFailureReason): string`, `getConfirmErrorMessage(reason: ConfirmAppointmentFailureReason): string`, `getCancelErrorMessage(reason: CancelAppointmentFailureReason): string`. Usados por la Tarea 7 (`booking-service.ts`) y las Tareas 12-13 (páginas de confirmar/cancelar).

- [ ] **Step 1: Escribir los tests**

Crea `src/lib/public/error-messages.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getBookingErrorMessage, getConfirmErrorMessage, getCancelErrorMessage } from './error-messages';
import type { CreateAppointmentFailureReason } from '@/lib/booking/create-appointment';

describe('getBookingErrorMessage', () => {
  const reasons: CreateAppointmentFailureReason[] = [
    'RATE_LIMITED',
    'BLACKLISTED',
    'CUSTOMER_LIMIT_REACHED',
    'CUSTOMER_OVERLAP',
    'EMPLOYEE_UNAVAILABLE',
    'NO_EMPLOYEE_AVAILABLE',
    'SLOT_TAKEN',
    'CUSTOMER_CONFLICT',
    'BUSINESS_NOT_FOUND',
    'SERVICE_NOT_FOUND',
  ];

  it.each(reasons)('devuelve un mensaje no vacío en español para %s', (reason) => {
    const message = getBookingErrorMessage(reason);
    expect(message.length).toBeGreaterThan(0);
  });

  it('el mensaje de SLOT_TAKEN anticipa que se proponen otras horas', () => {
    expect(getBookingErrorMessage('SLOT_TAKEN')).toContain('otras horas');
  });
});

describe('getConfirmErrorMessage', () => {
  it('EXPIRED explica que el hueco se ha liberado', () => {
    expect(getConfirmErrorMessage('EXPIRED')).toContain('liberado');
  });

  it('NOT_FOUND e INVALID_STATE devuelven mensajes no vacíos', () => {
    expect(getConfirmErrorMessage('NOT_FOUND').length).toBeGreaterThan(0);
    expect(getConfirmErrorMessage('INVALID_STATE').length).toBeGreaterThan(0);
  });
});

describe('getCancelErrorMessage', () => {
  it('NOT_FOUND e INVALID_STATE devuelven mensajes no vacíos', () => {
    expect(getCancelErrorMessage('NOT_FOUND').length).toBeGreaterThan(0);
    expect(getCancelErrorMessage('INVALID_STATE').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

```powershell
pnpm test error-messages.test.ts
```

Expected: falla con `Cannot find module './error-messages'`.

- [ ] **Step 3: Implementar `src/lib/public/error-messages.ts`**

```typescript
import type { CreateAppointmentFailureReason } from '@/lib/booking/create-appointment';
import type { ConfirmAppointmentFailureReason, CancelAppointmentFailureReason } from '@/lib/booking/tokens';

export function getBookingErrorMessage(reason: CreateAppointmentFailureReason): string {
  switch (reason) {
    case 'RATE_LIMITED':
      return 'Has hecho demasiados intentos de reserva en poco tiempo. Espera unos minutos y vuelve a intentarlo.';
    case 'BLACKLISTED':
      return 'No podemos completar tu reserva en este negocio. Si crees que es un error, contacta directamente con ellos.';
    case 'CUSTOMER_LIMIT_REACHED':
      return 'Ya tienes el máximo de citas activas permitidas en este negocio. Cancela alguna antes de reservar otra.';
    case 'CUSTOMER_OVERLAP':
      return 'Ya tienes otra cita reservada que se solapa con este horario.';
    case 'EMPLOYEE_UNAVAILABLE':
      return 'Ese profesional ya no tiene disponible este hueco. Elige otro horario o profesional.';
    case 'NO_EMPLOYEE_AVAILABLE':
      return 'Ningún profesional tiene disponible ese hueco ahora mismo. Prueba con otro horario.';
    case 'SLOT_TAKEN':
      return 'Vaya, ese hueco se acaba de ocupar. Te proponemos otras horas disponibles:';
    case 'CUSTOMER_CONFLICT':
      return 'Ese teléfono ya está asociado a otro cliente con un email distinto. Revisa tus datos o contacta con el negocio.';
    case 'BUSINESS_NOT_FOUND':
      return 'No encontramos este negocio. Puede que el enlace ya no esté disponible.';
    case 'SERVICE_NOT_FOUND':
      return 'Este servicio ya no está disponible.';
    default: {
      const exhaustiveCheck: never = reason;
      return exhaustiveCheck;
    }
  }
}

export function getConfirmErrorMessage(reason: ConfirmAppointmentFailureReason): string {
  switch (reason) {
    case 'NOT_FOUND':
      return 'No encontramos ninguna cita con este enlace. Puede que ya haya sido usado o que el enlace no sea correcto.';
    case 'EXPIRED':
      return 'El enlace de confirmación ha caducado (han pasado más de 30 minutos desde la reserva). El hueco ya se ha liberado: puedes volver a reservar.';
    case 'INVALID_STATE':
      return 'Esta cita ya no se puede confirmar (puede que ya estuviera confirmada, cancelada o completada).';
    default: {
      const exhaustiveCheck: never = reason;
      return exhaustiveCheck;
    }
  }
}

export function getCancelErrorMessage(reason: CancelAppointmentFailureReason): string {
  switch (reason) {
    case 'NOT_FOUND':
      return 'No encontramos ninguna cita con este enlace.';
    case 'INVALID_STATE':
      return 'Esta cita ya no se puede cancelar (puede que ya estuviera completada o marcada como no presentada).';
    default: {
      const exhaustiveCheck: never = reason;
      return exhaustiveCheck;
    }
  }
}
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

```powershell
pnpm test error-messages.test.ts
```

Expected: `14 passed` (10 de `it.each` + 4 más).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/public/error-messages.ts src/lib/public/error-messages.test.ts
git commit -m "feat(public): mensajes de error amables para reservar, confirmar y cancelar"
```

---

### Tarea 5: Máquina de estados de la hoja de reserva

**Files:**
- Create: `src/lib/public/wizard-state.ts`
- Test: `src/lib/public/wizard-state.test.ts`

**Interfaces:**
- Consumes: nada (lógica pura).
- Produces: `WizardStep = 'EMPLOYEE' | 'DATETIME' | 'CUSTOMER_DATA' | 'SUBMITTING' | 'SUCCESS' | 'ERROR'`, `WizardState`, `WizardAction`, `createInitialWizardState(serviceId: string): WizardState`, `wizardReducer(state: WizardState, action: WizardAction): WizardState`. Usado por `BookingSheet.tsx` (Tareas 9-10).

- [ ] **Step 1: Escribir los tests**

Crea `src/lib/public/wizard-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createInitialWizardState, wizardReducer } from './wizard-state';

describe('createInitialWizardState', () => {
  it('empieza en el paso EMPLOYEE con el servicio indicado', () => {
    const state = createInitialWizardState('servicio-1');
    expect(state.step).toBe('EMPLOYEE');
    expect(state.serviceId).toBe('servicio-1');
    expect(state.employeeId).toBeNull();
    expect(state.slotStart).toBeNull();
  });
});

describe('wizardReducer', () => {
  it('SELECT_EMPLOYEE avanza a DATETIME y guarda el empleado', () => {
    const state = createInitialWizardState('servicio-1');
    const next = wizardReducer(state, { type: 'SELECT_EMPLOYEE', employeeId: 'empleado-1' });
    expect(next.step).toBe('DATETIME');
    expect(next.employeeId).toBe('empleado-1');
  });

  it('SELECT_EMPLOYEE con null guarda "cualquiera"', () => {
    const state = createInitialWizardState('servicio-1');
    const next = wizardReducer(state, { type: 'SELECT_EMPLOYEE', employeeId: null });
    expect(next.employeeId).toBeNull();
    expect(next.step).toBe('DATETIME');
  });

  it('SELECT_SLOT avanza a CUSTOMER_DATA y guarda la hora', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'DATETIME' as const, employeeId: 'empleado-1' };
    const start = new Date('2026-07-14T08:00:00.000Z');
    const next = wizardReducer(state, { type: 'SELECT_SLOT', start });
    expect(next.step).toBe('CUSTOMER_DATA');
    expect(next.slotStart).toEqual(start);
  });

  it('BACK desde DATETIME vuelve a EMPLOYEE y limpia el hueco', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'DATETIME' as const, employeeId: 'empleado-1' };
    const next = wizardReducer(state, { type: 'BACK' });
    expect(next.step).toBe('EMPLOYEE');
    expect(next.slotStart).toBeNull();
  });

  it('BACK desde CUSTOMER_DATA vuelve a DATETIME', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'CUSTOMER_DATA' as const };
    const next = wizardReducer(state, { type: 'BACK' });
    expect(next.step).toBe('DATETIME');
  });

  it('BACK desde ERROR vuelve a DATETIME y limpia el error', () => {
    const state = {
      ...createInitialWizardState('servicio-1'),
      step: 'ERROR' as const,
      errorMessage: 'algo falló',
      alternativeSlots: [new Date()],
    };
    const next = wizardReducer(state, { type: 'BACK' });
    expect(next.step).toBe('DATETIME');
    expect(next.errorMessage).toBeNull();
    expect(next.alternativeSlots).toEqual([]);
  });

  it('SUBMIT_CUSTOMER_DATA guarda los datos y pasa a SUBMITTING', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'CUSTOMER_DATA' as const };
    const next = wizardReducer(state, {
      type: 'SUBMIT_CUSTOMER_DATA',
      name: 'Ana',
      phone: '+34600000000',
      email: 'ana@example.com',
    });
    expect(next.step).toBe('SUBMITTING');
    expect(next.customerName).toBe('Ana');
    expect(next.customerPhone).toBe('+34600000000');
    expect(next.customerEmail).toBe('ana@example.com');
  });

  it('SUBMISSION_SUCCEEDED pasa a SUCCESS con el flag de aprobación pendiente', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'SUBMITTING' as const };
    const next = wizardReducer(state, { type: 'SUBMISSION_SUCCEEDED', pendingApproval: true });
    expect(next.step).toBe('SUCCESS');
    expect(next.pendingApproval).toBe(true);
  });

  it('SUBMISSION_FAILED pasa a ERROR con mensaje y alternativas', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'SUBMITTING' as const };
    const altStart = new Date('2026-07-14T09:00:00.000Z');
    const next = wizardReducer(state, {
      type: 'SUBMISSION_FAILED',
      message: 'Ese hueco ya no está libre',
      alternativeSlots: [altStart],
    });
    expect(next.step).toBe('ERROR');
    expect(next.errorMessage).toBe('Ese hueco ya no está libre');
    expect(next.alternativeSlots).toEqual([altStart]);
  });

  it('RESET vuelve al estado inicial con un nuevo servicio', () => {
    const state = { ...createInitialWizardState('servicio-1'), step: 'SUCCESS' as const, pendingApproval: true };
    const next = wizardReducer(state, { type: 'RESET', serviceId: 'servicio-2' });
    expect(next).toEqual(createInitialWizardState('servicio-2'));
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

```powershell
pnpm test wizard-state.test.ts
```

Expected: falla con `Cannot find module './wizard-state'`.

- [ ] **Step 3: Implementar `src/lib/public/wizard-state.ts`**

```typescript
export type WizardStep = 'EMPLOYEE' | 'DATETIME' | 'CUSTOMER_DATA' | 'SUBMITTING' | 'SUCCESS' | 'ERROR';

export interface WizardState {
  step: WizardStep;
  serviceId: string;
  employeeId: string | null;
  slotStart: Date | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  errorMessage: string | null;
  alternativeSlots: Date[];
  pendingApproval: boolean;
}

export type WizardAction =
  | { type: 'SELECT_EMPLOYEE'; employeeId: string | null }
  | { type: 'SELECT_SLOT'; start: Date }
  | { type: 'BACK' }
  | { type: 'SUBMIT_CUSTOMER_DATA'; name: string; phone: string; email: string }
  | { type: 'SUBMISSION_SUCCEEDED'; pendingApproval: boolean }
  | { type: 'SUBMISSION_FAILED'; message: string; alternativeSlots?: Date[] }
  | { type: 'RESET'; serviceId: string };

export function createInitialWizardState(serviceId: string): WizardState {
  return {
    step: 'EMPLOYEE',
    serviceId,
    employeeId: null,
    slotStart: null,
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    errorMessage: null,
    alternativeSlots: [],
    pendingApproval: false,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SELECT_EMPLOYEE':
      return { ...state, employeeId: action.employeeId, step: 'DATETIME' };
    case 'SELECT_SLOT':
      return { ...state, slotStart: action.start, step: 'CUSTOMER_DATA' };
    case 'BACK':
      if (state.step === 'DATETIME') {
        return { ...state, step: 'EMPLOYEE', slotStart: null };
      }
      if (state.step === 'CUSTOMER_DATA') {
        return { ...state, step: 'DATETIME' };
      }
      if (state.step === 'ERROR') {
        return { ...state, step: 'DATETIME', errorMessage: null, alternativeSlots: [] };
      }
      return state;
    case 'SUBMIT_CUSTOMER_DATA':
      return {
        ...state,
        customerName: action.name,
        customerPhone: action.phone,
        customerEmail: action.email,
        step: 'SUBMITTING',
      };
    case 'SUBMISSION_SUCCEEDED':
      return { ...state, step: 'SUCCESS', pendingApproval: action.pendingApproval };
    case 'SUBMISSION_FAILED':
      return { ...state, step: 'ERROR', errorMessage: action.message, alternativeSlots: action.alternativeSlots ?? [] };
    case 'RESET':
      return createInitialWizardState(action.serviceId);
    default:
      return state;
  }
}
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

```powershell
pnpm test wizard-state.test.ts
```

Expected: `11 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/public/wizard-state.ts src/lib/public/wizard-state.test.ts
git commit -m "feat(public): máquina de estados pura de la hoja de reserva"
```

---

### Tarea 6: Lookup público de negocio por slug y de cita por token

**Files:**
- Create: `src/lib/public/business-lookup.ts`, `src/lib/public/appointment-lookup.ts`
- Test: `src/lib/public/business-lookup.test.ts`, `src/lib/public/appointment-lookup.test.ts`

**Interfaces:**
- Consumes: `PrismaClient` de `@prisma/client`; `seedDemoBusiness` de `@/lib/seed/demo-business` (solo en tests); `createAppointment` de `@/lib/booking/create-appointment` (solo en tests de `appointment-lookup`).
- Produces:
  - `PublicBusinessService = { id: string; name: string; description: string | null; durationMinutes: number; priceCents: number }`
  - `PublicBusinessEmployee = { id: string; name: string; photoUrl: string | null; color: string }`
  - `PublicBusiness = { id: string; slug: string; name: string; address: string | null; phone: string | null; email: string | null; themePreset: ThemePreset; accentColor: string; logoUrl: string | null; manualApproval: boolean; maxBookingWindowDays: number; services: PublicBusinessService[]; employees: PublicBusinessEmployee[] }`
  - `getPublicBusinessBySlug(prisma: PrismaClient, slug: string): Promise<PublicBusiness | null>`
  - `PublicAppointmentSummary = { id: string; status: string; start: Date; end: Date; customerName: string; serviceName: string; employeeName: string; businessName: string; businessSlug: string; cancelToken: string; confirmToken: string }`
  - `getAppointmentByConfirmToken(prisma: PrismaClient, token: string): Promise<PublicAppointmentSummary | null>`
  - `getAppointmentByCancelToken(prisma: PrismaClient, token: string): Promise<PublicAppointmentSummary | null>`

  Usados por la Tarea 7 (`booking-service.ts`, `slots-service.ts`) y las Tareas 9, 11-13 (páginas).

- [ ] **Step 1: Escribir los tests de `business-lookup`**

Crea `src/lib/public/business-lookup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getPublicBusinessBySlug } from './business-lookup';

describe('getPublicBusinessBySlug', () => {
  it('devuelve el negocio con sus servicios y empleados activos', async () => {
    const seed = await seedDemoBusiness(prisma);

    const business = await getPublicBusinessBySlug(prisma, 'salon-aura');

    expect(business).not.toBeNull();
    expect(business?.id).toBe(seed.business.id);
    expect(business?.name).toBe('Salón Aura');
    expect(business?.services.length).toBe(4);
    expect(business?.employees.length).toBe(2);
    expect(business?.maxBookingWindowDays).toBe(30);
  });

  it('devuelve null si el slug no existe', async () => {
    const business = await getPublicBusinessBySlug(prisma, 'no-existe');
    expect(business).toBeNull();
  });

  it('devuelve null si el negocio está inactivo', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.business.update({ where: { id: seed.business.id }, data: { active: false } });

    const business = await getPublicBusinessBySlug(prisma, 'salon-aura');

    expect(business).toBeNull();
  });

  it('excluye servicios y empleados inactivos', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.service.update({ where: { id: seed.services.coloracion.id }, data: { active: false } });
    await prisma.employee.update({ where: { id: seed.employees.carlos.id }, data: { active: false } });

    const business = await getPublicBusinessBySlug(prisma, 'salon-aura');

    expect(business?.services.some((s) => s.id === seed.services.coloracion.id)).toBe(false);
    expect(business?.employees.some((e) => e.id === seed.employees.carlos.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

```powershell
pnpm test business-lookup.test.ts
```

Expected: falla con `Cannot find module './business-lookup'`.

- [ ] **Step 3: Implementar `src/lib/public/business-lookup.ts`**

```typescript
import type { PrismaClient, ThemePreset } from '@prisma/client';

export interface PublicBusinessService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
}

export interface PublicBusinessEmployee {
  id: string;
  name: string;
  photoUrl: string | null;
  color: string;
}

export interface PublicBusiness {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  themePreset: ThemePreset;
  accentColor: string;
  logoUrl: string | null;
  manualApproval: boolean;
  maxBookingWindowDays: number;
  services: PublicBusinessService[];
  employees: PublicBusinessEmployee[];
}

export async function getPublicBusinessBySlug(prisma: PrismaClient, slug: string): Promise<PublicBusiness | null> {
  const business = await prisma.business.findUnique({
    where: { slug },
    include: {
      services: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      employees: { where: { active: true }, orderBy: { name: 'asc' } },
    },
  });

  if (!business || !business.active) {
    return null;
  }

  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    address: business.address,
    phone: business.phone,
    email: business.email,
    themePreset: business.themePreset,
    accentColor: business.accentColor,
    logoUrl: business.logoUrl,
    manualApproval: business.manualApproval,
    maxBookingWindowDays: business.maxBookingWindowDays,
    services: business.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      priceCents: s.priceCents,
    })),
    employees: business.employees.map((e) => ({
      id: e.id,
      name: e.name,
      photoUrl: e.photoUrl,
      color: e.color,
    })),
  };
}
```

- [ ] **Step 4: Ejecutar los tests de `business-lookup` y comprobar que pasan**

```powershell
pnpm test business-lookup.test.ts
```

Expected: `4 passed`.

- [ ] **Step 5: Escribir los tests de `appointment-lookup`**

Crea `src/lib/public/appointment-lookup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { createAppointment } from '../booking/create-appointment';
import { getAppointmentByConfirmToken, getAppointmentByCancelToken } from './appointment-lookup';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z');

async function createTestAppointment() {
  const seed = await seedDemoBusiness(prisma);
  const result = await createAppointment(prisma, {
    businessId: seed.business.id,
    serviceId: seed.services.corteHombre.id,
    employeeId: seed.employees.marta.id,
    start: VALID_START,
    customerName: 'Cliente lookup',
    customerPhone: '+34688000001',
    customerEmail: 'lookup@example.com',
    source: 'WEB',
    ipAddress: '198.51.100.50',
    now: NOW,
  });
  if (!result.ok) {
    throw new Error(`No se pudo crear la cita de prueba: ${result.reason}`);
  }
  return { seed, appointment: result.appointment };
}

describe('getAppointmentByConfirmToken', () => {
  it('devuelve el resumen de la cita cuando el token existe', async () => {
    const { seed, appointment } = await createTestAppointment();

    const summary = await getAppointmentByConfirmToken(prisma, appointment.confirmToken);

    expect(summary).not.toBeNull();
    expect(summary?.serviceName).toBe('Corte de hombre');
    expect(summary?.employeeName).toBe('Marta Ruiz');
    expect(summary?.businessName).toBe(seed.business.name);
    expect(summary?.businessSlug).toBe(seed.business.slug);
    expect(summary?.status).toBe('PENDING');
  });

  it('devuelve null si el token no existe', async () => {
    const summary = await getAppointmentByConfirmToken(prisma, 'token-inexistente');
    expect(summary).toBeNull();
  });
});

describe('getAppointmentByCancelToken', () => {
  it('devuelve el resumen de la cita cuando el token existe', async () => {
    const { appointment } = await createTestAppointment();

    const summary = await getAppointmentByCancelToken(prisma, appointment.cancelToken);

    expect(summary).not.toBeNull();
    expect(summary?.status).toBe('PENDING');
  });

  it('devuelve null si el token no existe', async () => {
    const summary = await getAppointmentByCancelToken(prisma, 'token-inexistente');
    expect(summary).toBeNull();
  });
});
```

- [ ] **Step 6: Ejecutar los tests y comprobar que fallan**

```powershell
pnpm test appointment-lookup.test.ts
```

Expected: falla con `Cannot find module './appointment-lookup'`.

- [ ] **Step 7: Implementar `src/lib/public/appointment-lookup.ts`**

```typescript
import type { PrismaClient } from '@prisma/client';

export interface PublicAppointmentSummary {
  id: string;
  status: string;
  start: Date;
  end: Date;
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

- [ ] **Step 8: Ejecutar todos los tests de la tarea y comprobar que pasan**

```powershell
pnpm test business-lookup.test.ts appointment-lookup.test.ts
```

Expected: `4 passed` + `4 passed`.

- [ ] **Step 9: Commit**

```powershell
git add src/lib/public/business-lookup.ts src/lib/public/business-lookup.test.ts src/lib/public/appointment-lookup.ts src/lib/public/appointment-lookup.test.ts
git commit -m "feat(public): lookup de negocio por slug y de cita por token"
```

---

### Tarea 7: Servicios de huecos y de reserva con resolución slug→businessId

**Files:**
- Create: `src/lib/public/slots-service.ts`, `src/lib/public/booking-service.ts`
- Test: `src/lib/public/slots-service.test.ts`, `src/lib/public/booking-service.test.ts`

**Interfaces:**
- Consumes: `getAvailableSlots`, `AvailableSlot` de `@/lib/booking/slots`; `createAppointment` de `@/lib/booking/create-appointment`; `getLocalDateString` de `@/lib/booking/timezone`; `dedupeSlotsByStart`, `DedupedSlot` de `./dedupe-slots` (Tarea 3); `getBookingErrorMessage` de `./error-messages` (Tarea 4).
- Produces:
  - `getAvailableSlotsForBusiness(prisma, { slug, serviceId, employeeId?, dateFrom, dateTo, now? }): Promise<AvailableSlot[]>`
  - `getDedupedAvailableSlotsForBusiness(prisma, mismo input): Promise<DedupedSlot[]>`
  - `BookAppointmentBySlugInput = { slug: string; serviceId: string; employeeId?: string; start: Date; customerName: string; customerPhone: string; customerEmail: string; ipAddress: string; now?: Date }`
  - `BookAppointmentBySlugResult = { ok: true; confirmToken: string; cancelToken: string; pendingApproval: boolean } | { ok: false; message: string; alternativeSlots: Date[] }`
  - `bookAppointmentBySlug(prisma: PrismaClient, input: BookAppointmentBySlugInput): Promise<BookAppointmentBySlugResult>`

  Usados por las Server Actions de la Tarea 9-10 (`actions.ts`).

- [ ] **Step 1: Escribir los tests de `slots-service`**

Crea `src/lib/public/slots-service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { getAvailableSlotsForBusiness, getDedupedAvailableSlotsForBusiness } from './slots-service';

const NOW = new Date('2026-07-13T08:00:00.000Z');

describe('getAvailableSlotsForBusiness', () => {
  it('devuelve huecos del empleado indicado resolviendo el slug', async () => {
    const seed = await seedDemoBusiness(prisma);

    const slots = await getAvailableSlotsForBusiness(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now: NOW,
    });

    expect(slots.length).toBe(28);
  });

  it('devuelve un array vacío si el slug no existe', async () => {
    const seed = await seedDemoBusiness(prisma);

    const slots = await getAvailableSlotsForBusiness(prisma, {
      slug: 'no-existe',
      serviceId: seed.services.corteHombre.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now: NOW,
    });

    expect(slots).toEqual([]);
  });
});

describe('getDedupedAvailableSlotsForBusiness', () => {
  it('deduplica por start cuando se piden huecos de "cualquier profesional"', async () => {
    const seed = await seedDemoBusiness(prisma);

    const slots = await getDedupedAvailableSlotsForBusiness(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      dateFrom: '2026-07-14',
      dateTo: '2026-07-14',
      now: NOW,
    });

    const teatime = slots.find((s) => s.start.toISOString() === '2026-07-14T14:00:00.000Z');
    expect(teatime).toBeDefined();
    expect(teatime?.employeeIds.sort()).toEqual([seed.employees.carlos.id, seed.employees.marta.id].sort());

    const startTimes = slots.map((s) => s.start.getTime());
    expect(new Set(startTimes).size).toBe(startTimes.length);
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

```powershell
pnpm test slots-service.test.ts
```

Expected: falla con `Cannot find module './slots-service'`.

- [ ] **Step 3: Implementar `src/lib/public/slots-service.ts`**

```typescript
import type { PrismaClient } from '@prisma/client';
import { getAvailableSlots, type AvailableSlot } from '@/lib/booking/slots';
import { dedupeSlotsByStart, type DedupedSlot } from './dedupe-slots';

export interface GetAvailableSlotsForBusinessInput {
  slug: string;
  serviceId: string;
  employeeId?: string;
  dateFrom: string;
  dateTo: string;
  now?: Date;
}

export async function getAvailableSlotsForBusiness(
  prisma: PrismaClient,
  input: GetAvailableSlotsForBusinessInput
): Promise<AvailableSlot[]> {
  const business = await prisma.business.findUnique({ where: { slug: input.slug } });
  if (!business || !business.active) {
    return [];
  }

  return getAvailableSlots(prisma, {
    businessId: business.id,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    now: input.now,
  });
}

export async function getDedupedAvailableSlotsForBusiness(
  prisma: PrismaClient,
  input: GetAvailableSlotsForBusinessInput
): Promise<DedupedSlot[]> {
  const slots = await getAvailableSlotsForBusiness(prisma, input);
  return dedupeSlotsByStart(slots);
}
```

- [ ] **Step 4: Ejecutar los tests de `slots-service` y comprobar que pasan**

```powershell
pnpm test slots-service.test.ts
```

Expected: `3 passed`.

- [ ] **Step 5: Escribir los tests de `booking-service`**

Crea `src/lib/public/booking-service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoBusiness } from '../seed/demo-business';
import { bookAppointmentBySlug } from './booking-service';

const NOW = new Date('2026-07-13T08:00:00.000Z');
const VALID_START = new Date('2026-07-14T08:00:00.000Z');

describe('bookAppointmentBySlug', () => {
  it('crea la cita y devuelve los tokens cuando todo es correcto', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente servicio',
      customerPhone: '+34699000001',
      customerEmail: 'servicio@example.com',
      ipAddress: '198.51.100.60',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmToken).toBeTruthy();
      expect(result.cancelToken).toBeTruthy();
      expect(result.pendingApproval).toBe(false);
    }
  });

  it('marca pendingApproval en true si el negocio tiene manualApproval activado', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.business.update({ where: { id: seed.business.id }, data: { manualApproval: true } });

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Cliente aprobación',
      customerPhone: '+34699000002',
      customerEmail: 'aprobacion@example.com',
      ipAddress: '198.51.100.61',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pendingApproval).toBe(true);
    }
  });

  it('devuelve mensaje amable y sin alternativas para BLACKLISTED', async () => {
    const seed = await seedDemoBusiness(prisma);
    await prisma.blacklistEntry.create({
      data: { businessId: seed.business.id, email: 'vetado-servicio@example.com', reason: 'No presentado' },
    });

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'salon-aura',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Vetado',
      customerPhone: '+34699000003',
      customerEmail: 'vetado-servicio@example.com',
      ipAddress: '198.51.100.62',
      now: NOW,
    });

    expect(result).toEqual({
      ok: false,
      message: 'No podemos completar tu reserva en este negocio. Si crees que es un error, contacta directamente con ellos.',
      alternativeSlots: [],
    });
  });

  it('devuelve huecos alternativos ese mismo día cuando el hueco se acaba de ocupar (SLOT_TAKEN)', async () => {
    const seed = await seedDemoBusiness(prisma);
    const raceStart = new Date('2026-07-14T14:00:00.000Z'); // 16:00 local, bloque de Carlos

    const attempt = (phone: string, email: string) =>
      bookAppointmentBySlug(prisma, {
        slug: 'salon-aura',
        serviceId: seed.services.corteHombre.id,
        employeeId: seed.employees.carlos.id,
        start: raceStart,
        customerName: 'Cliente carrera servicio',
        customerPhone: phone,
        customerEmail: email,
        ipAddress: '198.51.100.63',
        now: NOW,
      });

    const [resultA, resultB] = await Promise.all([
      attempt('+34699000004', 'carrera-servicio-a@example.com'),
      attempt('+34699000005', 'carrera-servicio-b@example.com'),
    ]);

    const failed = [resultA, resultB].find((r) => !r.ok);
    expect(failed).toBeDefined();
    if (failed && !failed.ok) {
      expect(failed.message).toBe('Vaya, ese hueco se acaba de ocupar. Te proponemos otras horas disponibles:');
      expect(failed.alternativeSlots.length).toBeGreaterThan(0);
    }
  });

  it('devuelve el mensaje de BUSINESS_NOT_FOUND si el slug no existe', async () => {
    const seed = await seedDemoBusiness(prisma);

    const result = await bookAppointmentBySlug(prisma, {
      slug: 'no-existe',
      serviceId: seed.services.corteHombre.id,
      employeeId: seed.employees.marta.id,
      start: VALID_START,
      customerName: 'Sin negocio',
      customerPhone: '+34699000006',
      customerEmail: 'sinnegocio-servicio@example.com',
      ipAddress: '198.51.100.64',
      now: NOW,
    });

    expect(result).toEqual({
      ok: false,
      message: 'No encontramos este negocio. Puede que el enlace ya no esté disponible.',
      alternativeSlots: [],
    });
  });
});
```

- [ ] **Step 6: Ejecutar los tests y comprobar que fallan**

```powershell
pnpm test booking-service.test.ts
```

Expected: falla con `Cannot find module './booking-service'`.

- [ ] **Step 7: Implementar `src/lib/public/booking-service.ts`**

```typescript
import type { PrismaClient } from '@prisma/client';
import { createAppointment } from '@/lib/booking/create-appointment';
import { getLocalDateString } from '@/lib/booking/timezone';
import { getBookingErrorMessage } from './error-messages';
import { getAvailableSlotsForBusiness } from './slots-service';

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
}

export type BookAppointmentBySlugResult =
  | { ok: true; confirmToken: string; cancelToken: string; pendingApproval: boolean }
  | { ok: false; message: string; alternativeSlots: Date[] };

export async function bookAppointmentBySlug(
  prisma: PrismaClient,
  input: BookAppointmentBySlugInput
): Promise<BookAppointmentBySlugResult> {
  const now = input.now ?? new Date();
  const business = await prisma.business.findUnique({ where: { slug: input.slug } });

  if (!business || !business.active) {
    return { ok: false, message: getBookingErrorMessage('BUSINESS_NOT_FOUND'), alternativeSlots: [] };
  }

  const result = await createAppointment(prisma, {
    businessId: business.id,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    start: input.start,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    source: 'WEB',
    ipAddress: input.ipAddress,
    now,
  });

  if (result.ok) {
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

- [ ] **Step 8: Ejecutar todos los tests de la tarea y comprobar que pasan**

```powershell
pnpm test slots-service.test.ts booking-service.test.ts
```

Expected: `3 passed` + `5 passed`.

- [ ] **Step 9: Commit**

```powershell
git add src/lib/public/slots-service.ts src/lib/public/slots-service.test.ts src/lib/public/booking-service.ts src/lib/public/booking-service.test.ts
git commit -m "feat(public): servicios de huecos y reserva con resolución slug->businessId"
```

---

### Tarea 8: Layout público con fuentes y tema sin FOUC

**Files:**
- Create: `src/app/(public)/layout.tsx`

**Interfaces:**
- Consumes: nada de tareas anteriores directamente (usa `next/font/google`), pero las variables de fuente (`--font-playfair`, `--font-lora`, `--font-poppins`, `--font-inter`, `--font-work-sans`) deben coincidir exactamente con las referenciadas en `THEME_PRESETS` (Tarea 1).
- Produces: layout compartido por todas las rutas públicas (`/[slug]`, `/confirmar/[token]`, `/cita/[token]`), que expone las 5 variables de fuente en el DOM para que cualquier `getThemeCssVariables()` aplicado en una página hija funcione, y fija `font-family: var(--font-body, var(--font-lora))` en su contenedor para que ningún texto público herede el Arial de `globals.css`. No redeclara `<html>`/`<body>` (ya los declara el layout raíz `src/app/layout.tsx`, que esta tarea NO modifica).

- [ ] **Step 1: Crear el layout del route group `(public)`**

Crea `src/app/(public)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Playfair_Display, Lora, Poppins, Inter, Work_Sans } from 'next/font/google';

const playfairDisplay = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  weight: ['600', '700'],
});
const lora = Lora({
  variable: '--font-lora',
  subsets: ['latin'],
  weight: ['400', '500'],
});
const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['500', '700'],
});
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500'],
});
const workSans = Work_Sans({
  variable: '--font-work-sans',
  subsets: ['latin'],
  weight: ['400', '600'],
});

const PUBLIC_FONT_VARIABLES = [
  playfairDisplay.variable,
  lora.variable,
  poppins.variable,
  inter.variable,
  workSans.variable,
].join(' ');

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${PUBLIC_FONT_VARIABLES} min-h-screen bg-[#FAF6F0] antialiased`}
      style={{ fontFamily: 'var(--font-body, var(--font-lora))' }}
    >
      {children}
    </div>
  );
}
```

Notas:

- El `bg-[#FAF6F0]` de este `div` es solo un color de respaldo (Boutique editorial) para el instante entre la carga del layout y el render de la página hija — cada página pública (Tareas 11-13) fija sus propias variables `--color-*` con `getThemeCssVariables()` sobre un contenedor que cubre toda la vista, así que no hay FOUC real: el HTML llega ya con el tema correcto del negocio.
- El `fontFamily` con fallback anula el `Arial` hardcodeado en `globals.css` para todo el subárbol público (regla de theming del proyecto). En este `div` la variable `--font-body` aún no existe (la definen los contenedores temáticos de las páginas hijas), así que aquí resuelve al fallback `var(--font-lora)` — la fuente de cuerpo del preset por defecto, que es lo que deben usar las pantallas sin negocio conocido (p. ej. `not-found`). Importante: `var()` se resuelve en el elemento donde se declara la propiedad, no en los descendientes; por eso los contenedores temáticos de las Tareas 11-13 vuelven a declarar `fontFamily: 'var(--font-body)'` junto a las variables del tema, y ahí sí resuelve a la fuente del preset del negocio.

- [ ] **Step 2: Comprobar que el proyecto sigue compilando**

```powershell
pnpm exec tsc --noEmit
```

Expected: sin errores nuevos relacionados con `src/app/(public)/layout.tsx` (puede haber errores preexistentes de rutas que aún no existen — verifica que no aparezcan referidos a este archivo).

- [ ] **Step 3: Commit**

```powershell
git add src/app/(public)/layout.tsx
git commit -m "feat(public): layout público con las fuentes de los tres presets de tema"
```

---

### Tarea 9: Hoja de reserva — estructura, animación GSAP, Server Action de huecos y paso "profesional"

**Antes de escribir componentes visuales:** invoca las skills `frontend-design` y `gsap-react` (usa el Skill tool con esos nombres) para definir la composición visual de la hoja inferior y el patrón correcto de `useGSAP` antes de escribir el JSX de esta tarea.

**Files:**
- Create: `src/app/(public)/[slug]/actions.ts`, `src/app/(public)/[slug]/components/booking-sheet/BookingSheet.tsx`, `src/app/(public)/[slug]/components/booking-sheet/StepEmployee.tsx`

**Interfaces:**
- Consumes: `wizardReducer`, `createInitialWizardState`, `WizardState` de `@/lib/public/wizard-state` (Tarea 5); `getAvailableSlotsForBusiness`, `getDedupedAvailableSlotsForBusiness` de `@/lib/public/slots-service` (Tarea 7); `prisma` de `@/lib/db`.
- Produces:
  - `FetchSlotsActionInput = { slug: string; serviceId: string; employeeId?: string; dateFrom: string; dateTo: string }`
  - `SlotOption = { start: string; end: string; employeeIds: string[] }`
  - `fetchAvailableSlotsAction(input: FetchSlotsActionInput): Promise<SlotOption[]>` — Server Action, usada por `StepDateTime` (Tarea 10).
  - `BookingSheetProps = { slug: string; service: { id: string; name: string; durationMinutes: number; priceCents: number }; employees: { id: string; name: string; photoUrl: string | null; color: string }[]; maxBookingWindowDays: number; onClose: () => void }` (nota: `manualApproval` no viaja como prop del cliente — el servidor ya decide el `pendingApproval` de cada reserva concreta y lo devuelve en la respuesta de `bookAppointmentAction`, así que la UI no necesita conocer el ajuste del negocio de antemano)
  - `BookingSheet(props: BookingSheetProps)` — componente cliente, consumido por `BookingLauncherProvider` (Tarea 11). En esta tarea solo implementa completamente el paso `EMPLOYEE`; los pasos `DATETIME`/`CUSTOMER_DATA`/`SUBMITTING`/`SUCCESS`/`ERROR` se completan en la Tarea 10 (que reemplaza este archivo entero).

- [ ] **Step 1: Instalar GSAP y `@gsap/react`**

```powershell
pnpm add gsap @gsap/react --save-exact
```

Expected: `package.json` gana `gsap` y `@gsap/react` en `dependencies` sin `^`. Verifica las versiones resueltas:

```powershell
pnpm list gsap @gsap/react
```

Expected: muestra las dos versiones instaladas (anótalas en el mensaje de commit del Step 5 si difieren de lo esperado).

- [ ] **Step 2: Crear la Server Action de huecos**

Crea `src/app/(public)/[slug]/actions.ts`:

```typescript
'use server';

import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getAvailableSlotsForBusiness, getDedupedAvailableSlotsForBusiness } from '@/lib/public/slots-service';
import { bookAppointmentBySlug } from '@/lib/public/booking-service';

export interface FetchSlotsActionInput {
  slug: string;
  serviceId: string;
  employeeId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface SlotOption {
  start: string;
  end: string;
  employeeIds: string[];
}

export async function fetchAvailableSlotsAction(input: FetchSlotsActionInput): Promise<SlotOption[]> {
  if (input.employeeId) {
    const slots = await getAvailableSlotsForBusiness(prisma, input);
    return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), employeeIds: [s.employeeId] }));
  }

  const slots = await getDedupedAvailableSlotsForBusiness(prisma, input);
  return slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), employeeIds: s.employeeIds }));
}

export interface BookAppointmentActionInput {
  slug: string;
  serviceId: string;
  employeeId?: string;
  start: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

export interface BookAppointmentActionResult {
  ok: boolean;
  confirmToken?: string;
  cancelToken?: string;
  pendingApproval?: boolean;
  message?: string;
  alternativeSlots?: string[];
}

export async function bookAppointmentAction(input: BookAppointmentActionInput): Promise<BookAppointmentActionResult> {
  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  const result = await bookAppointmentBySlug(prisma, {
    slug: input.slug,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    start: new Date(input.start),
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    ipAddress,
  });

  if (result.ok) {
    return {
      ok: true,
      confirmToken: result.confirmToken,
      cancelToken: result.cancelToken,
      pendingApproval: result.pendingApproval,
    };
  }

  return { ok: false, message: result.message, alternativeSlots: result.alternativeSlots.map((d) => d.toISOString()) };
}
```

Nota: `bookAppointmentAction` ya se implementa completa en esta tarea (aunque solo se consuma desde la UI en la Tarea 10) porque vive en el mismo archivo `'use server'` que `fetchAvailableSlotsAction` — así el archivo no cambia de forma entre tareas, solo se añaden sus consumidores.

- [ ] **Step 3: Crear el paso "profesional"**

Crea `src/app/(public)/[slug]/components/booking-sheet/StepEmployee.tsx`:

```tsx
'use client';

export interface StepEmployeeOption {
  id: string;
  name: string;
  photoUrl: string | null;
  color: string;
}

export interface StepEmployeeProps {
  employees: StepEmployeeOption[];
  onSelect: (employeeId: string | null) => void;
}

export function StepEmployee({ employees, onSelect }: StepEmployeeProps) {
  return (
    <div>
      <p className="mb-3 text-sm text-[var(--color-text-muted)]">¿Con quién quieres tu cita?</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="rounded-[var(--radius-theme)] border border-[var(--color-accent)] p-4 text-left font-medium text-[var(--color-text)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
        >
          Cualquier profesional
        </button>
        {employees.map((employee) => (
          <button
            key={employee.id}
            type="button"
            onClick={() => onSelect(employee.id)}
            className="rounded-[var(--radius-theme)] border p-4 text-left font-medium text-[var(--color-text)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
            style={{ borderColor: employee.color }}
          >
            {employee.name}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Crear el shell de la hoja de reserva con animación GSAP (solo paso EMPLOYEE)**

Crea `src/app/(public)/[slug]/components/booking-sheet/BookingSheet.tsx`:

```tsx
'use client';

import { useReducer, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { wizardReducer, createInitialWizardState } from '@/lib/public/wizard-state';
import { StepEmployee, type StepEmployeeOption } from './StepEmployee';

gsap.registerPlugin(useGSAP);

export interface BookingSheetService {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface BookingSheetProps {
  slug: string;
  service: BookingSheetService;
  employees: StepEmployeeOption[];
  maxBookingWindowDays: number;
  onClose: () => void;
}

export function BookingSheet({ service, employees, onClose }: BookingSheetProps) {
  const [state, dispatch] = useReducer(wizardReducer, service.id, createInitialWizardState);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.set(containerRef.current, { autoAlpha: 0 });
      gsap.set(panelRef.current, { yPercent: 100 });
      const tl = gsap.timeline();
      tl.to(containerRef.current, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' });
      tl.to(panelRef.current, { yPercent: 0, duration: 0.4, ease: 'power3.out' }, '<');
    },
    { scope: containerRef }
  );

  function handleClose() {
    gsap
      .timeline({ onComplete: onClose })
      .to(panelRef.current, { yPercent: 100, duration: 0.3, ease: 'power2.in' })
      .to(containerRef.current, { autoAlpha: 0, duration: 0.2 }, '<');
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-theme)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-theme)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--color-text)]">
            {service.name}
          </h2>
          <button type="button" onClick={handleClose} aria-label="Cerrar" className="text-[var(--color-text-muted)]">
            ✕
          </button>
        </div>

        {state.step === 'EMPLOYEE' && (
          <StepEmployee employees={employees} onSelect={(employeeId) => dispatch({ type: 'SELECT_EMPLOYEE', employeeId })} />
        )}

        {state.step !== 'EMPLOYEE' && (
          <p className="py-8 text-center text-[var(--color-text-muted)]">
            Este paso se completa en la Tarea 10 del plan de implementación.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Comprobar que el proyecto compila**

```powershell
pnpm exec tsc --noEmit
```

Expected: sin errores nuevos en `BookingSheet.tsx`, `StepEmployee.tsx` ni `actions.ts`.

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml src/app/(public)/[slug]/actions.ts "src/app/(public)/[slug]/components/booking-sheet/BookingSheet.tsx" "src/app/(public)/[slug]/components/booking-sheet/StepEmployee.tsx"
git commit -m "feat(public): shell de la hoja de reserva con animación GSAP y paso profesional"
```

---

### Tarea 10: Hoja de reserva — día/hora, datos del cliente, envío, éxito y error

**Antes de escribir componentes visuales:** invoca de nuevo las skills `frontend-design` y `gsap-react` si necesitas ajustar la composición de los nuevos pasos (chips de horas, formulario, pantalla de éxito).

**Files:**
- Create: `src/app/(public)/[slug]/components/booking-sheet/StepDateTime.tsx`, `src/app/(public)/[slug]/components/booking-sheet/StepCustomerData.tsx`, `src/app/(public)/[slug]/components/booking-sheet/StepSuccess.tsx`, `src/app/(public)/[slug]/components/booking-sheet/StepError.tsx`
- Modify: `src/app/(public)/[slug]/components/booking-sheet/BookingSheet.tsx` (reemplaza el contenido completo de la Tarea 9)

**Interfaces:**
- Consumes: `buildDayOptions`, `formatAppointmentDateTime`, `formatSlotTime`, `formatPriceCents`, `formatDurationMinutes` de `@/lib/public/format-datetime` (Tarea 2); `fetchAvailableSlotsAction`, `bookAppointmentAction`, `SlotOption` de `../../actions` (Tarea 9); `wizardReducer`, `createInitialWizardState` de `@/lib/public/wizard-state` (Tarea 5).
- Produces: `BookingSheet` completo (los 6 pasos), usado tal cual por `BookingLauncherProvider` (Tarea 11) — la firma de `BookingSheetProps` no cambia respecto a la Tarea 9.

- [ ] **Step 1: Crear el paso "día/hora"**

Crea `src/app/(public)/[slug]/components/booking-sheet/StepDateTime.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { buildDayOptions, formatSlotTime, type DayOption } from '@/lib/public/format-datetime';
import { getLocalDateString, addDaysToLocalDateString } from '@/lib/booking/timezone';
import { fetchAvailableSlotsAction, type SlotOption } from '../../actions';

export interface StepDateTimeProps {
  slug: string;
  serviceId: string;
  employeeId: string | null;
  maxBookingWindowDays: number;
  onBack: () => void;
  onSelect: (start: Date) => void;
}

export function StepDateTime({ slug, serviceId, employeeId, maxBookingWindowDays, onBack, onSelect }: StepDateTimeProps) {
  const [dayOptions] = useState(() => buildDayOptions(new Date(), maxBookingWindowDays));
  const [selectedDate, setSelectedDate] = useState(dayOptions[0]?.localDate ?? '');
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextAvailable, setNextAvailable] = useState<DayOption | null>(null);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNextAvailable(null);

    fetchAvailableSlotsAction({
      slug,
      serviceId,
      employeeId: employeeId ?? undefined,
      dateFrom: selectedDate,
      dateTo: selectedDate,
    }).then((result) => {
      if (cancelled) {
        return;
      }
      setSlots(result);
      setLoading(false);

      // Sin huecos ese día: busca el próximo día disponible dentro de la
      // ventana de reserva del negocio para poder sugerirlo (spec: "Sin
      // huecos disponibles → mensaje con próximo día disponible").
      if (result.length === 0) {
        const lastOption = dayOptions[dayOptions.length - 1];
        const searchFrom = addDaysToLocalDateString(selectedDate, 1);
        if (lastOption && searchFrom <= lastOption.localDate) {
          fetchAvailableSlotsAction({
            slug,
            serviceId,
            employeeId: employeeId ?? undefined,
            dateFrom: searchFrom,
            dateTo: lastOption.localDate,
          }).then((widerResult) => {
            if (cancelled || widerResult.length === 0) {
              return;
            }
            const earliestLocalDate = getLocalDateString(new Date(widerResult[0].start));
            const matchingOption = dayOptions.find((d) => d.localDate === earliestLocalDate);
            if (matchingOption) {
              setNextAvailable(matchingOption);
            }
          });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, employeeId, selectedDate, dayOptions]);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 text-sm text-[var(--color-accent)]">
        ← Cambiar profesional
      </button>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {dayOptions.map((day) => (
          <button
            key={day.localDate}
            type="button"
            onClick={() => setSelectedDate(day.localDate)}
            className={`shrink-0 rounded-[var(--radius-theme)] border px-3 py-2 text-sm capitalize ${
              day.localDate === selectedDate
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
                : 'text-[var(--color-text)]'
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-[var(--color-text-muted)]">Buscando huecos disponibles…</p>}

      {!loading && slots.length === 0 && (
        <div className="text-sm text-[var(--color-text-muted)]">
          <p>No hay huecos disponibles este día.</p>
          {nextAvailable && (
            <button
              type="button"
              onClick={() => setSelectedDate(nextAvailable.localDate)}
              className="mt-2 font-medium text-[var(--color-accent)] underline"
            >
              Ver la próxima disponibilidad ({nextAvailable.label})
            </button>
          )}
        </div>
      )}

      {!loading && slots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((slot) => (
            <button
              key={slot.start}
              type="button"
              onClick={() => onSelect(new Date(slot.start))}
              className="rounded-[var(--radius-theme)] border px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
            >
              {formatSlotTime(new Date(slot.start))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear el paso "datos del cliente"**

Crea `src/app/(public)/[slug]/components/booking-sheet/StepCustomerData.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { formatAppointmentDateTime, formatDurationMinutes, formatPriceCents } from '@/lib/public/format-datetime';

export interface StepCustomerDataService {
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface StepCustomerDataProps {
  service: StepCustomerDataService;
  slotStart: Date;
  onBack: () => void;
  onSubmit: (data: { name: string; phone: string; email: string }) => void;
}

export function StepCustomerData({ service, slotStart, onBack, onSubmit }: StepCustomerDataProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ name, phone, email });
  }

  return (
    <form onSubmit={handleSubmit}>
      <button type="button" onClick={onBack} className="mb-3 text-sm text-[var(--color-accent)]">
        ← Cambiar hora
      </button>

      <div className="mb-4 rounded-[var(--radius-theme)] bg-[var(--color-bg)] p-3 text-sm text-[var(--color-text-muted)]">
        <p className="font-medium text-[var(--color-text)]">{service.name}</p>
        <p>{formatAppointmentDateTime(slotStart)}</p>
        <p>
          {formatDurationMinutes(service.durationMinutes)} · {formatPriceCents(service.priceCents)}
        </p>
      </div>

      <label className="mb-2 block text-sm text-[var(--color-text)]">
        Nombre y apellidos
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded-[var(--radius-theme)] border px-3 py-2 text-[var(--color-text)]"
        />
      </label>
      <label className="mb-2 block text-sm text-[var(--color-text)]">
        Teléfono
        <input
          required
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="mt-1 w-full rounded-[var(--radius-theme)] border px-3 py-2 text-[var(--color-text)]"
        />
      </label>
      <label className="mb-4 block text-sm text-[var(--color-text)]">
        Email
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-[var(--radius-theme)] border px-3 py-2 text-[var(--color-text)]"
        />
      </label>

      <button
        type="submit"
        className="w-full rounded-[var(--radius-theme)] bg-[var(--color-accent)] py-3 font-semibold text-[var(--color-accent-contrast)]"
      >
        Confirmar reserva
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Crear la pantalla de éxito**

Crea `src/app/(public)/[slug]/components/booking-sheet/StepSuccess.tsx`:

```tsx
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
          ? 'Tu cita está pendiente de aprobación por parte del negocio. Te avisaremos por email en cuanto la confirmen.'
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

- [ ] **Step 4: Crear la pantalla de error con alternativas**

Crea `src/app/(public)/[slug]/components/booking-sheet/StepError.tsx`:

```tsx
'use client';

import { formatSlotTime } from '@/lib/public/format-datetime';

export interface StepErrorProps {
  message: string;
  alternativeSlots: Date[];
  onBack: () => void;
  onSelectAlternative: (start: Date) => void;
}

export function StepError({ message, alternativeSlots, onBack, onSelectAlternative }: StepErrorProps) {
  return (
    <div className="py-4">
      <p className="mb-4 text-[var(--color-text)]">{message}</p>

      {alternativeSlots.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {alternativeSlots.map((slot) => (
            <button
              key={slot.toISOString()}
              type="button"
              onClick={() => onSelectAlternative(slot)}
              className="rounded-[var(--radius-theme)] border px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
            >
              {formatSlotTime(slot)}
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={onBack} className="text-sm text-[var(--color-accent)]">
        ← Elegir otro horario
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Reemplazar `BookingSheet.tsx` con la versión completa (los 6 pasos)**

Sustituye el contenido completo de `src/app/(public)/[slug]/components/booking-sheet/BookingSheet.tsx` por:

```tsx
'use client';

import { useReducer, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { wizardReducer, createInitialWizardState } from '@/lib/public/wizard-state';
import { bookAppointmentAction } from '../../actions';
import { StepEmployee, type StepEmployeeOption } from './StepEmployee';
import { StepDateTime } from './StepDateTime';
import { StepCustomerData } from './StepCustomerData';
import { StepSuccess } from './StepSuccess';
import { StepError } from './StepError';

gsap.registerPlugin(useGSAP);

export interface BookingSheetService {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface BookingSheetProps {
  slug: string;
  service: BookingSheetService;
  employees: StepEmployeeOption[];
  maxBookingWindowDays: number;
  onClose: () => void;
}

export function BookingSheet({ slug, service, employees, maxBookingWindowDays, onClose }: BookingSheetProps) {
  const [state, dispatch] = useReducer(wizardReducer, service.id, createInitialWizardState);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.set(containerRef.current, { autoAlpha: 0 });
      gsap.set(panelRef.current, { yPercent: 100 });
      const tl = gsap.timeline();
      tl.to(containerRef.current, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' });
      tl.to(panelRef.current, { yPercent: 0, duration: 0.4, ease: 'power3.out' }, '<');
    },
    { scope: containerRef }
  );

  function handleClose() {
    gsap
      .timeline({ onComplete: onClose })
      .to(panelRef.current, { yPercent: 100, duration: 0.3, ease: 'power2.in' })
      .to(containerRef.current, { autoAlpha: 0, duration: 0.2 }, '<');
  }

  async function handleCustomerDataSubmit(data: { name: string; phone: string; email: string }) {
    dispatch({ type: 'SUBMIT_CUSTOMER_DATA', ...data });

    if (!state.slotStart) {
      return;
    }

    const result = await bookAppointmentAction({
      slug,
      serviceId: service.id,
      employeeId: state.employeeId ?? undefined,
      start: state.slotStart.toISOString(),
      customerName: data.name,
      customerPhone: data.phone,
      customerEmail: data.email,
    });

    if (result.ok) {
      dispatch({ type: 'SUBMISSION_SUCCEEDED', pendingApproval: result.pendingApproval ?? false });
    } else {
      dispatch({
        type: 'SUBMISSION_FAILED',
        message: result.message ?? 'No se pudo completar la reserva.',
        alternativeSlots: (result.alternativeSlots ?? []).map((iso) => new Date(iso)),
      });
    }
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-theme)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-theme)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--color-text)]">
            {service.name}
          </h2>
          <button type="button" onClick={handleClose} aria-label="Cerrar" className="text-[var(--color-text-muted)]">
            ✕
          </button>
        </div>

        {state.step === 'EMPLOYEE' && (
          <StepEmployee employees={employees} onSelect={(employeeId) => dispatch({ type: 'SELECT_EMPLOYEE', employeeId })} />
        )}

        {state.step === 'DATETIME' && (
          <StepDateTime
            slug={slug}
            serviceId={service.id}
            employeeId={state.employeeId}
            maxBookingWindowDays={maxBookingWindowDays}
            onBack={() => dispatch({ type: 'BACK' })}
            onSelect={(start) => dispatch({ type: 'SELECT_SLOT', start })}
          />
        )}

        {state.step === 'CUSTOMER_DATA' && state.slotStart && (
          <StepCustomerData
            service={service}
            slotStart={state.slotStart}
            onBack={() => dispatch({ type: 'BACK' })}
            onSubmit={handleCustomerDataSubmit}
          />
        )}

        {state.step === 'SUBMITTING' && (
          <p className="py-8 text-center text-[var(--color-text-muted)]">Confirmando tu reserva…</p>
        )}

        {state.step === 'SUCCESS' && (
          <StepSuccess pendingApproval={state.pendingApproval} onClose={handleClose} />
        )}

        {state.step === 'ERROR' && (
          <StepError
            message={state.errorMessage ?? ''}
            alternativeSlots={state.alternativeSlots}
            onBack={() => dispatch({ type: 'BACK' })}
            onSelectAlternative={(start) => dispatch({ type: 'SELECT_SLOT', start })}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Comprobar que el proyecto compila**

```powershell
pnpm exec tsc --noEmit
```

Expected: sin errores en los archivos de `components/booking-sheet/`.

- [ ] **Step 7: Commit**

```powershell
git add "src/app/(public)/[slug]/components/booking-sheet"
git commit -m "feat(public): completa la hoja de reserva (día/hora, datos, éxito y error)"
```

---

### Tarea 11: Escaparate `/{slug}`: cabecera, servicios, equipo y apertura de la hoja

**Antes de escribir componentes visuales:** invoca la skill `frontend-design` para definir la composición de la cabecera, las tarjetas de servicio y el equipo (jerarquía tipográfica, espaciado, uso de las variables de tema) antes de escribir el JSX de esta tarea.

**Files:**
- Create: `src/app/(public)/[slug]/components/BookingLauncherProvider.tsx`, `src/app/(public)/[slug]/components/ServiceCard.tsx`, `src/app/(public)/[slug]/page.tsx`, `src/app/(public)/[slug]/not-found.tsx`

**Interfaces:**
- Consumes: `getPublicBusinessBySlug` de `@/lib/public/business-lookup` (Tarea 6); `getThemeCssVariables` de `@/lib/theme/theme` (Tarea 1); `formatDurationMinutes`, `formatPriceCents` de `@/lib/public/format-datetime` (Tarea 2); `BookingSheet` de `./components/booking-sheet/BookingSheet` (Tareas 9-10); `prisma` de `@/lib/db`.
- Produces: ruta pública `/{slug}` completa. `useBookingLauncher(): { openService: (serviceId: string) => void }` — hook de contexto disponible para cualquier componente cliente dentro de `BookingLauncherProvider`.

- [ ] **Step 1: Crear el proveedor de contexto de la hoja de reserva**

Crea `src/app/(public)/[slug]/components/BookingLauncherProvider.tsx`:

```tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { BookingSheet } from './booking-sheet/BookingSheet';
import type { StepEmployeeOption } from './booking-sheet/StepEmployee';

interface BookingLauncherContextValue {
  openService: (serviceId: string) => void;
}

const BookingLauncherContext = createContext<BookingLauncherContextValue | null>(null);

export function useBookingLauncher(): BookingLauncherContextValue {
  const ctx = useContext(BookingLauncherContext);
  if (!ctx) {
    throw new Error('useBookingLauncher debe usarse dentro de <BookingLauncherProvider>');
  }
  return ctx;
}

export interface BookingLauncherService {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface BookingLauncherProviderProps {
  slug: string;
  services: BookingLauncherService[];
  employees: StepEmployeeOption[];
  maxBookingWindowDays: number;
  children: ReactNode;
}

export function BookingLauncherProvider({
  slug,
  services,
  employees,
  maxBookingWindowDays,
  children,
}: BookingLauncherProviderProps) {
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);
  const activeService = services.find((s) => s.id === openServiceId) ?? null;

  return (
    <BookingLauncherContext.Provider value={{ openService: setOpenServiceId }}>
      {children}
      {activeService && (
        <BookingSheet
          slug={slug}
          service={activeService}
          employees={employees}
          maxBookingWindowDays={maxBookingWindowDays}
          onClose={() => setOpenServiceId(null)}
        />
      )}
    </BookingLauncherContext.Provider>
  );
}
```

- [ ] **Step 2: Crear la tarjeta de servicio**

Crea `src/app/(public)/[slug]/components/ServiceCard.tsx`:

```tsx
'use client';

import { useBookingLauncher } from './BookingLauncherProvider';
import { formatDurationMinutes, formatPriceCents } from '@/lib/public/format-datetime';

export interface ServiceCardService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
}

export interface ServiceCardProps {
  service: ServiceCardService;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const { openService } = useBookingLauncher();

  return (
    <div className="rounded-[var(--radius-theme)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-theme)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--color-text)]">
            {service.name}
          </h3>
          {service.description && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{service.description}</p>
          )}
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {formatDurationMinutes(service.durationMinutes)} · {formatPriceCents(service.priceCents)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openService(service.id)}
          className="shrink-0 rounded-[var(--radius-theme)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast)]"
        >
          Reservar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Crear la página del escaparate**

Crea `src/app/(public)/[slug]/page.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getPublicBusinessBySlug } from '@/lib/public/business-lookup';
import { getThemeCssVariables } from '@/lib/theme/theme';
import { BookingLauncherProvider } from './components/BookingLauncherProvider';
import { ServiceCard } from './components/ServiceCard';

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getPublicBusinessBySlug(prisma, slug);

  if (!business) {
    notFound();
  }

  const theme = getThemeCssVariables(business);

  return (
    <div
      style={{ ...theme, fontFamily: 'var(--font-body)' } as CSSProperties}
      className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]"
    >
      <BookingLauncherProvider
        slug={business.slug}
        services={business.services}
        employees={business.employees}
        maxBookingWindowDays={business.maxBookingWindowDays}
      >
        <header className="mx-auto max-w-2xl px-6 py-10 text-center">
          {business.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logoUrl}
              alt={business.name}
              className="mx-auto mb-4 h-16 w-16 rounded-full object-cover"
            />
          )}
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold">{business.name}</h1>
          {business.address && <p className="mt-2 text-sm text-[var(--color-text-muted)]">{business.address}</p>}
        </header>

        <main className="mx-auto max-w-2xl px-6 pb-16">
          <section className="mb-10">
            <h2 className="mb-4 font-[family-name:var(--font-heading)] text-xl font-semibold">Servicios</h2>
            <div className="flex flex-col gap-4">
              {business.services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </section>

          {business.employees.length > 0 && (
            <section>
              <h2 className="mb-4 font-[family-name:var(--font-heading)] text-xl font-semibold">Equipo</h2>
              <div className="flex flex-wrap gap-4">
                {business.employees.map((employee) => (
                  <div key={employee.id} className="flex flex-col items-center gap-2">
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold text-white"
                      style={{ backgroundColor: employee.color }}
                    >
                      {employee.name.charAt(0)}
                    </div>
                    <p className="text-sm text-[var(--color-text)]">{employee.name}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </BookingLauncherProvider>
    </div>
  );
}
```

- [ ] **Step 4: Crear la página 404 amable para negocio inexistente o inactivo**

Crea `src/app/(public)/[slug]/not-found.tsx`:

```tsx
export default function NegocioNoEncontrado() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF6F0] px-6 text-center text-[#2B211B]">
      <h1 className="text-2xl font-semibold">Vaya, no encontramos este negocio</h1>
      <p className="max-w-md text-[#6B5D53]">
        Puede que el enlace esté mal escrito o que este negocio ya no esté disponible. Contacta con el negocio para
        obtener el enlace correcto.
      </p>
    </main>
  );
}
```

Nota: usa colores fijos (Boutique editorial) a propósito — es la única pantalla pública sin negocio conocido, así que no hay tema que aplicar.

- [ ] **Step 5: Arrancar el entorno de desarrollo y verificar visualmente**

```powershell
pnpm exec supabase start
pnpm db:seed
pnpm dev
```

Visita `http://localhost:3000/salon-aura` en el navegador. Expected: se ve la cabecera "Salón Aura" con la serif del preset (Playfair Display en los títulos, Lora en el cuerpo — nada debe renderizar en Arial), la lista de 4 servicios con precio/duración, el equipo (Marta Ruiz, Carlos Núñez), y al pulsar "Reservar" en cualquier servicio se abre la hoja inferior animada con el paso "¿Con quién quieres tu cita?". Visita `http://localhost:3000/no-existe`: Expected: página amable "Vaya, no encontramos este negocio".

Al terminar la verificación, **para el servidor dev con Ctrl+C** (la Tarea 14 exige el puerto 3000 libre: su e2e arranca su propio servidor apuntando a la BD de test).

- [ ] **Step 6: Comprobar que el build de producción funciona**

```powershell
pnpm build
```

Expected: termina con `✓ Compiled successfully` y lista `/[slug]` entre las rutas.

- [ ] **Step 7: Commit**

```powershell
git add "src/app/(public)/[slug]/components/BookingLauncherProvider.tsx" "src/app/(public)/[slug]/components/ServiceCard.tsx" "src/app/(public)/[slug]/page.tsx" "src/app/(public)/[slug]/not-found.tsx"
git commit -m "feat(public): escaparate /{slug} con cabecera, servicios, equipo y apertura de la hoja"
```

---

### Tarea 12: Página `/confirmar/{token}`

**Files:**
- Create: `src/app/(public)/confirmar/[token]/page.tsx`

**Interfaces:**
- Consumes: `confirmAppointment` de `@/lib/booking/tokens`; `getConfirmErrorMessage` de `@/lib/public/error-messages` (Tarea 4); `getAppointmentByConfirmToken` de `@/lib/public/appointment-lookup` (Tarea 6); `getPublicBusinessBySlug` de `@/lib/public/business-lookup` (Tarea 6); `getThemeCssVariables` de `@/lib/theme/theme` (Tarea 1); `formatAppointmentDateTime` de `@/lib/public/format-datetime` (Tarea 2); `prisma` de `@/lib/db`.
- Produces: ruta pública `/confirmar/{token}` que confirma la cita al cargar la página (visitar el enlace del email de Fase 4 ejecuta la confirmación) y enlaza a `/cita/{cancelToken}`.

- [ ] **Step 1: Crear la página de confirmación**

Crea `src/app/(public)/confirmar/[token]/page.tsx`:

```tsx
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { confirmAppointment } from '@/lib/booking/tokens';
import { getConfirmErrorMessage } from '@/lib/public/error-messages';
import { getAppointmentByConfirmToken } from '@/lib/public/appointment-lookup';
import { getPublicBusinessBySlug } from '@/lib/public/business-lookup';
import { getThemeCssVariables } from '@/lib/theme/theme';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';

export default async function ConfirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await confirmAppointment(prisma, token);

  if (!result.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[#FAF6F0] px-6 py-12 text-center text-[#2B211B]">
        <h1 className="text-2xl font-semibold">No hemos podido confirmar tu cita</h1>
        <p className="text-[#6B5D53]">{getConfirmErrorMessage(result.reason)}</p>
      </main>
    );
  }

  const summary = await getAppointmentByConfirmToken(prisma, token);
  const business = summary ? await getPublicBusinessBySlug(prisma, summary.businessSlug) : null;
  const theme = business ? getThemeCssVariables(business) : {};

  return (
    <main
      style={{ ...theme, fontFamily: 'var(--font-body, var(--font-lora))' } as CSSProperties}
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[var(--color-bg,#FAF6F0)] px-6 py-12 text-center text-[var(--color-text,#2B211B)]"
    >
      <h1 className="font-[family-name:var(--font-heading,serif)] text-2xl font-semibold">¡Cita confirmada!</h1>

      {summary && (
        <div className="w-full rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-surface,#fff)] p-6 shadow-[var(--shadow-theme,none)]">
          <p className="font-semibold">{summary.serviceName}</p>
          <p className="text-sm text-[var(--color-text-muted,#666)]">{formatAppointmentDateTime(summary.start)}</p>
          <p className="text-sm text-[var(--color-text-muted,#666)]">
            Con {summary.employeeName} · {summary.businessName}
          </p>
        </div>
      )}

      {summary && (
        <Link href={`/cita/${summary.cancelToken}`} className="text-sm underline text-[var(--color-accent,#B25539)]">
          Ver o cancelar mi cita
        </Link>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verificar manualmente el flujo con una cita real**

```powershell
pnpm dev
```

En otra terminal (con `pnpm exec supabase start` ya activo y el negocio demo sembrado), consulta el `confirmToken` de una cita creada a mano:

```powershell
pnpm exec tsx -e 'import { prisma } from "./src/lib/db"; prisma.appointment.findFirst().then(async (a) => { console.log(a?.confirmToken); await prisma.$disconnect(); });'
```

(Comillas simples de PowerShell a propósito: no interpolan, así que `$disconnect` llega literal a tsx.)

Si no hay ninguna cita, crea una reservando desde `http://localhost:3000/salon-aura` primero. Visita `http://localhost:3000/confirmar/<token>`. Expected: "¡Cita confirmada!" con el resumen del servicio, la fecha en español y el enlace "Ver o cancelar mi cita". Vuelve a visitar la misma URL: Expected: "No hemos podido confirmar tu cita" con el mensaje de `INVALID_STATE`.

Al terminar la verificación, **para el servidor dev con Ctrl+C** (la Tarea 14 exige el puerto 3000 libre).

- [ ] **Step 3: Comprobar que el build funciona**

```powershell
pnpm build
```

Expected: `✓ Compiled successfully`, incluye `/confirmar/[token]` en la lista de rutas.

- [ ] **Step 4: Commit**

```powershell
git add "src/app/(public)/confirmar/[token]/page.tsx"
git commit -m "feat(public): página /confirmar/{token}"
```

---

### Tarea 13: Página `/cita/{token}` (ver y cancelar)

**Files:**
- Create: `src/app/(public)/cita/[token]/actions.ts`, `src/app/(public)/cita/[token]/page.tsx`

**Interfaces:**
- Consumes: `cancelAppointment` de `@/lib/booking/tokens`; `getAppointmentByCancelToken` de `@/lib/public/appointment-lookup` (Tarea 6); `getPublicBusinessBySlug` de `@/lib/public/business-lookup` (Tarea 6); `getThemeCssVariables` de `@/lib/theme/theme` (Tarea 1); `formatAppointmentDateTime` de `@/lib/public/format-datetime` (Tarea 2); `prisma` de `@/lib/db`.
- Produces: ruta pública `/cita/{token}` con vista de estado + botón de cancelar; `cancelAppointmentAction(token: string): Promise<void>` — Server Action consumida por Playwright (Tarea 14) a través del formulario de la página.

- [ ] **Step 1: Crear la Server Action de cancelación**

Crea `src/app/(public)/cita/[token]/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { cancelAppointment } from '@/lib/booking/tokens';

export async function cancelAppointmentAction(token: string): Promise<void> {
  await cancelAppointment(prisma, token);
  revalidatePath(`/cita/${token}`);
}
```

- [ ] **Step 2: Crear la página de ver/cancelar cita**

Crea `src/app/(public)/cita/[token]/page.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { prisma } from '@/lib/db';
import { getAppointmentByCancelToken } from '@/lib/public/appointment-lookup';
import { getPublicBusinessBySlug } from '@/lib/public/business-lookup';
import { getThemeCssVariables } from '@/lib/theme/theme';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import { cancelAppointmentAction } from './actions';

const STATUS_MESSAGES: Record<string, string> = {
  PENDING: 'Tu cita está pendiente de confirmación.',
  CONFIRMED: 'Tu cita está confirmada.',
  CANCELLED: 'Esta cita está cancelada.',
  COMPLETED: 'Esta cita ya se completó.',
  NO_SHOW: 'Esta cita se marcó como no presentada.',
};

export default async function CitaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const summary = await getAppointmentByCancelToken(prisma, token);

  if (!summary) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[#FAF6F0] px-6 py-12 text-center text-[#2B211B]">
        <h1 className="text-2xl font-semibold">No encontramos esta cita</h1>
        <p className="text-[#6B5D53]">Puede que el enlace no sea correcto o que la cita ya no exista.</p>
      </main>
    );
  }

  const business = await getPublicBusinessBySlug(prisma, summary.businessSlug);
  const theme = business ? getThemeCssVariables(business) : {};
  const canCancel = summary.status === 'PENDING' || summary.status === 'CONFIRMED';

  return (
    <main
      style={{ ...theme, fontFamily: 'var(--font-body, var(--font-lora))' } as CSSProperties}
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-[var(--color-bg,#FAF6F0)] px-6 py-12 text-center text-[var(--color-text,#2B211B)]"
    >
      <h1 className="font-[family-name:var(--font-heading,serif)] text-2xl font-semibold">Tu cita</h1>

      <div className="w-full rounded-[var(--radius-theme,0.5rem)] bg-[var(--color-surface,#fff)] p-6 shadow-[var(--shadow-theme,none)]">
        <p className="font-semibold">{summary.serviceName}</p>
        <p className="text-sm text-[var(--color-text-muted,#666)]">{formatAppointmentDateTime(summary.start)}</p>
        <p className="text-sm text-[var(--color-text-muted,#666)]">
          Con {summary.employeeName} · {summary.businessName}
        </p>
        <p className="mt-3 text-sm font-medium text-[var(--color-text)]">{STATUS_MESSAGES[summary.status]}</p>
      </div>

      {canCancel && (
        <form action={cancelAppointmentAction.bind(null, token)}>
          <button
            type="submit"
            className="rounded-[var(--radius-theme,0.5rem)] border border-[var(--color-accent,#B25539)] px-6 py-3 font-semibold text-[var(--color-accent,#B25539)]"
          >
            Cancelar cita
          </button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verificar manualmente el flujo de cancelación**

```powershell
pnpm dev
```

Reserva una cita desde `http://localhost:3000/salon-aura`, copia el `cancelToken` de la BD (mismo procedimiento que en la Tarea 12) y visita `http://localhost:3000/cita/<token>`. Expected: se ve el resumen de la cita, el estado "Tu cita está pendiente de confirmación." y el botón "Cancelar cita". Púlsalo. Expected: la página se recarga y muestra "Esta cita está cancelada." sin el botón.

Al terminar la verificación, **para el servidor dev con Ctrl+C** (la Tarea 14 exige el puerto 3000 libre: su `playwright.config.ts` usa `reuseExistingServer: false` y arranca su propio servidor apuntando a la BD de test).

- [ ] **Step 4: Comprobar que el build funciona**

```powershell
pnpm build
```

Expected: `✓ Compiled successfully`, incluye `/cita/[token]`.

- [ ] **Step 5: Commit**

```powershell
git add "src/app/(public)/cita/[token]/actions.ts" "src/app/(public)/cita/[token]/page.tsx"
git commit -m "feat(public): página /cita/{token} para ver y cancelar una cita"
```

---

### Tarea 14: Configurar Playwright y test e2e reservar → confirmar → cancelar

**Files:**
- Create: `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/booking-flow.spec.ts`
- Modify: `package.json` (script `test:e2e`), `.gitignore`

**Interfaces:**
- Consumes: `seedDemoBusiness` de `src/lib/seed/demo-business`; `PrismaClient` de `@prisma/client`; toda la UI de las Tareas 8-13 (a través de peticiones HTTP reales).
- Produces: `pnpm test:e2e` ejecuta el flujo completo reservar → confirmar → cancelar contra `TEST_DATABASE_URL` con el servidor de desarrollo apuntando a esa misma base de datos (no toca la base de datos de desarrollo `DATABASE_URL`).

- [ ] **Step 1: Instalar Playwright**

```powershell
pnpm add -D @playwright/test --save-exact
pnpm exec playwright install --with-deps chromium
```

Expected: `package.json` gana `@playwright/test` en `devDependencies` sin `^`; Playwright descarga el binario de Chromium.

- [ ] **Step 2: Añadir el script `test:e2e`**

Edita `package.json` y añade, junto a `"test:watch"`, la línea:

```json
    "test:e2e": "playwright test",
```

El bloque `"scripts"` completo debe quedar:

```json
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed"
  },
```

- [ ] **Step 3: Crear el `globalSetup` de Playwright (migra, trunca y siembra `appoint_test`)**

Crea `e2e/global-setup.ts`:

```typescript
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { seedDemoBusiness } from '../src/lib/seed/demo-business';

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

  await seedDemoBusiness(prisma);
  await prisma.$disconnect();
}
```

- [ ] **Step 4: Crear `playwright.config.ts` (el servidor de desarrollo apunta a `TEST_DATABASE_URL`, no a la BD de desarrollo)**

Crea `playwright.config.ts`:

```typescript
import 'dotenv/config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    // Siempre false: si reutilizara un `pnpm dev` arrancado a mano, ese
    // servidor apuntaría a la BD de desarrollo (DATABASE_URL) y el e2e
    // leería/escribiría datos fuera de appoint_test. Antes de ejecutar
    // `pnpm test:e2e`, asegúrate de que no hay ningún dev server en el
    // puerto 3000 (para el de las verificaciones visuales con Ctrl+C).
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      DIRECT_URL: process.env.TEST_DATABASE_URL ?? '',
    },
  },
});
```

- [ ] **Step 5: Escribir el test e2e completo**

Crea `e2e/booking-flow.spec.ts`:

```typescript
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
```

- [ ] **Step 6: Añadir artefactos de Playwright a `.gitignore`**

Edita `.gitignore` y añade, al final:

```
# Playwright
/test-results/
/playwright-report/
/playwright/.cache/
/blob-report/
```

- [ ] **Step 7: Ejecutar el test e2e**

Asegúrate de que `pnpm exec supabase start` está activo (necesitas `TEST_DATABASE_URL` accesible) y ejecuta:

```powershell
pnpm test:e2e
```

Expected: `1 passed`. Si el paso de "reservar" falla porque no encuentra huecos en 8 días, revisa que el rango de fechas del bucle cubra al menos una semana completa (los tramos de Marta/Carlos son de martes a sábado).

- [ ] **Step 8: Ejecutar toda la suite de Vitest para confirmar que nada se rompió**

```powershell
pnpm test
```

Expected: todos los tests existentes (63 de Fases 1-2 + los añadidos en esta Fase 3) en verde.

- [ ] **Step 9: Commit**

```powershell
git add playwright.config.ts e2e/global-setup.ts e2e/booking-flow.spec.ts package.json pnpm-lock.yaml .gitignore
git commit -m "test(e2e): configura Playwright y añade el flujo reservar-confirmar-cancelar"
```

---

## Resumen de archivos nuevos

```
src/lib/theme/theme.ts
src/lib/theme/theme.test.ts
src/lib/public/format-datetime.ts
src/lib/public/format-datetime.test.ts
src/lib/public/dedupe-slots.ts
src/lib/public/dedupe-slots.test.ts
src/lib/public/error-messages.ts
src/lib/public/error-messages.test.ts
src/lib/public/wizard-state.ts
src/lib/public/wizard-state.test.ts
src/lib/public/business-lookup.ts
src/lib/public/business-lookup.test.ts
src/lib/public/appointment-lookup.ts
src/lib/public/appointment-lookup.test.ts
src/lib/public/slots-service.ts
src/lib/public/slots-service.test.ts
src/lib/public/booking-service.ts
src/lib/public/booking-service.test.ts
src/app/(public)/layout.tsx
src/app/(public)/[slug]/actions.ts
src/app/(public)/[slug]/page.tsx
src/app/(public)/[slug]/not-found.tsx
src/app/(public)/[slug]/components/BookingLauncherProvider.tsx
src/app/(public)/[slug]/components/ServiceCard.tsx
src/app/(public)/[slug]/components/booking-sheet/BookingSheet.tsx
src/app/(public)/[slug]/components/booking-sheet/StepEmployee.tsx
src/app/(public)/[slug]/components/booking-sheet/StepDateTime.tsx
src/app/(public)/[slug]/components/booking-sheet/StepCustomerData.tsx
src/app/(public)/[slug]/components/booking-sheet/StepSuccess.tsx
src/app/(public)/[slug]/components/booking-sheet/StepError.tsx
src/app/(public)/confirmar/[token]/page.tsx
src/app/(public)/cita/[token]/actions.ts
src/app/(public)/cita/[token]/page.tsx
playwright.config.ts
e2e/global-setup.ts
e2e/booking-flow.spec.ts
```
