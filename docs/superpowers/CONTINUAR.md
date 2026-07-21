# Continuación del proyecto — estado y siguientes pasos

_Actualizado: 2026-07-21 tras completar las 17 tareas de la Fase 6 (panel de super-admin): 351/351 Vitest + lint + tsc + build + 3/3 Playwright en verde (verificado en conjunto y con cada spec e2e en aislamiento). Pendiente la revisión global de rama (opus) y el merge a `main` — la rama `fase-6-superadmin` sigue sin mergear. El despliegue real (dominio, Vercel, Supabase producción) sigue sin empezar, ver "Después de la Fase 6" más abajo._

## Estado actual

- **Hecho**: Fases 1-2 (fundación + motor de reservas, merge `6492edb`), Fase 3 (página pública, mergeada 2026-07-16), Fase 4 (emails y recordatorios, mergeada 2026-07-17), Fase 5 (panel del negocio, mergeada 2026-07-20, `76d0095`) y **Fase 6 — panel de super-admin**: 17/17 tareas implementadas y revisadas (limpio o corregido), pendiente solo de la revisión global de rama y el merge.
- **Fase 6 construido** (todo en `src/lib/admin/`, `src/app/admin/`, más algunos toques en `src/lib/panel/` y `src/lib/booking/`):
  - Modelo `PlatformAdmin` en tabla propia, independiente de `Membership`/`MembershipRole`.
  - `requireAdminSession()` / `isPlatformAdmin` (`src/lib/admin/session.ts`), mismo patrón que `requirePanelSession()` pero sin `businessId`, redirige a `/admin/login`.
  - Cliente Admin API de Supabase compartido (`src/lib/supabase/admin.ts`, extraído del seed de dueño demo de la Fase 5).
  - Seed idempotente del super-admin demo (`src/lib/seed/demo-superadmin.ts`), conectado a `prisma/seed.ts` y a `e2e/global-setup.ts`.
  - Middleware (`src/middleware.ts`) extendido para proteger `/admin/**` junto a `/panel/**` con un único refresco de cookie compartido.
  - `/admin/login`.
  - `getWeekStartLocalDateString` (`src/lib/booking/timezone.ts`) + `getPlatformMetrics` (`src/lib/admin/platform-metrics-service.ts`): negocios activos (count) y citas de la semana en curso (count, todos los estados), límites de semana en Europe/Madrid.
  - Dashboard `/admin` con esas dos métricas.
  - `OwnerInviter` / `getOwnerInviter()` (`src/lib/admin/owner-inviter.ts`): invitación real de dueños vía Supabase Auth Admin API usando `hashed_token`, **nunca** `action_link` (ver mecánica investigada más abajo).
  - `platform-business-service.ts`: `createPlatformBusiness` (valida `RESERVED_SLUGS`, crea `Business` → invita al dueño → solo si la invitación tiene éxito crea el `Membership` OWNER; si falla, rollback compensatorio que borra el `Business` recién creado) y `setPlatformBusinessActive` (toggle simple).
  - Plantilla de email "invitación de dueño" (`sendOwnerInvitationEmail`) — la plantilla que la Fase 4 excluyó explícitamente de su alcance.
  - `/panel/invitacion`: ruta pública donde el dueño invitado fija su contraseña, `verifyOtp` + `updateUser` en un único Server Action (nunca en un Server Component).
  - `/admin/negocios`: listado + formulario de alta con **dos campos de email separados** (`businessEmail` opcional/público, `ownerEmail` obligatorio/login) + activar/suspender.
  - e2e completo del flujo real de super-admin a través de la UI (`e2e/admin-flow.spec.ts`).
- **Bug real de Fase 5 cerrado en esta fase**: `requirePanelSession()` (`src/lib/panel/session.ts`) ahora también comprueba `Business.active` — un negocio suspendido bloquea también el acceso de su dueño a `/panel`, no solo la página pública de reservas.
- **Hallazgo de seguridad encontrado y corregido durante la propia revisión de tarea de esta fase (Tarea 14)**: la primera versión de `/panel/invitacion` tenía un atajo que permitía a cualquiera con una sesión de `/panel` ya activa saltarse `verifyOtp` por completo y cambiar su contraseña con un `token_hash` arbitrario o inválido. Se corrigió eliminando el atajo (`212b957`): `verifyOtp` se ejecuta siempre antes de `updateUser`. Efecto secundario aceptado: los tokens de invitación son de un solo uso, así que si `updateUser` falla justo después de un `verifyOtp` con éxito en la misma petición, un reintento ya falla (token ya consumido) en vez de aprovechar la sesión recién creada por el atajo inseguro anterior — es un bloqueo estrecho y "seguro" (fail-closed), no una brecha, y no hay hoy una acción de "reenviar invitación" en `/admin` para ese caso raro (ver minors de Fase 6).
- **Verificación**: `pnpm test` (Vitest contra Postgres real) + `pnpm lint` + `pnpm exec tsc --noEmit` + `pnpm build` + `pnpm exec playwright test` — 351/351 Vitest, todo lo demás limpio, y 3/3 specs Playwright (`booking-flow.spec.ts`, `panel-approval.spec.ts`, `admin-flow.spec.ts`), verificado tanto ejecutando la suite completa junta como cada spec por separado en aislamiento (ver nota sobre el flake de `panel-approval.spec.ts` más abajo).
- **Disciplina multi-tenancy**: las funciones de `/admin` operan SIN `businessId` de sesión (alcance de plataforma, agregan sobre todos los negocios a propósito) y llevan el prefijo `Platform`/`Admin` en su nombre (`platform-business-service.ts`, `platform-metrics-service.ts`, `requireAdminSession`, `isPlatformAdmin`) para no confundirse con los servicios tenant-scoped de `src/lib/panel/*`.
- **Proceso usado**: superpowers — writing-plans → subagent-driven-development. Plan en `docs/superpowers/plans/2026-07-21-fase-6-super-admin.md` (17 tareas). Cada tarea: implementador → revisor por subagente → fix dispatch si había hallazgos Important/Critical → re-revisión → ledger.
- **Política de modelos** (petición del usuario, vigente en todas las fases): haiku para tareas mecánicas con código completo en el plan, sonnet para integración/implementación estándar/investigación, opus para la revisión global de rama al cerrar cada fase. El modelo principal solo orquesta.

## Siguiente paso inmediato

1. **Revisión global de la rama `fase-6-superadmin` (opus)** — no hecha todavía. Aplicar sus fixes si los hay, re-verificar, y solo entonces `superpowers:finishing-a-development-branch` (merge a `main`, borrar rama, actualizar este documento con el commit de merge real — igual que se hizo para las Fases 3-5).
2. Después de mergear: la Fase 6 completa el alcance funcional planificado del producto. Lo único explícitamente pendiente es el **despliegue real** (ver "Después de la Fase 6").

## Mecánica investigada de la invitación de dueños (relevante para tocar este flujo en el futuro)

`supabase.auth.admin.generateLink({ type: 'invite', email })` crea el usuario y devuelve `properties.hashed_token` + `properties.action_link`. Este proyecto usa `hashed_token` directamente (`/panel/invitacion?token_hash=...` + `supabase.auth.verifyOtp({token_hash, type:'invite'})`) y **nunca** `action_link`: el cliente de navegador (`createBrowserClient` de `@supabase/ssr`) fija `flowType: 'pkce'` de forma fija, y el `action_link` nativo de Supabase produce un callback de grant IMPLÍCITO (fragmento `#access_token=...`) que `@supabase/auth-js` rechaza con `AuthPKCEGrantCodeExchangeError` cuando el cliente está en modo PKCE. Ver el comentario completo en `src/lib/admin/owner-inviter.ts`.

## Avisos técnicos para después de la Fase 6

- **Despliegue real**: dominio propio, Vercel (build + Cron) y proyecto Supabase de producción siguen SIN EMPEZAR. Cuando se aborde: replicar en producción las variables de `.env.example` (incluidas las nuevas `DEMO_SUPERADMIN_EMAIL`/`DEMO_SUPERADMIN_PASSWORD` — o mejor, dar de alta ahí un super-admin real y no depender de esas credenciales demo en producción), y revisar `supabase/config.toml` (`site_url`/`additional_redirect_urls`) si en el futuro se decide usar el `action_link` nativo de Supabase para algún flujo (hoy no se usa, ver arriba). El usuario aún tiene que comprar el dominio; cuando lo haga, esto se aborda como una sesión guiada paso a paso, probablemente sin necesitar el ciclo completo `writing-plans`/`subagent-driven-development`.
- **Patrón `OwnerInviter` inyectable** (`src/lib/admin/owner-inviter.ts`): mismo patrón que `EmailSender` — cualquier lógica nueva que dependa de la Admin API de Supabase Auth debería inyectarse igual, para poder testear con un Fake sin golpear el servicio real desde Vitest.
- **Rol `STAFF`** sigue declarado en `MembershipRole` pero sin UI ni lógica de autorización — candidato para una fase futura si se decide dar acceso de panel a empleados, no solo a dueños.
- El seed de super-admin (`src/lib/seed/demo-superadmin.ts`) es idempotente de principio a fin (aprendizaje de un bug real corregido a posteriori en el seed de negocio demo de Fase 5 — no repetido aquí).
- **Flake conocido de infraestructura de test, NO introducido por esta fase** (diagnosticado durante la revisión de la Tarea 16): `e2e/panel-approval.spec.ts` puede fallar por timeout de compilación en frío si se ejecuta SOLO como el primer test de Playwright contra un `pnpm dev` recién arrancado (reproducido con `git stash` sin los cambios de esta fase, para confirmar que no es nuevo). Es estable cuando corren las 3 specs juntas (la forma normal de invocar `pnpm exec playwright test`), porque `admin-flow.spec.ts` (primero en orden alfabético) ya calienta las mismas rutas. Documentado para que nadie lo re-investigue desde cero ni intente "arreglarlo" reintroduciendo acoplamiento de fixtures compartidos entre specs.

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
- Una cita aprobada con menos de 23h de antelación no recibe recordatorio 24h (propiedad de diseño del cron, aceptada).
- Las ausencias (`TimeOff`) no tienen límites de fecha razonables en el formulario — sin precedente en el resto del formulario, documentado como conocido.

### Fase 6
- **`appointmentsThisWeekCount` cuenta todos los estados** (incluidas `CANCELLED`/`NO_SHOW`) y no excluye negocios suspendidos — decisión consciente de simplicidad (la spec solo pide "citas de la semana", sin más matices); revisar si en el futuro se quiere un contador "solo activas".
- **Política de contraseña del dueño invitado**: mínimo 8 caracteres (`MIN_PASSWORD_LENGTH` en `src/app/panel/invitacion/actions.ts`), elegido en ausencia de una política explícita en la spec (Supabase Auth exige por defecto un mínimo de 6). Revisar si el usuario quiere una política más estricta.
- **Sin paginación en `/admin/negocios`**: razonable mientras el número de negocios sea bajo; revisar si el catálogo crece mucho.
- **No existe acción de "reenviar invitación"** en `/admin`: si el caso límite documentado arriba ocurre (`updateUser` falla justo tras un `verifyOtp` con éxito), el super-admin tendría que recurrir al dashboard/Admin API de Supabase directamente, no a la UI. Candidato a tarea pequeña futura, no bloqueante.
- **`e2e/admin-flow.spec.ts` usa un nombre de negocio fijo** (`'Negocio E2E'`; solo el slug/email llevan timestamp) — frágil solo si una ejecución se mata a la fuerza antes de que corra su `afterAll` de limpieza (los fallos normales de test sí ejecutan `afterAll`). No corregido en esta fase; candidato a limpieza oportunista.
- Flake conocido de `panel-approval.spec.ts` en aislamiento (no introducido por esta fase) — ver "Avisos técnicos para después de la Fase 6" arriba.

## Avisos del motor que siguen vigentes

- **Dedupe de huecos**: con "cualquier profesional" el motor devuelve un slot por empleado; la capa pública ya deduplica por `start` (`getDedupedAvailableSlotsForBusiness`).
- **`manualApproval`**: cambio de comportamiento real en `confirmAppointment` (no solo copy) — con `manualApproval = true`, la cita pasa a `PENDING` esperando aprobación del negocio en `/panel`, con envío de email de aprobación cuando se confirma.

## Después de la Fase 6

- **Revisión global de rama + merge a `main`**: siguiente paso inmediato, no hecho todavía (ver "Siguiente paso inmediato" arriba).
- **Despliegue real**: dominio, certificados, Vercel + Supabase en producción — sigue explícitamente pendiente, no cubierto por ningún plan ejecutado hasta ahora. Es el siguiente paso real del usuario tras comprar el dominio.
- **Rol `STAFF`**: declarado en el enum pero sin UI ni lógica de autorización — candidato para una fase futura si se decide dar acceso de panel a empleados.

## Cómo arrancar el entorno

```powershell
pnpm exec supabase start        # Docker debe estar activo; BD dev en :54322
pnpm db:seed                    # opcional: popula demo "Salón Aura" + dueño OWNER + super-admin
pnpm test                       # contra appoint_test
pnpm exec playwright test       # e2e: booking-flow + panel-approval + admin-flow
pnpm dev                        # Next.js en localhost:3000
```

`.env` no está en git: copiar `.env.example`. Las variables de Supabase Auth (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), de demo owner (`DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD`) y de demo super-admin (`DEMO_SUPERADMIN_EMAIL`, `DEMO_SUPERADMIN_PASSWORD`) ya están configuradas por defecto. Sin `RESEND_API_KEY` real, todos los emails (incluidos la invitación de dueño y los del panel) se registran en consola (`ConsoleEmailSender`) — suficiente para dev/QA manual. Sin `CRON_SECRET`, el endpoint `/api/cron/reminders` devuelve 401 pero puedes invocar el cron directamente desde un script si necesitas probarlo.
