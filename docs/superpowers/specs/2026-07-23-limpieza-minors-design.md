# Limpieza de minors (post-Fase 6) — diseño

_Fecha: 2026-07-23_

## Contexto

Fases 1-6 completas y en `main`. El despliegue real sigue pendiente de que el usuario compre el dominio. Mientras tanto, se aborda un lote de tres "minors" ya documentados en `docs/superpowers/CONTINUAR.md` como candidatos de limpieza oportunista, no bloqueantes. No es una fase nueva de la spec principal: es mantenimiento acotado sobre funcionalidad ya existente.

Las tres piezas son independientes entre sí (tocan archivos distintos, sin dependencias de orden), así que se implementan como tareas paralelas.

## 1. Reenviar invitación de dueño

### Problema

`/admin/negocios` no tiene forma de reenviar la invitación a un dueño. Esto afecta a dos casos: el email original se pierde/expira, o el caso límite ya documentado en el que `verifyOtp` tiene éxito (crea sesión) pero el `updateUser` posterior que fija la contraseña falla — dejando al dueño invitado sin vía de recuperación salvo el dashboard de Supabase.

### Señal de "alta completada"

Los campos nativos de Supabase Auth no sirven como señal fiable: `verifyOtp` de tipo `invite` ya autentica y puede tocar `last_sign_in_at`/`confirmed_at` **antes** de que `updateUser` fije la contraseña, que es exactamente el caso límite que queremos poder recuperar. Por eso se introduce una señal propia:

- En `src/app/panel/invitacion/actions.ts`, tras `updateUser({password})` con éxito, se llama a `supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: { invitationCompletedAt: <ISO 8601> } })` usando el cliente Admin API ya existente (`src/lib/supabase/admin.ts`).
- `app_metadata` solo es escribible con la service role key (nunca desde el cliente del navegador), consistente con el resto de operaciones de Admin API del proyecto.

### Visibilidad del botón

`/admin/negocios` necesita, por cada negocio, el `userId` del dueño (vía su `Membership` OWNER) y consultar `supabaseAdmin.auth.admin.getUserById(userId)` para leer `app_metadata.invitationCompletedAt`. Si está ausente → se muestra "Reenviar invitación"; si está presente → no se muestra.

### Acción

Nueva función `resendOwnerInvitation(businessId)` en `src/lib/admin/platform-business-service.ts`:
1. Busca el `Membership` OWNER del negocio → email del dueño.
2. Si `app_metadata.invitationCompletedAt` ya existe → no-op, devuelve error (defensa en profundidad, aunque la UI ya oculte el botón).
3. Si no existe → reutiliza `getOwnerInviter().generateInviteLink(email)` (mismo mecanismo que el alta inicial, genera un `hashed_token` nuevo) + `sendOwnerInvitationEmail`.

Nueva Server Action `resendOwnerInvitationAction` en `src/app/admin/(protected)/negocios/actions.ts`, siguiendo el patrón `?aviso=` ya usado para dar feedback tras redirect.

### Testing

Tests unitarios de `resendOwnerInvitation` con los Fakes ya existentes (`FakeOwnerInviter`, `FakeEmailSender`, mismo patrón que los tests actuales de `owner-inviter`/`platform-business-service`): caso feliz (reenvía), caso "ya completado" (no-op/error), caso "sin membership OWNER" (error genérico).

## 2. Paginación en listados

### Alcance

`/panel/clientes` (`listCustomersForBusiness`, `src/lib/panel/customers-service.ts`) y `/admin/negocios` (`listPlatformBusinesses`, `src/lib/admin/platform-business-service.ts`). Ambos hacen hoy `findMany` sin `skip`/`take`.

### Diseño

- Parámetro `?page=N` en la URL (mismo patrón que `?aviso=` ya usado en ambas páginas), 1-indexado, por defecto `1`.
- Cada función de listado acepta `page: number` y devuelve `{ items, hasNextPage: boolean, hasPreviousPage: boolean }`, usando `skip: (page - 1) * 20, take: 20` junto a un `count()` de Prisma para el total. El volumen de negocios/clientes esperado no justifica optimizar esa consulta (p. ej. pedir 21 elementos en vez de `count()`).
- UI: enlaces "Anterior" / "Siguiente" (sin numeración), deshabilitados en los extremos, igual en ambas páginas para mantener consistencia visual.
- Página fuera de rango (p. ej. `?page=999`) no debe romper — devuelve lista vacía con "Anterior" habilitado y "Siguiente" deshabilitado.

### Testing

Tests unitarios de ambas funciones de listado: página 1 por defecto, segunda página con offset correcto, `hasNextPage`/`hasPreviousPage` correctos en los límites (primera página, última página, página vacía fuera de rango).

## 3. Límites de fecha en TimeOff (ausencias)

### Alcance

`createTimeOffForEmployee` en `src/lib/panel/time-off-service.ts`. Validación actual: solo fechas válidas y `start < end`.

### Reglas nuevas (cada una con su propio código de error, para mensajes distintos vía el patrón `?aviso=` ya usado en `equipo/[id]/actions.ts`)

1. **Sin fechas pasadas**: `start >= now` (comparación de instante UTC, sin relevancia de timezone ya que ambas son `Date` UTC). Código: `START_IN_PAST`.
2. **Duración máxima 90 días**: `end - start <= 90 días` en milisegundos. Código: `DURATION_TOO_LONG`.
3. **Antelación máxima 2 años**: `start <= now + 2 años calendario` (mismo día/mes, dos años después; sin necesidad de tratar años bisiestos de forma especial — usar `Date.setFullYear(getFullYear() + 2)` o equivalente). Código: `TOO_FAR_IN_FUTURE`.
4. **Sin solape con otra ausencia del mismo empleado**: consulta `prisma.timeOff.findFirst({ where: { employeeId, start: { lt: newEnd }, end: { gt: newStart } } })`; si existe, error. Código: `OVERLAPPING`.

Las reglas se comprueban en este orden y se corta en la primera que falle (igual que la validación actual de fechas inválidas).

### Testing

TDD: un test por regla nueva (falla cuando se viola, pasa en el límite exacto permitido) + el test de caso feliz existente se mantiene. Se añade un test de solape exacto en el borde (ausencias que se tocan pero no se solapan, p. ej. una termina cuando la otra empieza, no debe fallar).

## Fuera de alcance

- No se toca ningún otro minor de la lista de `CONTINUAR.md` (nombre fijo en `admin-flow.spec.ts`, vista de semana simplificada, etc.) — quedan donde están, documentados.
- No se añade paginación a ningún otro listado del proyecto.
- No se cambia la política de contraseña mínima ni otros minors de Fase 6 no seleccionados.
