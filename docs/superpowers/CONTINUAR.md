# Continuación del proyecto — estado y siguientes pasos

_Actualizado: 2026-07-13 tras el merge de las Fases 1-2 a `main`._

## Estado actual

- **Hecho y en `main`** (merge `6492edb`): Fase 1 (fundación) y Fase 2 (motor de reservas). 63 tests en verde contra Postgres real. Revisión global de rama aprobada (veredicto: Ready to merge).
- **Proceso usado**: superpowers — brainstorming → spec → writing-plans → subagent-driven-development (un implementador + un revisor por tarea, ledger en `.superpowers/sdd/progress.md`, que está gitignorado — si no existe, este documento es la fuente de verdad).
- **Política de modelos** (petición del usuario): haiku para tareas con código completo en el plan (transcripción), sonnet para integración/entorno y para TODOS los revisores por tarea, opus para la revisión global de rama. El modelo principal solo orquesta.

## Siguiente paso: Fase 3 — Página pública

Es el distintivo del producto (diseño visual). Alcance según la spec (`docs/superpowers/specs/2026-07-12-appoint-design.md`):

1. **Plan primero**: invocar `superpowers:writing-plans` y delegar la redacción en un subagente sonnet que lea la spec (sección "Flujos → Cliente" y "Theming") y este documento. Guardar en `docs/superpowers/plans/`.
2. Contenido esperado del plan: ruta pública `/{slug}` (escaparate: cabecera, servicios, equipo), hoja inferior (bottom sheet) de reserva (servicio → profesional/"cualquiera" → día/hora → datos → confirmar), sistema de temas con variables CSS servidas en servidor (3 presets, defecto Boutique editorial: crema/terracota #B25539, serif), Server Actions que envuelven el motor de `src/lib/booking/`, páginas `/confirmar/{token}` y `/cita/{token}`, y estados de error amables (SLOT_TAKEN con alternativas, token caducado, negocio inexistente).
3. **Skills a usar en la implementación de UI**: frontend-design, ui-ux-pro-max (paletas/tipografías), gsap-core/gsap-react (transiciones de la hoja inferior). Playwright para el e2e reservar→confirmar→cancelar (pendiente desde la spec).

## Avisos técnicos para la Fase 3 (del motor ya construido)

- **Contrato de `createAppointment`**: devuelve `{ok:false, reason}` tipado — reasons: RATE_LIMITED, BLACKLISTED, CUSTOMER_LIMIT_REACHED, CUSTOMER_OVERLAP, EMPLOYEE_UNAVAILABLE, NO_EMPLOYEE_AVAILABLE, SLOT_TAKEN, CUSTOMER_CONFLICT, BUSINESS_NOT_FOUND, SERVICE_NOT_FOUND. La UI debe traducirlos todos a mensajes amables.
- **Dedupe de huecos**: con "cualquier profesional", `getAvailableSlots` devuelve un slot POR EMPLEADO para el mismo start — la UI debe deduplicar por `start`.
- **`manualApproval`**: si el negocio lo activa, la cita queda PENDING hasta que el negocio confirme — la pantalla de éxito debe reflejarlo.
- **Deuda consciente aceptada** (no tocar sin necesidad): TOCTOU en límites anti-fraude fuera de la transacción; `checkRateLimit` acoplado al flujo insertar-antes-de-contar (un solo llamador).

## Después de la Fase 3

- **Fase 4**: emails (Resend + React Email; confirmación con enlace `/confirmar/{token}` — hasta entonces, en dev el token se puede leer de la BD), cron de recordatorios en Vercel.
- **Fase 5**: panel del negocio. **Fase 6**: super-admin + despliegue (falta comprar dominio; usuario familiarizado con Vercel/Supabase).
- Supabase Auth aún no configurado (solo hace falta a partir de la Fase 5 para dueños; el registro opcional de clientes por magic link puede esperar).

## Cómo arrancar el entorno

```powershell
pnpm exec supabase start   # Docker debe estar activo; BD dev en :54322
pnpm test                  # 63 tests contra appoint_test
pnpm dev                   # Next.js en localhost:3000
```

`.env` no está en git: copiar `.env.example` y ya vale para Supabase local.
