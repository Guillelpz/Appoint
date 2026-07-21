# Appoint

SaaS multi-tenant de gestión de citas para negocios locales (peluquerías, clínicas...). Cada negocio tiene una página pública con QR; sus clientes reservan sin registrarse. El distintivo del producto es el **diseño visual** (temas por negocio) y ser **muy responsive** (mobile-first).

## Documentos clave

- **⭐ Estado y siguientes pasos:** `docs/superpowers/CONTINUAR.md` — LEE ESTO PRIMERO al retomar el proyecto, SIEMPRE, incluso a mitad de una fase. Dice qué fase está en curso, qué tarea del plan toca ahora, si hay una rama sin mergear (y su nombre), y los avisos técnicos acumulados. No asumas la fase por el número más alto mencionado en otro sitio — este documento es la única fuente de verdad de estado y se actualiza en cada punto de control, no solo al cerrar una fase.
- **Especificación aprobada:** `docs/superpowers/specs/2026-07-12-appoint-design.md` — todas las decisiones validadas con el usuario.
- **Planes de implementación:** `docs/superpowers/plans/` — un archivo `YYYY-MM-DD-fase-N-*.md` por fase, todos con el mismo formato (writing-plans). `docs/superpowers/CONTINUAR.md` dice cuál está en ejecución y en qué tarea.
- **Ledger de progreso de la fase en curso:** `.superpowers/sdd/progress.md` (gitignorado, no viaja con el repo). Si existe, es la fuente más precisa de qué tareas están hechas/revisadas dentro de la fase activa — léelo antes de retomar una ejecución a mitad de fase. Si no existe (p. ej. sesión nueva sin ese directorio), `CONTINUAR.md` es el resumen de respaldo.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS (monolito; lógica en Server Actions/Route Handlers)
- Prisma sobre PostgreSQL de Supabase · Supabase Auth (solo dueños/admin; clientes finales sin cuenta)
- Resend + React Email · Vercel (hosting + Cron) · GSAP para animaciones puntuales
- Tests: Vitest (unidad, TDD en lógica de negocio) + Playwright (e2e)

## Reglas del proyecto

- **Idioma:** UI y textos en español. Conversación con el usuario en español.
- **Multi-tenancy:** toda consulta a tablas de negocio filtra por `businessId` en la capa de aplicación (no se usa RLS). Nunca exponer datos entre negocios.
- **Super-admin (`/admin`, tabla `PlatformAdmin`, independiente de `Membership`/`MembershipRole`):** sus funciones operan a propósito SIN `businessId` (alcance de toda la plataforma) y llevan el prefijo `Platform`/`Admin` en el nombre (`platform-business-service.ts`, `platform-metrics-service.ts`, `requireAdminSession`, `isPlatformAdmin`) para no confundirse con los servicios tenant-scoped de `src/lib/panel/*`. Mismo patrón de sesión que `/panel` (defensa en profundidad: middleware + guard server-side), pero es una zona y una tabla de roles distintas.
- **Invitación de dueños vía Supabase Auth Admin API:** usar SIEMPRE `properties.hashed_token` de `generateLink({type:'invite'})` + `supabase.auth.verifyOtp({token_hash, type:'invite'})` desde una Server Action (nunca desde un Server Component — Next.js no permite escribir cookies ahí y `createSupabaseServerClient()` lo silencia). NUNCA usar `properties.action_link`: el cliente de navegador de este proyecto fija `flowType: 'pkce'`, y el `action_link` nativo de Supabase produce un callback de grant implícito que `@supabase/auth-js` rechaza (`AuthPKCEGrantCodeExchangeError`).
- **TDD obligatorio** en lógica de negocio (motor de huecos, anti-fraude, estados de cita) — skill `superpowers:test-driven-development`.
- **Theming:** las páginas públicas leen variables CSS del tema del negocio (3 presets; defecto "Boutique editorial"). No hardcodear colores/fuentes en componentes públicos.
- **Zona horaria:** las citas se almacenan en UTC; los negocios son españoles (Europe/Madrid) — cuidado con las conversiones.
- **Optimización de tokens:** orquestar con subagentes usando el modelo más barato que sirva (haiku para tareas mecánicas, sonnet para implementación estándar; el modelo principal solo orquesta/revisa/diseña).
- El usuario quiere ser consultado ante cualquier duda de negocio o decisión no cubierta por la spec — no improvisar.
- Indicar al usuario cada skill que se invoque durante el desarrollo.

## Comandos

- `pnpm exec supabase start` — levantar Postgres local (Docker Desktop activo; BD dev en 127.0.0.1:54322, BD de tests `appoint_test`). Necesario antes de test/dev.
- `pnpm test` — Vitest contra Postgres real (`TEST_DATABASE_URL`); 140 tests. `fileParallelism` desactivado a propósito (BD compartida): no lo reactives.
- `pnpm exec playwright test` — e2e (reservar→confirmar→cancelar); levanta su propio servidor Next contra `appoint_test`.
- `pnpm dev` / `pnpm build` / `pnpm lint` — Next.js (dev con turbopack; build sin él, a propósito).
- `pnpm exec prisma migrate dev` / `pnpm db:seed` — migraciones y seed demo ("Salón Aura").
- `.env` no versionado: copiar de `.env.example` (valores de Supabase local ya válidos).
- Versiones ancladas exactas (sin caret) a propósito: Next 15.5.20, Prisma 6.19.3, etc. No actualizar sin decisión explícita.
