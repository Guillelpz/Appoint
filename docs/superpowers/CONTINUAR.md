# Continuación del proyecto — estado y siguientes pasos

_Actualizado: 2026-07-27 tras cerrar la **limpieza de minors post-Fase 6** (ver su sección más abajo). Antes de eso: Fase 6 (panel de super-admin) mergeada a `main` (`7ae1ffd`) el 2026-07-21 y pusheada a origin. El despliegue real (dominio, Vercel, Supabase producción) sigue sin empezar y es el siguiente hito elegido por el usuario, ver "Después de la Fase 6" más abajo._

## Estado actual

- **Hecho y en `main`**: Fases 1-2 (fundación + motor de reservas, merge `6492edb`), Fase 3 (página pública, mergeada 2026-07-16), Fase 4 (emails y recordatorios, mergeada 2026-07-17), Fase 5 (panel del negocio, mergeada 2026-07-20, `76d0095`) **Fase 6 (panel de super-admin, mergeada 2026-07-21, `7ae1ffd`)** y la **limpieza de minors post-Fase 6 (mergeada 2026-07-27)**.
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
- **Hallazgo de seguridad encontrado y corregido durante la propia revisión de tarea de esta fase (Tarea 14)**: la primera versión de `/panel/invitacion` tenía un atajo que permitía a cualquiera con una sesión de `/panel` ya activa saltarse `verifyOtp` por completo y cambiar su contraseña con un `token_hash` arbitrario o inválido. Se corrigió eliminando el atajo (`212b957`): `verifyOtp` se ejecuta siempre antes de `updateUser`. Efecto secundario aceptado: los tokens de invitación son de un solo uso, así que si `updateUser` falla justo después de un `verifyOtp` con éxito en la misma petición, un reintento ya falla (token ya consumido) en vez de aprovechar la sesión recién creada por el atajo inseguro anterior — es un bloqueo estrecho y "seguro" (fail-closed), no una brecha. **Este caso ya tiene salida por UI desde la limpieza post-Fase 6**: el super-admin puede reenviar la invitación desde `/admin/negocios` (ver su sección más abajo).
- **Verificación**: `pnpm test` (Vitest contra Postgres real) + `pnpm lint` + `pnpm exec tsc --noEmit` + `pnpm build` + `pnpm exec playwright test` — 352/352 Vitest, todo lo demás limpio, y 3/3 specs Playwright (`booking-flow.spec.ts`, `panel-approval.spec.ts`, `admin-flow.spec.ts`), verificado tanto ejecutando la suite completa junta como cada spec por separado en aislamiento (ver nota sobre el flake de `panel-approval.spec.ts` más abajo); re-verificado sobre `main` tras el merge.
- **Revisión global (opus)**: veredicto _Ready to merge_. El único hallazgo Important — suspender un negocio desde `/admin` no detenía sus recordatorios de cita de 24h (análogo al bug de "empleado desactivado" de la Fase 5) — se consultó con el usuario (confirmó: sí, detenerlos) y se corrigió en `e350cf2` (`sendDueReminders` filtra `business: { active: true }` en la selección, preservando el claim atómico de la Fase 4 contra carreras de cron concurrentes). Este hallazgo solo era visible con perspectiva de rama completa, no por tarea.
- **Disciplina multi-tenancy**: las funciones de `/admin` operan SIN `businessId` de sesión (alcance de plataforma, agregan sobre todos los negocios a propósito) y llevan el prefijo `Platform`/`Admin` en su nombre (`platform-business-service.ts`, `platform-metrics-service.ts`, `requireAdminSession`, `isPlatformAdmin`) para no confundirse con los servicios tenant-scoped de `src/lib/panel/*`.
- **Proceso usado**: superpowers — writing-plans → subagent-driven-development. Plan en `docs/superpowers/plans/2026-07-21-fase-6-super-admin.md` (17 tareas). Cada tarea: implementador → revisor por subagente → fix dispatch si había hallazgos Important/Critical → re-revisión → ledger.
- **Política de modelos** (petición del usuario, vigente en todas las fases): haiku para tareas mecánicas con código completo en el plan, sonnet para integración/implementación estándar/investigación, opus para la revisión global de rama al cerrar cada fase. El modelo principal solo orquesta.

## Limpieza de minors post-Fase 6 (rama `chore/limpieza-minors-post-fase6`)

Plan: `docs/superpowers/plans/2026-07-23-limpieza-minors.md` (5 tareas). Cierra tres minors elegidos por el usuario, más los hallazgos que destapó la revisión global de la rama:

- **Límites de fecha en ausencias (`TimeOff`)**: no puede empezar antes de hoy, máximo 90 días de duración, máximo 2 años vista, y sin solaparse con otra ausencia del mismo empleado. `now` es inyectable para poder testear sin depender del reloj real.
  - El límite de "pasado" es **el comienzo del día local en Europe/Madrid**, no el instante `now` (decisión del usuario): permite registrar una baja del mismo día ("se fue enferma hoy a las 09:00", tecleado a las 11:00) y elimina una carrera de minutos. Helper nuevo `getStartOfLocalDayUtc` en `src/lib/booking/timezone.ts`, construido sobre `getLocalDateString` + `localMinutesToUtc`.
  - **Correcto por construcción en los días de cambio de hora** (verificado a mano en la revisión ejecutando `date-fns-tz` real): España mueve el reloj a las 02:00-03:00 local, así que la medianoche local nunca cae en la hora inexistente de marzo ni en la repetida de octubre. No re-investigar.
- **Paginación de 20 en 20** en `/panel/clientes` y `/admin/negocios`, con helper compartido `src/lib/pagination.ts` (`PAGE_SIZE`, `PaginatedResult<T>`, `paginationMeta`, `parsePageParam`).
  - Orden con desempate por `id` en ambos listados: con `OFFSET`/`LIMIT`, Postgres no garantiza orden estable entre filas empatadas, y dos clientes homónimos podían salir en dos páginas o en ninguna.
  - `parsePageParam` acota `page` por arriba (`MAX_PAGE`). `Number.isFinite` NO bastaba: un `?page=1e19` es finito y llegaba a Prisma como un `skip` que desborda el entero de 64 bits de Postgres, con excepción no capturada (no hay `error.tsx` en las zonas protegidas). Una página fuera de rango sigue devolviendo lista vacía, que es el comportamiento aceptado.
- **Reenviar invitación de dueño** desde `/admin/negocios`, solo para dueños que no completaron el alta.
  - La señal "invitación completada" vive en **nuestra BD** (`Membership.invitationCompletedAt`, nullable), no en `app_metadata` de Supabase Auth. Se escribe desde el Server Action de `/panel/invitacion` tras `updateUser`. La migración incluye un **backfill** (`UPDATE ... WHERE role = 'OWNER'`) que marca como completados a los dueños que ya existían: sin él, todos ellos —incluido el dueño demo del seed— mostrarían el botón "Reenviar invitación" para siempre.
  - `OwnerInviter` conserva **una sola** llamada al Admin API (`getOwnerEmail`), usada solo en el reenvío, porque el email del dueño únicamente vive en Supabase Auth. El render de la lista ya no hace llamadas de red: antes hacía hasta 20 `getUserById` por carga, acoplando la página de gestión (incluida la capacidad de suspender un negocio) a la disponibilidad de Supabase Auth.
  - **No se reenvía a negocios suspendidos** (decisión del usuario, coherente con la de la Fase 6 sobre los recordatorios): motivo `BUSINESS_INACTIVE`, comprobado en el servidor antes de cualquier llamada de red, y botón oculto en la UI.
  - Cada motivo de fallo tiene su propio aviso: antes `OWNER_INVITE_FAILED` se mostraba como "el negocio cambió mientras tanto", un mensaje falso justo en el escenario que esta funcionalidad existe para resolver.

**Verificación de la rama**: 394/394 Vitest (51 archivos) + `pnpm lint` + `pnpm exec tsc --noEmit` + `pnpm build` + 3/3 Playwright, corridos en solitario (ver el flake de BD compartida en los minors). Revisión global por opus con veredicto "con fixes": los cuatro hallazgos Important se cerraron antes del merge, y cada lote de fixes pasó además su propia revisión por subagente.

El fix de seguridad de la Fase 6 en `/panel/invitacion` sigue intacto y fue re-verificado en la revisión: `verifyOtp` se ejecuta SIEMPRE antes de `updateUser`, el `userId` que se marca viene de `verifyData.user.id` (derivado del servidor, nunca del input), y el `try/catch` best-effort del marcado no envuelve al `redirect()` (si lo hiciera, se tragaría el `NEXT_REDIRECT` de Next.js y rompería el flujo en silencio).

## Siguiente paso inmediato

Las Fases 1-6 completan el alcance funcional planificado del producto, y la limpieza de minors está cerrada. Lo único explícitamente pendiente es el **despliegue real** (ver "Después de la Fase 6"), que es lo que el usuario ha elegido como siguiente hito.

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
- **Editores de horario y servicios sin claim atómico**: si dos pestañas del panel editan lo mismo, la última en guardar gana (mismo patrón que resto de CRUD). Riesgo bajo (dueño solo, uso secuencial).
- Una cita aprobada con menos de 23h de antelación no recibe recordatorio 24h (propiedad de diseño del cron, aceptada).

### Fase 6
- **`appointmentsThisWeekCount` cuenta todos los estados** (incluidas `CANCELLED`/`NO_SHOW`) y no excluye negocios suspendidos — decisión consciente de simplicidad (la spec solo pide "citas de la semana", sin más matices); revisar si en el futuro se quiere un contador "solo activas".
- **Política de contraseña del dueño invitado**: mínimo 8 caracteres (`MIN_PASSWORD_LENGTH` en `src/app/panel/invitacion/actions.ts`), elegido en ausencia de una política explícita en la spec (Supabase Auth exige por defecto un mínimo de 6). Revisar si el usuario quiere una política más estricta.
- ~~Sin paginación en `/admin/negocios`~~ y ~~no existe acción de "reenviar invitación"~~ — ambos **cerrados** en la limpieza post-Fase 6 (ver su sección arriba).
- **`e2e/admin-flow.spec.ts` usa un nombre de negocio fijo** (`'Negocio E2E'`; solo el slug/email llevan timestamp) — frágil solo si una ejecución se mata a la fuerza antes de que corra su `afterAll` de limpieza (los fallos normales de test sí ejecutan `afterAll`). No corregido en esta fase; candidato a limpieza oportunista.
- Flake conocido de `panel-approval.spec.ts` en aislamiento (no introducido por esta fase) — ver "Avisos técnicos para después de la Fase 6" arriba.

### Limpieza post-Fase 6

- **Una ausencia que solapa citas ya `CONFIRMED` no avisa ni cancela nada**: la cita queda "dentro" de la ausencia y el motor de huecos ni la ve ni la toca. Es **preexistente** (la limpieza no lo empeoró: antes tampoco se comprobaba), pero es el mismo patrón que el bug de "empleado desactivado con citas huérfanas" que cazó la revisión global de la Fase 5. Candidato real a arreglar, no una nota al pie: ahora que las ausencias sí validan fechas, es la incoherencia más visible que queda en ese formulario.
- **El marcado de invitación completada filtra por `userId` + `role: 'OWNER'`, sin `businessId`** (`src/app/panel/invitacion/actions.ts`). Si un mismo usuario llegara a ser OWNER de varios negocios, completar una invitación marcaría todas sus memberships. No es una brecha (mismo usuario autenticado, no cruza tenants ajenos) y hoy es inalcanzable porque `createPlatformBusiness` crea un usuario de Auth nuevo por invitación. Acotar por `businessId` si algún día un dueño puede tener varios negocios.
- **`src/lib/supabase/admin.ts` sigue sin `import 'server-only'`**: era el minor de defensa en profundidad anotado en la Fase 6, y no se aplicó porque `server-only` **no es dependencia del proyecto** y `CLAUDE.md` prohíbe añadir dependencias sin decisión explícita del usuario. Queda pendiente de esa decisión (`pnpm add server-only`). Mitigación actual: la única ruta pública que llegaba a ese módulo (`/panel/invitacion`) ya no lo importa.
- **Sin techo a la última página real**: `?page=999` en un listado pequeño devuelve lista vacía con "Anterior" activo, en vez de llevar a la última página con contenido. Es UX menor y está testeado así a propósito; se descartó cambiarlo por no ampliar el alcance de una rama de limpieza. (Lo que sí se cerró es que un `?page` absurdo reventara con un 500.)
- **El email de reenvío es idéntico al del alta inicial** ("Te han dado de alta como dueño de X en Appoint"), lo que puede confundir a quien lo recibe por segunda vez. Cosmético; un flag `isResend` en el contexto de la plantilla lo resolvería.
- **Flake de infraestructura observado durante esta limpieza**: `src/lib/panel/active-appointments.test.ts` falló una vez con un error de clave foránea `Employee_businessId_fkey` y pasó al repetir la suite. Aparece cuando dos procesos de Vitest corren a la vez contra la BD compartida `appoint_test` (p. ej. dos agentes en paralelo). No es una regresión: `fileParallelism` está desactivado a propósito dentro de una misma ejecución, pero nada impide dos ejecuciones simultáneas. Correr los gates en solitario.

## Avisos del motor que siguen vigentes

- **Dedupe de huecos**: con "cualquier profesional" el motor devuelve un slot por empleado; la capa pública ya deduplica por `start` (`getDedupedAvailableSlotsForBusiness`).
- **`manualApproval`**: cambio de comportamiento real en `confirmAppointment` (no solo copy) — con `manualApproval = true`, la cita pasa a `PENDING` esperando aprobación del negocio en `/panel`, con envío de email de aprobación cuando se confirma.

## Después de la Fase 6

- **Despliegue real**: dominio, certificados, Vercel + Supabase en producción — sigue explícitamente pendiente, no cubierto por ningún plan ejecutado hasta ahora. **Es el siguiente hito elegido por el usuario** (2026-07-27), a abordar tras comprar el dominio. Al hacerlo, recordar: replicar las variables de `.env.example` en producción (dando de alta un super-admin real en vez de depender de `DEMO_SUPERADMIN_*`), y que la migración `add_membership_invitation_completed_at` lleva un backfill que marca como completados a los dueños ya existentes — correcto en producción, pero conviene comprobarlo tras aplicarla.
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
