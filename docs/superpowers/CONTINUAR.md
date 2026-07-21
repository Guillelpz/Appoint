# Continuación del proyecto — estado y siguientes pasos

_Actualizado: 2026-07-21, A MITAD DE LA FASE 6 (panel de super-admin). Este es un punto de control intermedio, no un cierre de fase — la rama `fase-6-superadmin` sigue sin mergear y quedan tareas por ejecutar. Léelo entero antes de tocar nada._

## Cómo retomar esta sesión desde cero (LEE ESTO PRIMERO)

1. **Rama activa:** `fase-6-superadmin` (creada desde `main` en el commit `2deaa27`, cierre de la Fase 5). Verifica con `git branch --show-current` y `git log --oneline -20`.
2. **Plan en ejecución:** `docs/superpowers/plans/2026-07-21-fase-6-super-admin.md` (17 tareas, formato `superpowers:writing-plans`). Ábrelo para ver el detalle exacto de cada tarea (código completo, tests, comandos).
3. **Ledger de progreso:** `.superpowers/sdd/progress.md` (gitignorado — solo existe en el filesystem de quien ha ido ejecutando). Busca la sección `# Ledger de progreso - plan Fase 6 super-admin`. Si existe, tiene una línea por tarea completada con el veredicto de su revisión — esa es la fuente más precisa. Si no existe (máquina/sesión distinta), usa la tabla de abajo.
4. **Proceso:** `superpowers:writing-plans` → `superpowers:subagent-driven-development`. Cada tarea: implementador (subagente, modelo según la tabla) → revisor (subagente sonnet, spec + calidad) → si hay hallazgos Important/Critical, fix dispatch al mismo implementador → re-revisión → ledger. Al terminar las 17 tareas: revisión global de rama (opus) → aplicar sus fixes → re-revisión → `superpowers:finishing-a-development-branch` (merge a `main`, borrar rama, actualizar este documento de verdad — eso es la Tarea 17 del plan, que sustituirá este checkpoint intermedio por el cierre real).

### Estado de las 17 tareas (a fecha de este checkpoint)

| # | Tarea | Estado |
|---|-------|--------|
| 1 | Modelo `PlatformAdmin` + vars de entorno | ✅ hecha y revisada, sin hallazgos |
| 2 | Cliente Admin API de Supabase compartido | ✅ hecha y revisada, sin hallazgos |
| 3 | Seed idempotente del super-admin demo | ✅ hecha y revisada, sin hallazgos |
| 4 | `requireAdminSession()` | ✅ hecha y revisada, sin hallazgos |
| 5 | Cierra el bug de Fase 5 (`requirePanelSession` no comprobaba `Business.active`) | ✅ hecha y revisada, sin hallazgos |
| 6 | Middleware protege `/admin/**` | ✅ hecha y revisada, sin hallazgos |
| 7 | `/admin/login` | ✅ hecha y revisada, sin hallazgos |
| 8 | `getWeekStartLocalDateString` | ✅ hecha y revisada, sin hallazgos |
| 9 | `getPlatformMetrics` | ✅ hecha y revisada, sin hallazgos |
| 10 | Dashboard `/admin` | ✅ hecha y revisada, sin hallazgos |
| 11 | `OwnerInviter` inyectable | ✅ hecha y revisada, sin hallazgos |
| 12 | `platform-business-service.ts` (alta + rollback + activar/suspender) | ✅ hecha y revisada, sin hallazgos |
| 13 | Plantilla email "invitación de dueño" | ✅ hecha y revisada, sin hallazgos |
| 14 | `/panel/invitacion` (fijar contraseña) | ✅ hecha y revisada. Encontró y corrigió un hallazgo Important de seguridad (ver abajo, `212b957`); el efecto secundario aceptado (limitación conocida) |
| 15 | `/admin/negocios` (listado + alta + activar/suspender) | ⏳ pendiente — siguiente tarea a despachar |
| 16 | e2e Playwright del flujo completo de super-admin | ⏳ pendiente |
| 17 | Actualizar `CONTINUAR.md` (cierre real de la fase) | ⏳ pendiente — sustituirá este checkpoint |

Último commit conocido en la rama al escribir esto: `212b957` (fix de seguridad de la Tarea 14). Suite en ese punto: 351/351 Vitest + tsc + lint + build limpios + 2/2 Playwright (`booking-flow.spec.ts`, `panel-approval.spec.ts` — el nuevo e2e de admin lo añade la Tarea 16).

### Hallazgo de seguridad cerrado en la Tarea 14 (para que no se reintroduzca)

La primera versión de `/panel/invitacion` (ruta pública, el dueño invitado llega sin sesión) tenía un atajo: si `getUser()` ya encontraba una sesión activa, saltaba `verifyOtp({token_hash, type:'invite'})` y llamaba `updateUser({password})` directamente. Esto permitía que **cualquier dueño ya autenticado** cambiara su contraseña visitando esta URL con un `token_hash` arbitrario (incluso inválido), sin validar la invitación — la ruta "pública" se convertía de facto en un endpoint de cambio de contraseña sin re-autenticación. Se corrigió en `212b957` eliminando el atajo por completo: `verifyOtp` se ejecuta siempre antes de `updateUser`.

**Efecto secundario aceptado (a confirmar por la re-revisión en curso):** los tokens de invitación de Supabase son de un solo uso. Si `verifyOtp` tiene éxito pero `updateUser` falla en la MISMA petición (ej. un fallo transitorio), un reintento ya no puede aprovechar la sesión recién creada — el `token_hash` ya está consumido y el reintento fallaría con "enlace no válido o caducado", aunque la cookie de sesión siga viva. El dueño necesitaría una invitación nueva del super-admin. Es un caso muy estrecho (solo si `updateUser` falla justo después de un `verifyOtp` exitoso) y el fallo es "seguro" (bloquea, no abre una brecha) — se dejó documentado como limitación conocida en vez de añadir complejidad extra, pendiente del veredicto final de la re-revisión.

## Decisiones tomadas con el usuario para la Fase 6 (no reabrir)

1. **Alcance de esta fase: SOLO el panel de super-admin.** El despliegue real (dominio, Vercel, Supabase producción) queda explícitamente fuera — no hay ninguna tarea de despliegue en el plan. Se abordará en una fase/sesión separada cuando el usuario tenga el dominio comprado.
2. **Modelo de super-admin: tabla propia `PlatformAdmin`** (no reutiliza `MembershipRole`, que sigue siendo solo OWNER/STAFF por negocio).
3. **Alta de negocio con invitación real por email**: el super-admin crea el `Business` + invita al dueño real vía Supabase Auth Admin API (`generateLink({type:'invite'})` → `hashed_token`, NUNCA `action_link` — ver CLAUDE.md) + `Membership` OWNER, con rollback compensatorio si la invitación falla (el `Business` recién creado se borra, el `Membership` nunca llega a crearse en ese caso).
4. **Dos campos de email separados** en el alta de negocio: `businessEmail` (opcional, contacto público del negocio, va a `Business.email`) y `ownerEmail` (obligatorio, solo para la invitación/login del dueño) — decisión tomada tras detectar la ambigüedad en la primera versión del plan.
5. **Cerrado el bug real de Fase 5**: `requirePanelSession()` ahora comprueba también `Business.active` — un negocio suspendido bloquea también el acceso de su dueño a `/panel`, no solo la página pública.
6. **Activar/suspender negocio**: toggle simple de `Business.active`, mismo patrón `updateMany` que `setServiceActive`/`setEmployeeActive` de la Fase 5.
7. **Métricas simples**: negocios activos (count) + citas de la semana en curso (count, TODOS los estados, sin excluir negocios suspendidos — decisión consciente de simplicidad, ver `src/lib/admin/platform-metrics-service.ts`).

## Estado acumulado (fases ya cerradas y mergeadas a `main`)

- **Hecho y en `main`**: Fases 1-2 (fundación + motor de reservas, merge `6492edb`), Fase 3 (página pública, mergeada 2026-07-16), Fase 4 (emails y recordatorios, mergeada 2026-07-17), Fase 5 (panel del negocio, mergeada 2026-07-20, `76d0095`).
- **Fase 5 construyó**: autenticación Supabase Auth (email+contraseña) para dueños, agenda con aprobar/rechazar/completar/no-show/cancelar/alta manual, CRUD de servicios y equipo (horarios + ausencias), clientes + lista negra, ajustes con tema en vivo + QR. Rol OWNER solo; STAFF sigue sin UI/lógica de autorización.
- **Fase 4 construyó**: capa de email intercambiable (Resend/consola), plantillas de confirmación/recordatorio/cancelación, doble paso de `manualApproval`, cron de recordatorios.
- **Política de modelos** (petición del usuario, vigente en todas las fases): haiku para tareas mecánicas con código completo en el plan, sonnet para integración/implementación estándar/investigación, opus para la revisión global de rama al cerrar cada fase. El modelo principal solo orquesta.

## Avisos técnicos vigentes para cuando se retome la Fase 6

- **Contrato de `requireAdminSession()`** (`src/lib/admin/session.ts`): mismo patrón que `requirePanelSession()` pero contra `PlatformAdmin`, sin `businessId`, redirige a `/admin/login`.
- **`OwnerInviter`/`getOwnerInviter()`** (`src/lib/admin/owner-inviter.ts`): patrón inyectable igual que `EmailSender` — la implementación real llama a `generateLink`, los tests inyectan un fake, nunca la API real de Supabase.
- **`platform-business-service.ts`**: `createPlatformBusiness` valida `RESERVED_SLUGS` (`panel`, `admin`, `cita`, `confirmar`, `api`), crea `Business` → invita al dueño → solo si la invitación tiene éxito crea el `Membership` OWNER; si falla, borra el `Business` (rollback compensatorio) y devuelve `OWNER_INVITE_FAILED`. `setPlatformBusinessActive` es el toggle simple.
- **`/panel/invitacion`**: ruta pública exacta (no dinámica) en el middleware — si se cambia su forma de URL, hay que actualizar `publicPaths` en `src/middleware.ts` a la vez.
- **Tarea 15 (siguiente)** debe integrar: el formulario de alta de negocio con los dos campos de email separados, el listado con estado activo/suspendido, y los botones de activar/suspender — todo consumiendo `platform-business-service.ts` (Tarea 12), reutilizando los patrones de `/panel/servicios`/`/panel/equipo` de la Fase 5 (formularios controlados que preservan valores en error, patrón `?aviso=` para carreras perdidas).
- **Tarea 16 (e2e)**: cubrir login super-admin + alta de negocio + (si es razonable sin depender de abrir un email real) verificación de que la invitación se generó correctamente + suspensión bloqueando `/panel` para el dueño. El plan documenta el alcance exacto que decidió el redactor — revisar esa tarea antes de escribir el test.

## Minors conocidos (no bloquean; candidatos a limpieza oportunista)

### Fase 4 y anteriores
- Alternativas de hueco solo se ofrecen con `SLOT_TAKEN`; los mensajes de `EMPLOYEE_UNAVAILABLE`/`NO_EMPLOYEE_AVAILABLE` invitan a "otro horario" sin ofrecerlas (`booking-service.ts`).
- Al volver de un error en la hoja de reserva, se pierden nombre/teléfono/email tecleados (remonta `StepCustomerData`).
- El selector de día renderiza `maxBookingWindowDays` botones (30 por defecto; pesado si un negocio configura ventanas grandes).
- Pantalla neutra de "no encontrado" duplicada (candidato a extraer un `NeutralErrorScreen` compartido); descarga `.ics` vía data-URI sin verificar en iOS Safari; `img` en vez de `next/image` (sin `remotePatterns`).
- **Deuda consciente del motor (no tocar sin necesidad)**: TOCTOU en límites anti-fraude fuera de la transacción; `checkRateLimit` acoplado al flujo insertar-antes-de-contar; los tests de carrera aceptan `EMPLOYEE_UNAVAILABLE` además de `SLOT_TAKEN` (pre-check fuera de la transacción).
- El copy "es mañana" del recordatorio es impreciso en los bordes del día (la ventana ahora es `[now+23h, now+25h)`); comparación no constant-time en `cron-auth` (aceptado: el secreto es de alta entropía).

### Fase 5
- Vista de semana simplificada (columnas por empleado, sin franjas horarias).
- Sin adjunto `.ics` en email de "cita aprobada" (solo enlace a `/cita/{token}`, decisión conservadora confirmada).
- Sin paginación en `/panel/clientes` (revisar si el catálogo de clientes crece mucho).
- Editores de horario y servicios sin claim atómico entre pestañas (riesgo bajo, dueño solo).
- El slug `panel` está reservado de facto por la ruta del panel — el alta de negocios de la Fase 6 ya lo respeta vía `RESERVED_SLUGS` (junto con `admin`, `cita`, `confirmar`, `api`).
- Una cita aprobada con menos de 23h de antelación no recibe recordatorio 24h (propiedad de diseño del cron, aceptada).
- Las ausencias (`TimeOff`) no tienen límites de fecha razonables en el formulario.

### Fase 6 (en curso)
- Ver "Hallazgo de seguridad cerrado en la Tarea 14" arriba: limitación conocida de reintento tras un `updateUser` fallido justo después de un `verifyOtp` exitoso (token de un solo uso ya consumido) — aceptada como fail-closed razonable por la revisión.
- **No existe acción de "reenviar invitación"** en `/admin`: si el caso límite de arriba ocurre, el super-admin tendría que recurrir al dashboard/Admin API de Supabase directamente, no a la UI. Candidato a tarea pequeña futura (no bloqueante).
- Política de contraseña del dueño invitado: mínimo 8 caracteres (`MIN_PASSWORD_LENGTH`), sin especificación explícita en la spec — revisar si se quiere algo más estricto.
- `appointmentsThisWeekCount` cuenta todos los estados y no excluye negocios suspendidos (decisión consciente de simplicidad).

## Avisos del motor que siguen vigentes

- **Dedupe de huecos**: con "cualquier profesional" el motor devuelve un slot por empleado; la capa pública ya deduplica por `start` (`getDedupedAvailableSlotsForBusiness`).
- **`manualApproval`**: cambio de comportamiento real en `confirmAppointment` (no solo copy) — con `manualApproval = true`, la cita pasa a `PENDING` esperando aprobación del negocio en `/panel`.

## Después de la Fase 6

- **Despliegue real**: dominio, certificados, Vercel + Supabase en producción — sigue explícitamente pendiente, sin ningún plan ejecutado todavía al respecto. Cuando el usuario compre el dominio, abordarlo como su propia sesión/plan (probablemente no necesita `writing-plans`/`subagent-driven-development` completo, es más guía paso a paso que código).
- Rol `STAFF`: declarado en el enum pero sin UI ni lógica de autorización — candidato para una fase futura si se decide dar acceso de panel a empleados.

## Cómo arrancar el entorno

```powershell
pnpm exec supabase start        # Docker debe estar activo; BD dev en :54322
pnpm db:seed                    # negocio demo "Salón Aura" + dueño OWNER + super-admin demo
pnpm test                       # contra appoint_test
pnpm exec playwright test       # e2e: booking-flow + panel-approval (+ admin-flow cuando exista la Tarea 16)
pnpm dev                        # Next.js en localhost:3000
```

`.env` no está en git: copiar `.env.example`. Variables de Supabase Auth (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), demo owner (`DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD`) y demo super-admin (`DEMO_SUPERADMIN_EMAIL`, `DEMO_SUPERADMIN_PASSWORD`) ya configuradas por defecto en `.env.example`. Sin `RESEND_API_KEY` real, todos los emails (incluida la invitación de dueño) se registran en consola (`ConsoleEmailSender`).
