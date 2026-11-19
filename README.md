# Appoint

SaaS multi-tenant de gestión de citas para negocios locales (peluquerías, barberías, clínicas...). Cada negocio tiene una página pública (`/{slug}`) con un QR imprimible. Sus clientes reservan sin registrarse y confirman la cita por email. Los rasgos distintivos del producto son el diseño visual (tres temas por negocio más un color de acento) y el enfoque mobile-first.

- **Página pública** `/{slug}`: escaparate con el tema del negocio y una hoja inferior para reservar. Desde los emails se llega a `/confirmar/{token}` y `/cita/{token}` (ver o cancelar la cita y descargar el `.ics`).
- **Panel del negocio** `/panel`: agenda (día/semana), aprobación manual, citas manuales, servicios, equipo (horarios y ausencias), clientes (lista negra) y ajustes (tema y QR).
- **Super-admin** `/admin`: alta de negocios con invitación al dueño por email, activar/suspender negocios y métricas básicas.

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind CSS · Prisma 6 sobre PostgreSQL (Supabase) · Supabase Auth (solo dueños y super-admin) · Resend + React Email · Vercel · Vitest + Playwright.

## Arrancar en local

Requisitos: Node ≥ 22, pnpm 10 y Docker activo.

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm exec supabase start
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

- `cp .env.example .env`: los valores del stack local de Supabase ya son válidos.
- `pnpm exec supabase start`: levanta Postgres en `127.0.0.1:54322` y Auth en `:54321`.
- `pnpm db:seed` es opcional. Crea el negocio demo "Salón Aura" (`/salon-aura`), su dueño y un super-admin, con las credenciales de `.env.example`.
- `pnpm dev` arranca la app en http://localhost:3000. La ruta `/` sigue siendo la plantilla de Next.js: las páginas reales están en `/{slug}`, `/panel` y `/admin`.

Sin `RESEND_API_KEY`, los emails no se envían: se escriben en la consola.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm test` | Vitest contra el Postgres local (BD `appoint_test`) |
| `pnpm test:e2e` | Playwright (3 specs); levanta su propio servidor contra `appoint_test` |
| `pnpm lint` / `pnpm exec tsc --noEmit` | Lint y tipos |
| `pnpm build` | `prisma generate && next build` |
| `pnpm db:migrate` | `prisma migrate dev`. **Solo en local** |
| `pnpm db:deploy` | `prisma migrate deploy`. La única forma de migrar producción |

> ⚠️ Las suites de test y el seed son destructivos (`TRUNCATE` de todas las tablas, cuentas demo con contraseñas públicas en Auth) y abortan si su destino no es localhost. Nunca pongas credenciales de producción en el `.env` local.

## Documentación

- `CLAUDE.md`: reglas del proyecto y comandos.
- `docs/superpowers/CONTINUAR.md`: **estado actual y siguientes pasos** (la fuente de verdad).
- `docs/superpowers/specs/2026-07-12-appoint-design.md`: especificación aprobada, con un anexo de desviaciones.
- `docs/superpowers/DESPLIEGUE.md`: despliegue a producción y su estado.
- `docs/superpowers/LANZAMIENTO.md`: roadmap comercial (borrador).
- `docs/superpowers/plans/`: planes de implementación por fase.
