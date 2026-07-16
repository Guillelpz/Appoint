# Continuación del proyecto — estado y siguientes pasos

_Actualizado: 2026-07-16 tras completar la Fase 4 (emails y recordatorios) en la rama `fase-4-emails` (revisión global de rama y merge a `main` pendientes al escribir esto)._

## Estado actual

- **Hecho**: Fases 1-2 (fundación + motor de reservas, merge `6492edb`), Fase 3 (página pública, mergeada 2026-07-16) y **Fase 4 (emails y recordatorios)**: capa de envío intercambiable (`ResendEmailSender`/`ConsoleEmailSender` según `RESEND_API_KEY`), plantillas React Email (confirmación, solicitud pendiente de aprobación, nueva solicitud al negocio, cancelación al cliente y al negocio, recordatorio 24h), doble paso de `manualApproval` (`Appointment.emailVerifiedAt`: confirmar por token ya no equivale a aprobar la cita cuando `manualApproval` está activo), expiración perezosa corregida (una `PENDING` con `emailVerifiedAt` fijado ya no caduca ni se libera automáticamente), `/confirmar/{token}` ya no auto-confirma en `GET` (botón + Server Action), y cron horario `/api/cron/reminders` protegido por `CRON_SECRET`.
- **Verificación**: 201/201 tests Vitest contra Postgres real + 1 e2e Playwright (actualizado para pulsar el botón de confirmar) + lint + build, todo en verde (2026-07-16).
- **Proceso usado**: superpowers — writing-plans → subagent-driven-development (ledger en `.superpowers/sdd/progress.md`, gitignorado; si no existe, este documento es la fuente de verdad). Cada tarea pasó revisión por subagente; los hallazgos Important se corrigieron en el momento (idempotencias atómicas en cancelación y recordatorios, estado actual en la idempotencia de `confirmAppointment`, normalización de `APP_BASE_URL`).
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
