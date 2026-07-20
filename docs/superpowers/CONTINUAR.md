# Continuación del proyecto — estado y siguientes pasos

_Actualizado: 2026-07-20 tras completar la Fase 5 (panel del negocio): revisión global aprobada (opus, "Ready to merge") y rama `fase-5-panel` mergeada a `main` (`76d0095`) y pusheada a origin. 323/323 tests + lint + tsc + build + 2/2 Playwright en verde._

## Estado actual

- **Hecho**: Fases 1-2 (fundación + motor de reservas, merge `6492edb`), Fase 3 (página pública, mergeada 2026-07-16), Fase 4 (emails y recordatorios, mergeada a `main` 2026-07-17) y **Fase 5 (panel del negocio)**.
- **Fase 5 construido**: autenticación Supabase Auth (email+contraseña) con middleware de protección en `src/middleware.ts` + defensa en profundidad (`requirePanelSession()`); acceso actual restringido a **rol OWNER solo** (STAFF fuera de alcance); agenda `/panel` con vistas día/semana simplificadas (sin agrupar por franjas horarias), con acciones de aprobar/rechazar pendientes (con envío de emails), completar/no-show, cancelar y crear cita manual (nombre obligatorio, contacto opcional, nace `CONFIRMED`, respeta horario sin anti-fraude); CRUD de `/panel/servicios` (con `active` soft-toggle) y `/panel/equipo` (servicios por empleado, horarios semanales con múltiples tramos, ausencias); `/panel/clientes` (historial de citas + lista negra con block/unblock verificado end-to-end); `/panel/ajustes` (datos del negocio, tema con vista previa en vivo usando `getThemeCssVariables`, políticas de reserva, descarga QR de URL pública); emails nuevos (aprobación, rechazo, cancelación desde negocio) con tolerancia a contacto faltante (citas manuales sin email/teléfono cliente).
- **Verificación**: 323/323 tests Vitest contra Postgres real + lint + tsc + build completo + 2/2 e2e Playwright (`booking-flow.spec.ts`, `panel-approval.spec.ts` con walkthroughs del flujo de aprobación) — todo verde; re-verificado sobre `main` tras el merge.
- **Disciplina multi-tenancy**: cada servicio del panel toma `businessId` explícito resuelto server-side desde la sesión (nunca de entrada cliente); operaciones state-changing usan `updateMany` atómico (businessId + estado origen en `where`) para evitar carreras cross-tenant; hallazgos de revisión de tareas atraparon y corrigieron brechas reales antes del merge (validación de `ServiceEmployee` contra businessId del llamante, retorno NOT_FOUND en blacklist cross-tenant).
- **Revisión global (opus)**: veredicto _Ready to merge_. El único hallazgo Important — desactivar un empleado ocultaba de la agenda sus citas ya existentes (sin columna donde renderizarlas) — se corrigió en `1f239a4` (unión de empleados activos + inactivos-con-citas-en-rango, columna etiquetada "(inactivo)"). Este hallazgo solo era visible con perspectiva de rama completa, no por tarea.
- **Proceso usado**: superpowers — writing-plans → subagent-driven-development (ledger en `.superpowers/sdd/progress.md`, gitignorado; si no existe, este documento es la fuente de verdad). Cada tarea pasó revisión por subagente; hallazgos se corrigieron en el momento.
- **Política de modelos** (petición del usuario): haiku para tareas mecánicas, sonnet para implementación estándar, opus para revisión global. El modelo principal solo orquesta.

## Siguiente paso: Fase 6 — Super-admin + despliegue

Alcance según la spec (`docs/superpowers/specs/2026-07-12-appoint-design.md`):

1. **Super-admin panel** (`/admin`): alta de negocios, activación/suspensión, métricas básicas.
2. **Plantilla de email "invitación de dueño"**: excluida de la Fase 4, necesaria para invitar dueños reales (o staff si se extiende el rol).
3. **Despliegue real**: dominio, certificados, Vercel + Supabase en producción.

Este documento será la fuente de verdad de estado si el ledger `.superpowers/sdd/progress.md` no está disponible.

## Avisos técnicos para la Fase 5 (histórico)

Estos patrones fueron establecidos en Fase 5 y se reutilizan en Fase 6:

- **Contrato de `requirePanelSession()`** (`src/lib/panel/session.ts`): devuelve `{ userId, email, businessId }` resuelto server-side desde la sesión autenticada. La defensa en profundidad rechaza requests sin sesión válida. Para extender a `SUPERADMIN`, se podría usar el mismo patrón con `getOwnerBusinessIdForUser` adaptado para resolver el rol.
- **Patrón de inyección de `EmailSender`** (`src/lib/email/get-email-sender.ts`, tipos en `src/lib/email/types.ts`): `emailSender?: EmailSender`, por defecto `getEmailSender()`, permite testar con Postgres real sin tocar red. Se reutiliza en todas las operaciones que envían email del panel (aprobación, rechazo, cancelación, cita manual).
- **`AppointmentEmailContext`** (`src/lib/email/appointment-notifications.tsx`): shape estable usado por todas las funciones `sendXEmail` — reutilizable para nuevas plantillas.
- **Seedeo de usuario demo** (`src/lib/seed/demo-owner.ts`, `src/lib/seed/demo-business.ts`, invocado desde `prisma/seed.ts`): `ensureDemoOwnerAuthUser` + `seedDemoOwnerMembership` como plantilla para el alta de negocios reales y su invitación de dueño (Fase 6).
- Rol `STAFF` declarado en el enum `MembershipRole` pero sin UI ni lógica de autorización — candidato para Fase 6 o posterior.

## Avisos técnicos para la Fase 6

- **Autenticación super-admin**: reutilizar `requirePanelSession()` con extensión de rol (resolver `SUPERADMIN` desde membership, similar a cómo se resuelve `OWNER`). La cadena de rutas `/admin/**` se protegería análogamente con middleware.
- **Alta de negocio + invitación real**: `ensureDemoOwnerAuthUser` de la Fase 5 es el patrón base; para producción, el super-admin crearía negocios vía Supabase Auth Admin API y enviaría la plantilla de "invitación de dueño" (pendiente de diseño).
- **Verificación de estado**: todas las validaciones de `businessId` en el `where` de operaciones state-changing (establecidas en Fase 5) previenen operaciones cross-tenant incluso si se extienden roles — patrón estable para mantener.
- En dev sin `RESEND_API_KEY`, todos los emails (incluyendo la invitación) se registran en consola — suficiente para QA.

## Minors conocidos (no bloquean; candidatos a limpieza oportunista)

### Fase 4 + anteriores
- Alternativas de hueco solo se ofrecen con `SLOT_TAKEN`; los mensajes de `EMPLOYEE_UNAVAILABLE`/`NO_EMPLOYEE_AVAILABLE` invitan a "otro horario" sin ofrecerlas (`booking-service.ts`).
- Al volver de un error en la hoja de reserva, se pierden nombre/teléfono/email tecleados (remonta `StepCustomerData`).
- El selector de día renderiza `maxBookingWindowDays` botones (30 por defecto; pesado si un negocio configura ventanas grandes).
- Pantalla neutra de "no encontrado" duplicada (candidato a extraer un `NeutralErrorScreen` compartido); descarga `.ics` vía data-URI sin verificar en iOS Safari; `img` en vez de `next/image` (sin `remotePatterns`).
- **Deuda consciente del motor (no tocar sin necesidad)**: TOCTOU en límites anti-fraude fuera de la transacción; `checkRateLimit` acoplado al flujo insertar-antes-de-contar; los tests de carrera aceptan `EMPLOYEE_UNAVAILABLE` además de `SLOT_TAKEN` (pre-check fuera de la transacción).
- El copy "es mañana" del recordatorio es impreciso en los bordes del día (la ventana ahora es `[now+23h, now+25h)`); comparación no constant-time en `cron-auth` (aceptado: el secreto es de alta entropía).

### Fase 5
- **Vista de semana simplificada**: misma columna por empleado, 7 días agregados en el mismo rango, sin agrupar por franjas horarias — funcional pero más simple que un calendario semanal clásico (iteración UI si es necesario).
- **Sin adjunto `.ics` en email de "cita aprobada"**: solo enlace a `/cita/{token}`, que ya ofrece descarga `.ics` desde Fase 3 — decisión conservadora confirmada (no extender `EmailMessage` con adjuntos).
- **Sin paginación en `/panel/clientes`**: razonable para volumen local, pero si el usuario anticipa cientos de clientes, revisar esta decisión.
- **Editores de horario y servicios sin claim atómico**: si dos pestañas del panel editan lo mismo, la última en guardar gana (mismo patrón que resto de CRUD). Riesgo bajo (dueño solo, uso secuencial).
- **Ventana de recordatorio / edge cases de `manualApproval`**: casos límite entre cambio de estado y re-click del cliente documentados pero no exhaustivamente cubiertos en tests.
- El slug `panel` está reservado de facto por la ruta del panel — el alta de negocios (Fase 6) no debe permitir ese slug.
- Una cita aprobada con menos de 23h de antelación no recibe recordatorio 24h (propiedad de diseño del cron, aceptada).
- Las ausencias (`TimeOff`) no tienen límites de fecha razonables en el formulario — sin precedente en el resto del formulario, documentado como conocido.

## Avisos del motor que siguen vigentes

- **Dedupe de huecos**: con "cualquier profesional" el motor devuelve un slot por empleado; la capa pública ya deduplica por `start` (`getDedupedAvailableSlotsForBusiness`).
- **`manualApproval`**: cambio de comportamiento real en `confirmAppointment` (no solo copy) — con `manualApproval = true`, la cita pasa a `PENDING` esperando aprobación del negocio en `/panel`, con envío de email de aprobación cuando se confirma.

## Después de la Fase 5

- **Fase 6**: super-admin + despliegue — incluye plantilla de email "invitación de dueño" (excluida de Fase 4), dominio real, certificados y Supabase en producción.

## Cómo arrancar el entorno

```powershell
pnpm exec supabase start        # Docker debe estar activo; BD dev en :54322
pnpm db:seed                    # opcional: popula demo "Salón Aura" + usuario OWNER
pnpm test                       # contra appoint_test (317/317 tests)
pnpm exec playwright test       # e2e: booking-flow + panel-approval
pnpm dev                        # Next.js en localhost:3000
```

`.env` no está en git: copiar `.env.example`. Las variables de Supabase Auth (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) y de demo owner (`DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD`) ya están configuradas por defecto. Sin `RESEND_API_KEY` real, todos los emails (incluyendo los del panel) se registran en consola (`ConsoleEmailSender`) — suficiente para dev/QA manual. Sin `CRON_SECRET`, el endpoint `/api/cron/reminders` devuelve 401 pero puedes invocar el cron directamente desde un script si necesitas probarlo.
