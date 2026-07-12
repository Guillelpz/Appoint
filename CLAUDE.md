# Appoint

SaaS multi-tenant de gestión de citas para negocios locales (peluquerías, clínicas...). Cada negocio tiene una página pública con QR; sus clientes reservan sin registrarse. El distintivo del producto es el **diseño visual** (temas por negocio) y ser **muy responsive** (mobile-first).

## Documentos clave

- **Especificación aprobada:** `docs/superpowers/specs/2026-07-12-appoint-design.md` — léela antes de tocar nada; contiene todas las decisiones validadas con el usuario.
- **Planes de implementación:** `docs/superpowers/plans/` (cuando existan).

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

(Se completarán al crear el proyecto: dev, build, test, lint, prisma migrate...)
