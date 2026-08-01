# Rediseño de las páginas de login — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar visualmente `/panel/login` y `/admin/login` extrayendo un componente `LoginCard` compartido, sin tocar la autenticación ni romper los e2e existentes.

**Architecture:** Un Server Component de presentación, `src/components/LoginCard.tsx`, recibe título, descripción, Server Action y mensaje de error por props. Cada página de login queda reducida a leer sus `searchParams` y renderizarlo. Los Server Actions siguen separados por zona a propósito.

**Tech Stack:** Next.js 15.5.20 (App Router, Server Components), React 19.1.0, Tailwind CSS v4, TypeScript. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-08-01-rediseno-login-design.md`

## Entorno de trabajo

Este plan se ejecuta en un worktree ya preparado. **No crees otro.**

- Ruta: `C:\Projects\Claude\Appoint\.claude\worktrees\rediseno-login`
- Rama: `worktree-rediseno-login`, partiendo de `main` (`816d939`)
- `pnpm install` y `pnpm exec prisma generate` ya ejecutados
- `.env` ya copiado a mano (no está versionado; si falta, cópialo de la raíz del repo principal)
- Baseline verificado en verde antes de empezar: **394/394 Vitest**, `tsc --noEmit` limpio, `lint` limpio
- Postgres local activo en `127.0.0.1:54322` (requisito de Vitest y Playwright)

## Global Constraints

Estas reglas aplican a **todas** las tareas. Romper cualquiera invalida la tarea.

- **Cero dependencias nuevas.** Nada de `pnpm add`. Sin shadcn/ui, sin Radix, sin `class-variance-authority`, sin `clsx`, sin `tailwind-merge`, sin `lucide-react`. Solo clases Tailwind directas.
- **Sin tocar `src/app/globals.css`.** No se añaden tokens de tema.
- **Sin tocar los Server Actions** (`src/app/panel/login/actions.ts`, `src/app/admin/login/actions.ts`). Ni sus nombres, ni sus firmas, ni sus `redirect()`.
- **No se crea ningún archivo nuevo salvo `src/components/LoginCard.tsx`.** En particular **NO** se crea `src/components/SubmitButton.tsx`: ese componente lo introduce la rama `perf/optimizacion-latencia`, que sigue sin commitear, y duplicarlo aquí solaparía dos trabajos que se decidió mantener separados. El botón de envío es un `<button type="submit">` plano, exactamente como en `main`.
- **Sin modificar ningún archivo de `e2e/`.** Que los specs pasen sin tocarlos es la prueba de que el rediseño es puramente visual. Si un spec falla, el fallo está en el código nuevo, no en el spec.
- **Contrato con el backend, valores exactos y no negociables:**
  - `name="email"` y `name="password"` en los inputs.
  - `<label htmlFor="email">` con texto exactamente `Email`, e `<input id="email">`.
  - `<label htmlFor="password">` con texto exactamente `Contraseña`, e `<input id="password">`.
  - Texto del botón exactamente `Entrar`, en un `<button type="submit">`.
- **Idioma:** todo el texto de UI en español.
- **Paleta:** `slate` (la del back-office). Nada de leer el tema del negocio: eso es solo para `src/app/(public)/**`.
- **Sin tests unitarios nuevos.** Es presentación sin lógica; la regla de TDD del proyecto aplica a lógica de negocio.

---

### Task 1: Componente `LoginCard` y rediseño de `/panel/login`

**Files:**
- Create: `src/components/LoginCard.tsx`
- Modify: `src/app/panel/login/page.tsx` (reemplazo completo, 44 líneas → 13)
- Test: `e2e/panel-approval.spec.ts` (existente, **no se modifica**)

**Interfaces:**
- Consumes: `signInAction` de `./actions`, firma `(formData: FormData) => Promise<void>`.
- Produces: `LoginCard` exportado con nombre desde `@/components/LoginCard`, con esta interfaz exacta, que la Task 2 reutiliza sin cambios:

```ts
interface LoginCardProps {
  title: string;
  description: string;
  action: (formData: FormData) => Promise<void>;
  error?: string;
}
```

- [ ] **Step 1: Comprobar que el e2e del panel pasa ANTES de tocar nada**

Establece el punto de partida: si ya falla, el fallo no es tuyo.

Run: `pnpm exec playwright test e2e/panel-approval.spec.ts`
Expected: PASS (1 passed).

Si falla por timeout de compilación en frío, vuelve a lanzarlo: es un flake conocido y documentado de este spec en aislamiento contra un servidor recién arrancado (ver `docs/superpowers/CONTINUAR.md`, "Avisos técnicos"). No lo investigues.

- [ ] **Step 2: Crear `src/components/LoginCard.tsx`**

Archivo completo:

```tsx
interface LoginCardProps {
  title: string;
  description: string;
  // Firma exacta de signInAction / signInAdminAction. Un Server Action puede
  // pasarse como prop entre Server Components: viaja como referencia, no se
  // serializa su cuerpo.
  action: (formData: FormData) => Promise<void>;
  error?: string;
}

// Tarjeta de acceso compartida por /panel/login y /admin/login. SOLO
// presentación: cada zona conserva su propio Server Action, porque /panel y
// /admin son superficies de autenticación distintas, con tablas de roles y
// guards separados a propósito (ver CLAUDE.md).
export function LoginCard({ title, description, action, error }: LoginCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm sm:w-96">
        <div className="p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{description}</p>
        </div>

        <form action={action}>
          <div className="grid gap-4 p-6 pt-0">
            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="grid gap-2">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              />
            </div>
          </div>

          <div className="p-6 pt-0">
            <button
              type="submit"
              className="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              Entrar
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
```

Notas para quien lo escriba:
- **No** lleva `'use client'`, y no lo necesita: no hay estado ni manejadores de eventos. Todo el componente es servidor.
- El `<main>` vive aquí porque las páginas actuales lo renderizaban y no hay layout intermedio en `/panel` ni en `/admin` (solo el root layout).
- El aviso de error va **dentro** de la tarjeta y lleva `role="alert"` para que los lectores de pantalla lo anuncien.

- [ ] **Step 3: Reescribir `src/app/panel/login/page.tsx`**

Archivo completo (sustituye las 44 líneas actuales):

```tsx
import { signInAction } from './actions';
import { LoginCard } from '@/components/LoginCard';

export default async function PanelLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <LoginCard
      title="Panel del negocio"
      description="Accede con la cuenta de dueño de tu negocio."
      action={signInAction}
      error={error}
    />
  );
}
```

Todo el marcado que esta página tenía inline pasa a vivir en `LoginCard`.

- [ ] **Step 4: Comprobar tipos y lint**

Run: `pnpm exec tsc --noEmit`
Expected: sin salida (éxito).

Run: `pnpm lint`
Expected: sin errores ni avisos.

- [ ] **Step 5: Verificar que el e2e del panel sigue pasando, sin tocarlo**

Este es el gate real de la tarea. El spec ejercita `getByLabel('Email')`, `getByLabel('Contraseña')` y `getByRole('button', { name: 'Entrar' })` sobre `/panel/login` y después completa un login real contra Supabase Auth.

Run: `pnpm exec playwright test e2e/panel-approval.spec.ts`
Expected: PASS (1 passed), **con el spec sin modificar** (`git status` no debe mostrar nada bajo `e2e/`).

Si falla en `getByLabel`, el problema es que faltan `htmlFor`/`id` o que el texto de la etiqueta no coincide exactamente. Si falla tras pulsar Entrar, es que a un input le falta su `name`.

- [ ] **Step 6: Commit**

```bash
git add src/components/LoginCard.tsx src/app/panel/login/page.tsx
git commit -m "feat(panel): redisena /panel/login con un LoginCard compartido"
```

---

### Task 2: Rediseño de `/admin/login`

**Files:**
- Modify: `src/app/admin/login/page.tsx` (reemplazo completo, 44 líneas → 13)
- Test: `e2e/admin-flow.spec.ts` (existente, **no se modifica**)

**Interfaces:**
- Consumes: `LoginCard` de `@/components/LoginCard`, creado en la Task 1, con la interfaz `LoginCardProps` reproducida ahí. No se modifica ese componente en esta tarea.
- Consumes: `signInAdminAction` de `./actions`, firma `(formData: FormData) => Promise<void>`.

- [ ] **Step 1: Reescribir `src/app/admin/login/page.tsx`**

Archivo completo (sustituye las 44 líneas actuales):

```tsx
import { signInAdminAction } from './actions';
import { LoginCard } from '@/components/LoginCard';

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <LoginCard
      title="Panel de super-administración"
      description="Accede con tu cuenta de super-admin."
      action={signInAdminAction}
      error={error}
    />
  );
}
```

Los textos son exactamente los actuales: solo cambia la presentación, no el copy.

- [ ] **Step 2: Comprobar tipos y lint**

Run: `pnpm exec tsc --noEmit`
Expected: sin salida (éxito).

Run: `pnpm lint`
Expected: sin errores ni avisos.

- [ ] **Step 3: Verificar que el e2e de admin sigue pasando, sin tocarlo**

Run: `pnpm exec playwright test e2e/admin-flow.spec.ts`
Expected: PASS (1 passed), **con el spec sin modificar**.

Este spec hace login de super-admin en `/admin/login`, da de alta un negocio, e invita a un dueño que después fija su contraseña en `/panel/invitacion`. Ojo: `/panel/invitacion` **no** usa `LoginCard` y no se toca en este plan; si algo falla ahí, no es de esta tarea.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/login/page.tsx
git commit -m "feat(admin): redisena /admin/login reutilizando LoginCard"
```

---

### Task 3: Verificación completa de la rama

**Files:**
- Ninguno que crear o modificar. Es la tanda de gates completa sobre el trabajo de las Tasks 1 y 2.

**Interfaces:**
- Consumes: todo lo producido por las Tasks 1 y 2.
- Produces: nada de código. Produce el veredicto de que la rama está lista.

- [ ] **Step 1: Confirmar que no se tocó nada prohibido**

```bash
git diff --name-only main...HEAD
```

Expected: exactamente estos cuatro archivos, ni uno más:
```
docs/superpowers/plans/2026-08-01-rediseno-login.md
src/app/admin/login/page.tsx
src/app/panel/login/page.tsx
src/components/LoginCard.tsx
```

(`docs/superpowers/specs/2026-08-01-rediseno-login-design.md` ya está commiteado en `cc7bd47`, así que también aparecerá si comparas contra `main`.)

Si aparece cualquier archivo bajo `e2e/`, `src/app/*/login/actions.ts`, `src/app/globals.css`, `package.json` o `pnpm-lock.yaml`, **para**: se ha violado una restricción global.

`src/components/SubmitButton.tsx` **no debe aparecer**. Si aparece, bórralo: pertenece a la rama `perf/optimizacion-latencia`, no a esta.

- [ ] **Step 2: Gates estáticos**

Run: `pnpm lint`
Expected: sin errores ni avisos.

Run: `pnpm exec tsc --noEmit`
Expected: sin salida.

Run: `pnpm build`
Expected: build correcto. `/panel/login` y `/admin/login` deben seguir apareciendo en la tabla de rutas.

- [ ] **Step 3: Suite de unidad**

Run: `pnpm test`
Expected: **394 passed (394)**, 51 archivos. El mismo número que el baseline: este cambio no añade ni quita tests.

Lánzalo en solitario, sin otro proceso de Vitest en paralelo (la BD `appoint_test` es compartida y hay un flake conocido de clave foránea si corren dos a la vez).

- [ ] **Step 4: Suite e2e completa**

Run: `pnpm exec playwright test`
Expected: **3 passed** (`booking-flow.spec.ts`, `panel-approval.spec.ts`, `admin-flow.spec.ts`), con los tres specs sin modificar.

Correr los tres juntos es además la forma estable de invocarlos (`admin-flow` calienta las rutas y evita el flake de compilación en frío de `panel-approval`).

- [ ] **Step 5: Revisión visual manual**

Run: `pnpm dev`

Abre `http://localhost:3000/panel/login` y `http://localhost:3000/admin/login` y comprueba:
- La tarjeta se ve centrada, con borde y sombra, y a 384 px a partir de `sm`.
- A 375 px de ancho (móvil) la tarjeta ocupa el ancho disponible con margen lateral y nada se desborda horizontalmente.
- Tabulando, el foco es visible en ambos inputs y en el botón.
- `http://localhost:3000/panel/login?error=Email%20o%20contrase%C3%B1a%20incorrectos.` muestra el aviso rojo dentro de la tarjeta.
- Con credenciales incorrectas, se vuelve a `/panel/login` con ese mismo aviso visible.

- [ ] **Step 6: Commit del plan**

```bash
git add docs/superpowers/plans/2026-08-01-rediseno-login.md
git commit -m "docs: plan de implementacion del rediseno de login"
```

(Si el plan ya se commiteó al escribirlo, salta este paso.)

---

## Notas para el revisor

- **Corrección de un defecto de este plan (2026-08-01).** Su primera versión especificaba un `SubmitButton` con estado "Entrando…" porque se redactó leyendo `src/app/*/login/page.tsx` desde el checkout de la rama `perf/optimizacion-latencia`, que contiene un refactor de ese componente **sin commitear**. En `main` esas páginas usan un `<button type="submit">` plano y `src/components/SubmitButton.tsx` no existe. Corregido por decisión del usuario: esta rama no incorpora `SubmitButton` y el login no gana estado de carga. No lo reintroduzcas.

- **La ausencia de tests nuevos es deliberada**, no un olvido. `LoginCard` no tiene lógica: ni estado, ni ramas más allá de `error &&`, ni cálculos. La cobertura real la dan los dos e2e que ya ejercitan estas pantallas de punta a punta contra Supabase Auth. Añadir un test de render que afirme que existe un `<h1>` probaría el framework, no el código.
- **Los Server Actions duplicados se dejan como están** a propósito (ver la spec, "Qué no se comparte"). Que un revisor proponga unificarlos es esperable; la respuesta es no.
- **Tres hallazgos preexistentes quedan sin corregir** y están documentados en la spec: `<html lang="en">` con UI en español, `body { font-family: Arial }` anulando las fuentes Geist, y el texto de `?error=` reflejado tal cual desde la URL. Los tres son globales y corregirlos aquí ampliaría el alcance sin pedirlo.
