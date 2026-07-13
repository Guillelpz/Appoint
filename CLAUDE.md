# Appoint

SaaS multi-tenant de gestión de citas para negocios locales (peluquerías, clínicas...). Cada negocio tiene una página pública con QR; sus clientes reservan sin registrarse. El distintivo del producto es el **diseño visual** (temas por negocio) y ser **muy responsive** (mobile-first).

## Documentos clave

- **⭐ Estado y siguientes pasos:** `docs/superpowers/CONTINUAR.md` — LEE ESTO PRIMERO al retomar el proyecto; dice qué está hecho, qué toca ahora (Fase 3: página pública) y los avisos técnicos del motor.
- **Especificación aprobada:** `docs/superpowers/specs/2026-07-12-appoint-design.md` — todas las decisiones validadas con el usuario.
- **Planes de implementación:** `docs/superpowers/plans/` (el de Fases 1-2 ya ejecutado y mergeado).

## Stack

- Next.js App Router + TypeScript + Tailwind CSS (monolito; lógica en Server Actions/Route Handlers)
- Prisma sobre PostgreSQL de Supabase · Supabase Auth (solo dueños/admin; clientes finales sin cuenta)
- Resend + React Email · Vercel (hosting + Cron) · GSAP para animaciones puntuales
- Tests: Vitest (unidad, TDD en lógica de negocio) + Playwright (e2e)

## Reglas del proyecto

- **Idioma:** UI y textos en español. Conversación con el usuario en español.
- **Multi-tenancy:** toda consulta a tablas de negocio filtra por `businessId` en la capa de aplicación (no se usa RLS). Nunca exponer datos entre negocios.
- **TDD obligatorio** en lógica de negocio (motor de huecos, anti-fraude, estados de cita) — skill `superpowers:test-driven-development`.
- **Theming:** las páginas públicas leen variables CSS del tema del negocio (3 presets; defecto "Boutique editorial"). No hardcodear colores/fuentes en componentes públicos.
- **Zona horaria:** las citas se almacenan en UTC; los negocios son españoles (Europe/Madrid) — cuidado con las conversiones.
- **Optimización de tokens:** orquestar con subagentes usando el modelo más barato que sirva (haiku para tareas mecánicas, sonnet para implementación estándar; el modelo principal solo orquesta/revisa/diseña).
- El usuario quiere ser consultado ante cualquier duda de negocio o decisión no cubierta por la spec — no improvisar.
- Indicar al usuario cada skill que se invoque durante el desarrollo.

## Comandos

- `pnpm exec supabase start` — levantar Postgres local (Docker Desktop activo; BD dev en 127.0.0.1:54322, BD de tests `appoint_test`). Necesario antes de test/dev.
- `pnpm test` — Vitest contra Postgres real (`TEST_DATABASE_URL`); 63 tests. `fileParallelism` desactivado a propósito (BD compartida): no lo reactives.
- `pnpm dev` / `pnpm build` / `pnpm lint` — Next.js (dev con turbopack; build sin él, a propósito).
- `pnpm exec prisma migrate dev` / `pnpm db:seed` — migraciones y seed demo ("Salón Aura").
- `.env` no versionado: copiar de `.env.example` (valores de Supabase local ya válidos).
- Versiones ancladas exactas (sin caret) a propósito: Next 15.5.20, Prisma 6.19.3, etc. No actualizar sin decisión explícita.
