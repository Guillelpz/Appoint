# Continuación del proyecto — estado y siguientes pasos

_Actualizado: 2026-07-16 tras completar la Fase 3 (página pública) y mergearla a `main`._

## Estado actual

- **Hecho y en `main`**: Fases 1-2 (fundación + motor de reservas, merge `6492edb`) y **Fase 3 mergeada el 2026-07-16** (`gh` CLI no está instalado en la máquina; el merge se hizo con git directo, sin PR): theming (3 presets con variables CSS por negocio), escaparate `/{slug}` (cabecera, galería, servicios, equipo), hoja inferior de reserva con GSAP (servicio → profesional/"cualquiera" → día/hora → datos → confirmar), Server Actions sobre `src/lib/booking/`, `/confirmar/{token}` con descarga `.ics`, `/cita/{token}` con cancelación, y e2e Playwright reservar→confirmar→cancelar.
- **Verificación**: 140 tests Vitest contra Postgres real + 1 e2e Playwright + lint + build, todo en verde (2026-07-16).
- **Revisión global de rama (opus)**: veredicto _Ready to merge_. El único hallazgo Important (falta de validación server-side de los datos del cliente) se corrigió en `e8cfdaa` (`validate-booking-input.ts`: valida y normaliza nombre/teléfono/email/fecha antes de tocar la BD).
- **Proceso usado**: superpowers — writing-plans → subagent-driven-development (ledger en `.superpowers/sdd/progress.md`, gitignorado; si no existe, este documento es la fuente de verdad).
- **Política de modelos** (petición del usuario): haiku para tareas con código completo en el plan (transcripción), sonnet para integración/entorno y para TODOS los revisores por tarea, opus para la revisión global de rama. El modelo principal solo orquesta.

## Siguiente paso: Fase 4 — Emails y recordatorios

Alcance según la spec (`docs/superpowers/specs/2026-07-12-appoint-design.md`):

1. **Plan primero**: invocar `superpowers:writing-plans` y delegar la redacción en un subagente sonnet que lea la spec, este documento y el código de `src/lib/public/`.
2. Contenido esperado: Resend + React Email (plantillas con el tema del negocio), email de confirmación con enlace `/confirmar/{token}`, email al negocio si `manualApproval`, cron de recordatorios en Vercel.

## Avisos técnicos para la Fase 4 (de la revisión final de la Fase 3)

- **⚠️ Confirmar-en-GET**: hoy `/confirmar/{token}` confirma la cita al cargar la página (page.tsx llama a `confirmAppointment` en el render). En cuanto el enlace viaje por email, los escáneres de enlaces (Outlook, WhatsApp, Slack) lo visitarán y auto-confirmarán — y con `manualApproval` activo se saltarían la aprobación del negocio. **Antes de enviar emails hay que pasar la confirmación a una acción explícita (botón → POST)** y valorar excluir las citas con aprobación manual del auto-confirmado por token.
- **Datos ya normalizados**: `validate-booking-input.ts` garantiza email en minúsculas con forma válida y teléfono `+?\d{9,15}` sin separadores — las plantillas de email pueden confiar en ello. Mensaje de rechazo: `INVALID_INPUT_MESSAGE` en `error-messages.ts` (fuera del switch exhaustivo del motor, a propósito).
- **Copy provisional**: la pantalla de éxito dice "Te hemos enviado un email…" desde la Fase 3 (decisión del plan §27) — la Fase 4 lo hace verdad.
- En dev, hasta que haya emails, los tokens se leen de la BD.

## Minors conocidos (no bloquean; candidatos a limpieza oportunista)

- Alternativas de hueco solo se ofrecen con `SLOT_TAKEN`; los mensajes de `EMPLOYEE_UNAVAILABLE`/`NO_EMPLOYEE_AVAILABLE` invitan a "otro horario" sin ofrecerlas (`booking-service.ts`).
- `cancelAppointmentAction` descarta el resultado y confía en el re-render; `getCancelErrorMessage` está escrito y testeado pero sin usar.
- Al volver de un error en la hoja de reserva, se pierden nombre/teléfono/email tecleados (remonta `StepCustomerData`).
- El selector de día renderiza `maxBookingWindowDays` botones (30 por defecto; pesado si un negocio configura ventanas grandes).
- Pantalla neutra de "no encontrado" duplicada ×3 (candidato `NeutralErrorScreen`); descarga `.ics` vía data-URI sin verificar en iOS Safari; `img` en vez de `next/image` (sin `remotePatterns`).
- **Deuda consciente del motor (no tocar sin necesidad)**: TOCTOU en límites anti-fraude fuera de la transacción; `checkRateLimit` acoplado al flujo insertar-antes-de-contar; los tests de carrera aceptan `EMPLOYEE_UNAVAILABLE` además de `SLOT_TAKEN` (pre-check fuera de la transacción).

## Avisos del motor que siguen vigentes

- **Contrato de `createAppointment`**: `{ok:false, reason}` tipado — la UI pública ya traduce los 10 reasons a mensajes amables (`error-messages.ts`, switches exhaustivos con `never`).
- **Dedupe de huecos**: con "cualquier profesional" el motor devuelve un slot por empleado; la capa pública ya deduplica por `start` (`getDedupedAvailableSlotsForBusiness`).
- **`manualApproval`**: la cita queda PENDING y la pantalla de éxito ya lo refleja (`pendingApproval`).

## Después de la Fase 4

- **Fase 5**: panel del negocio (requiere configurar Supabase Auth para dueños). **Fase 6**: super-admin + despliegue (falta comprar dominio; usuario familiarizado con Vercel/Supabase).

## Cómo arrancar el entorno

```powershell
pnpm exec supabase start        # Docker debe estar activo; BD dev en :54322
pnpm test                       # 140 tests contra appoint_test
pnpm exec playwright test       # e2e (levanta su propio servidor)
pnpm dev                        # Next.js en localhost:3000
```

`.env` no está en git: copiar `.env.example` y ya vale para Supabase local.
