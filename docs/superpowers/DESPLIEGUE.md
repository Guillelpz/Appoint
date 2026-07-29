# Despliegue a producción

Guía paso a paso para desplegar Appoint por primera vez. Pensada para seguirse
literalmente (marca los checkboxes conforme avances) y para que una sesión
futura de Claude Code sepa en qué punto se quedó sin tener que releer el
código.

## 1. Estado del despliegue

**No se ha empezado.** El proyecto nunca se ha desplegado: todo el
desarrollo hasta ahora ha sido contra Supabase local en Docker
(`pnpm exec supabase start`). No existe proyecto de Supabase en la nube ni de
Vercel.

El plan es en dos fases (decisión del usuario, no lo replantees):

- **Fase A** (esta guía cubre esto primero): despliegue con la URL
  `.vercel.app` por defecto, sin dominio propio. Objetivo: verificación
  técnica de que todo funciona en producción, sin clientes reales. Se acepta
  la limitación de Resend sin dominio verificado (solo envía desde
  `onboarding@resend.dev` y solo a la dirección de la cuenta de Resend).
- **Fase B**: cuando el usuario compre el dominio propio. Ver sección 6.

Actualiza esta sección conforme se avance, por ejemplo:
`Fase A paso 3 hecho (proyecto Supabase creado), pendiente paso 4`.

## 2. Variables de entorno de producción

Nombres verificados contra `.env.example` y los `process.env.*` reales en
`src/` (no hay ninguna variable usada en el código que falte aquí ni al
revés).

| Variable | Para qué sirve | Secreta / pública | Obligatoria | De dónde se saca |
|---|---|---|---|---|
| `DATABASE_URL` | Cadena de conexión que usa Prisma Client en runtime (`prisma/schema.prisma:7`, `src/lib/db.ts`). | Secreta | Sí | Proyecto Supabase → conexión **pooler** (puerto **6543**). Ver aviso abajo. |
| `DIRECT_URL` | Cadena de conexión directa que usa Prisma **solo para migraciones** (`prisma/schema.prisma:8`). | Secreta | Sí | Proyecto Supabase → conexión **directa** (puerto **5432**). Ver aviso abajo. |
| `TEST_DATABASE_URL` | Solo para `pnpm test` contra `appoint_test`. | Secreta | **No** (no se usa en runtime, no hace falta en Vercel) | — |
| `RESEND_API_KEY` | Clave de la API de Resend. Sin ella, `getEmailSender()` (`src/lib/email/get-email-sender.ts:6-11`) cae en `ConsoleEmailSender` y ningún email sale de verdad, solo se registra en los logs. | Secreta | Sí (para que los emails salgan de verdad en Fase A) | Dashboard de Resend → API Keys. |
| `EMAIL_FROM` | Remitente de los emails. | Pública (aparece en el email) | Sí | En Fase A, déjalo en `onboarding@resend.dev` (único remitente permitido sin dominio verificado). En Fase B, cambia a un email del dominio propio. |
| **`APP_BASE_URL`** | Base para construir **todas** las URLs absolutas de los emails (confirmar/cancelar cita, invitación de dueño) y del QR de la página pública (`src/lib/email/urls.ts`). | Pública | Sí | La URL de producción de Vercel (`https://<proyecto>.vercel.app` en Fase A). |
| `CRON_SECRET` | Vercel Cron añade automáticamente `Authorization: Bearer ${CRON_SECRET}` en cada invocación de `/api/cron/reminders` cuando esta variable está configurada en el proyecto de Vercel (`src/app/api/cron/reminders/route.ts:7`). | Secreta | Sí | Genera una cadena aleatoria larga (p. ej. `openssl rand -hex 32`) y pégala igual en Vercel; Vercel Cron la usa sola. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase, usada por el cliente de navegador, el middleware y el cliente admin (`src/lib/supabase/browser.ts`, `src/middleware.ts`, `src/lib/supabase/admin.ts`). | Pública (el prefijo `NEXT_PUBLIC_` la expone al navegador) | Sí | Dashboard de Supabase → Project Settings → API. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase Auth. | Pública | Sí | Dashboard de Supabase → Project Settings → API. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de service role, usada por `getSupabaseAdminAuthClient()` (`src/lib/supabase/admin.ts`) para invitar dueños y para el alta de super-admin. Nunca se expone al cliente. | Secreta (privilegios totales, no versionar) | Sí | Dashboard de Supabase → Project Settings → API. |
| `DEMO_OWNER_EMAIL` / `DEMO_OWNER_PASSWORD` | Credenciales del dueño demo del seed (`src/lib/seed/demo-owner.ts`). | — | **NO definir en producción** | La BD de producción arranca vacía; no hay negocio demo. |
| `DEMO_SUPERADMIN_EMAIL` / `DEMO_SUPERADMIN_PASSWORD` | Credenciales del super-admin demo del seed (`src/lib/seed/demo-superadmin.ts`). | — | **NO definir en producción** | El primer super-admin se da de alta a mano (sección 4), no por seed. |

### ⚠️ Aviso: `APP_BASE_URL` es el fallo más silencioso de todo el despliegue

Si olvidas configurar `APP_BASE_URL` en Vercel, `getAppBaseUrl()`
(`src/lib/email/urls.ts:1-3`) cae a `http://localhost:3000` **sin lanzar
ningún error y sin romper el build**. La app funciona en apariencia: el
problema es que todos los emails que salgan (confirmar cita, cancelar cita,
invitación de dueño) y el QR de cada negocio apuntarán a `localhost`. No se
detecta probando la propia web — solo se detecta abriendo un email ya
enviado y viendo que el enlace no funciona, momento en el que ya se ha
mandado con la URL rota. **Configúrala antes del primer deploy, no
después.**

## 3. Pasos de la Fase A

Cada paso indica quién lo ejecuta: `[Guille, navegador]`, `[Guille,
terminal]` o `[Claude/repo]`.

### 3.1. Proyecto Supabase

- [ ] `[Guille, navegador]` Crea un proyecto nuevo en
      [supabase.com](https://supabase.com/dashboard) con **región UE**
      (Frankfurt o similar — latencia y RGPD, son negocios españoles con
      datos de clientes). Anota la contraseña de la BD que te pida generar.
- [ ] `[Guille, navegador]` En Project Settings → API, copia `Project URL`
      (→ `NEXT_PUBLIC_SUPABASE_URL`), `anon public key` (→
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`) y `service_role key` (→
      `SUPABASE_SERVICE_ROLE_KEY`).
- [ ] `[Guille, navegador]` En Project Settings → Database, copia las dos
      cadenas de conexión:
      - La de **Connection pooling** (Transaction/Session pooler, puerto
        **6543**) → `DATABASE_URL`.
      - La **directa** (puerto **5432**) → `DIRECT_URL`.

      **Por qué dos**: en runtime (cada función serverless de Vercel abre su
      propia conexión) hace falta el pooler para no agotar las conexiones
      del Postgres; `prisma migrate deploy`, en cambio, necesita ejecutar
      DDL y mantener un `advisory lock` de sesión mientras aplica las
      migraciones, algo que no es compatible con un pooler en modo
      transacción — de ahí que `prisma/schema.prisma:8` declare `directUrl`
      aparte. Los nombres de host/puerto exactos que verás dependen de lo
      que muestre el dashboard de Supabase en el momento en que lo abras
      (la interfaz cambia con el tiempo); el criterio que no cambia es
      "pooler para `DATABASE_URL`, directa para `DIRECT_URL`".

### 3.2. Resend

- [ ] `[Guille, navegador]` Crea cuenta en [resend.com](https://resend.com)
      y genera una API key → `RESEND_API_KEY`.
- [ ] Deja `EMAIL_FROM=onboarding@resend.dev` (Fase A: sin dominio
      verificado, es el único remitente permitido, y solo llegan emails a
      la dirección de tu propia cuenta de Resend — suficiente para verificar
      los flujos).

### 3.3. Conectar el repo a Vercel

- [ ] `[Guille, navegador]` En [vercel.com](https://vercel.com), importa el
      repo de Appoint. Vercel detecta Next.js automáticamente; no hace falta
      tocar el comando de build (`pnpm build`, que ya incluye
      `prisma generate && next build` — `package.json:11`).
- [ ] `[Guille, navegador]` Antes del primer deploy, configura las variables
      de entorno de la tabla de la sección 2 en Project Settings →
      Environment Variables (marca las secretas como tal; Vercel ya las
      oculta de los logs de build). **No definas las `DEMO_*`.**
      `APP_BASE_URL` en este punto es la URL `.vercel.app` que Vercel te
      asigna (puedes verla en el propio dashboard antes de desplegar, con el
      patrón `https://<nombre-del-proyecto>.vercel.app`; confírmala tras el
      primer deploy y corrígela si el nombre real difiere).
- [ ] `vercel.json` ya está en el repo con el cron correcto
      (`/api/cron/reminders` cada hora, `0 * * * *`) — no hay que
      configurar nada más para que Vercel Cron lo recoja; se activa solo al
      desplegar un proyecto con plan que soporte Cron Jobs (compruébalo en
      el dashboard si el primer disparo no aparece).

### 3.4. Aplicar las migraciones

- [ ] `[Guille, terminal]` Con `DATABASE_URL` y `DIRECT_URL` de producción
      exportadas en el entorno local (o en un `.env` temporal que **no**
      commiteas), ejecuta:
      ```
      pnpm db:deploy
      ```
      Esto corre `prisma migrate deploy` (`package.json:18`), que aplica
      las 6 migraciones existentes en `prisma/migrations/` en orden
      (`20260712225310_init` … `20260727205711_add_membership_invitation_completed_at`)
      contra la BD de producción, usando `DIRECT_URL`. **Nunca uses
      `pnpm db:migrate`** para esto — ver sección 7.
- [ ] Comprueba que la migración `20260727205711_add_membership_invitation_completed_at`
      no ha hecho nada raro con su backfill: en una BD de producción vacía
      (sin `Membership` todavía) el `UPDATE ... WHERE role = 'OWNER'` de esa
      migración no afecta a ninguna fila, así que no hay nada que verificar
      aquí en Fase A — es un aviso relevante solo si alguna vez se migra
      datos ya existentes.

### 3.5. Alta del primer super-admin

- [ ] Sigue la sección 4 completa antes de desplegar (o justo después; el
      orden entre este paso y el 3.6 no importa, pero hazlo antes de
      intentar entrar a `/admin`).

### 3.6. Desplegar y verificar

- [ ] `[Guille, navegador]` Lanza el deploy desde Vercel (o con un `git
      push` si ya está conectado el repo).
- [ ] Sigue el checklist completo de la sección 5.

## 4. Alta del primer super-admin

El modelo `PlatformAdmin` (`prisma/schema.prisma:101-105`) es:

```prisma
model PlatformAdmin {
  id        String   @id @default(uuid())
  userId    String   @unique
  createdAt DateTime @default(now())
}
```

**Importante**: `@default(uuid())` en Prisma es un default **de la
aplicación** (Prisma Client genera el UUID en Node antes del INSERT), no un
default a nivel de columna en Postgres — se puede confirmar en la migración
que crea la tabla
(`prisma/migrations/20260721104459_add_platform_admin/migration.sql`): la
columna `"id"` es `TEXT NOT NULL` sin ningún `DEFAULT`. Eso significa que un
`INSERT` hecho a mano por SQL (sin pasar por Prisma) **debe generar el id
él mismo**, o el INSERT falla por violar la restricción `NOT NULL`. Usa
`gen_random_uuid()` (disponible por defecto en Postgres de Supabase).

Pasos:

- [ ] `[Guille, navegador]` En el dashboard de Supabase, ve a Authentication
      → Users → Add user. Crea el usuario con tu email real y una
      contraseña fuerte, marcando la opción de confirmar el email
      automáticamente (para no depender de que el email de confirmación
      llegue, ya que en Fase A el envío de correo va limitado por Resend).
- [ ] `[Guille, navegador]` Abre el editor SQL de Supabase (SQL Editor) y
      pega **una sola** sentencia que localiza tu usuario recién creado en
      `auth.users` por email y lo inserta en `PlatformAdmin` en el mismo
      paso — así no hay que copiar el UUID a mano:

      ```sql
      INSERT INTO public."PlatformAdmin" (id, "userId", "createdAt")
      SELECT gen_random_uuid(), id, now()
      FROM auth.users
      WHERE email = 'tu-email-real@ejemplo.com';
      ```

      Sustituye el email por el que usaste en el paso anterior. Si
      prefieres verificar el `userId` a mano primero (por ejemplo si hay
      dudas de que el email esté bien escrito), consúltalo aparte con
      `SELECT id, email FROM auth.users WHERE email = 'tu-email-real@ejemplo.com';`
      y pega ese UUID literal en un INSERT normal:

      ```sql
      INSERT INTO public."PlatformAdmin" (id, "userId", "createdAt")
      VALUES (gen_random_uuid(), '<uuid-copiado-de-auth.users>', now());
      ```
- [ ] Verifica con `SELECT * FROM public."PlatformAdmin";` que hay
      exactamente una fila con tu `userId`.
- [ ] Prueba el login en `/admin/login` con el email y contraseña que
      creaste (ver checklist de la sección 5).

No hay autoservicio de alta de super-admins por diseño (ver
`docs/superpowers/CONTINUAR.md`): el primero siempre se crea a mano así;
super-admins adicionales, si hacen falta, se dan de alta repitiendo este
mismo procedimiento (no hay UI para invitar super-admins, a diferencia de
los dueños de negocio).

## 5. Checklist de verificación tras desplegar

Prueba en este orden. Para cada punto: qué deberías ver si va bien, y dónde
mirar si no.

- [ ] **Login en `/admin`**: entra en `https://<tu-url>.vercel.app/admin/login`
      con las credenciales del super-admin dado de alta en la sección 4.
      Si va bien, entras al dashboard `/admin` y ves las métricas
      (negocios activos, citas de la semana). Si falla con "no autorizado"
      o similar, revisa que la fila de `PlatformAdmin` tenga el `userId`
      correcto y que `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
      estén bien puestas en Vercel (Project → Deployments → \[el deploy\] →
      Functions/Logs, o Runtime Logs en el dashboard de Vercel).
- [ ] **Alta de un negocio de prueba** desde `/admin/negocios`: rellena
      nombre, slug, email de negocio (opcional) y email del dueño
      (obligatorio). **En Fase A usa aquí TU PROPIA dirección de la cuenta
      de Resend**, no la de un tercero: sin dominio verificado, Resend solo
      acepta enviar a esa dirección y cualquier otra sería rechazada. Es una
      limitación de la cuenta de Resend, no un fallo del código — no la
      confundas con un bug al ver el error en los logs. Si va bien, el
      negocio aparece en el listado y, con `RESEND_API_KEY` configurada, te
      llega el email de invitación. Si falla, mira los Runtime Logs de Vercel buscando
      `[admin] fallo al invitar al dueño` (`src/lib/admin/platform-business-service.ts:122`).
- [ ] **Email de invitación**: ábrelo (en tu bandeja de Resend o, si no
      configuraste `RESEND_API_KEY`, en los Runtime Logs de Vercel donde
      `ConsoleEmailSender` lo habrá volcado como texto) y comprueba que el
      enlace apunta a `https://<tu-url>.vercel.app/panel/invitacion?token_hash=...`
      — **si apunta a `localhost`, `APP_BASE_URL` no está bien puesta**
      (ver el aviso de la sección 2).
- [ ] **`/panel/invitacion`**: sigue el enlace del email y fija una
      contraseña. Si va bien, te deja entrar a `/panel` como dueño de ese
      negocio de prueba. Si falla con un error de token, es probable que el
      enlace ya se haya usado (los tokens de invitación son de un solo uso)
      — pide un reenvío desde `/admin/negocios`.
- [ ] **Reserva pública**: visita `https://<tu-url>.vercel.app/<slug-del-negocio>`,
      configura al menos un servicio/empleado/horario desde `/panel` si el
      negocio nuevo no tiene ninguno todavía, y completa una reserva de
      prueba. Si va bien, ves la pantalla de confirmación y (si
      `manualApproval` está desactivado) llega el email de confirmación al
      cliente de prueba. Si falla, revisa los Runtime Logs de Vercel para
      la ruta de reserva.
- [ ] **Cron de recordatorios**: no hace falta esperar a que pase una cita
      real. En el dashboard de Vercel, ve a la pestaña Cron Jobs del
      proyecto y comprueba que `/api/cron/reminders` aparece programado
      cada hora y que su última ejecución devolvió 200. Para forzar una
      invocación manual sin esperar, puedes llamar al endpoint tú mismo con
      el `CRON_SECRET` configurado:
      ```
      curl -H "Authorization: Bearer <CRON_SECRET>" https://<tu-url>.vercel.app/api/cron/reminders
      ```
      Si va bien, responde `{"sent": N}` (N puede ser 0 si no hay citas
      pendientes de recordatorio, es normal en una BD recién estrenada). Un
      401 significa que el header no coincide con `CRON_SECRET` en Vercel;
      un 500 se explica en los Runtime Logs bajo `[cron/reminders]`
      (`src/app/api/cron/reminders/route.ts:16`).

## 6. Fase B: qué queda bloqueado hasta comprar el dominio

Cuando el usuario compre el dominio propio, hay tres cosas pendientes
(abordar como sesión guiada, no hace falta el ciclo completo de
`writing-plans`/`subagent-driven-development`):

- [ ] **Verificar el dominio en Resend**: sin esto, `EMAIL_FROM` sigue
      limitado a `onboarding@resend.dev` y los destinatarios reales siguen
      sin poder recibir nada — es el bloqueo real para tener clientes de
      verdad, no solo cosmético.
- [ ] **Apuntar el dominio en Vercel** (Project Settings → Domains).
- [ ] **Actualizar `APP_BASE_URL`** a `https://<dominio-propio>` y
      **`EMAIL_FROM`** a una dirección de ese dominio, y volver a desplegar
      (o simplemente esperar al siguiente deploy — las variables de entorno
      de Vercel se releen en cada build/runtime, no hace falta forzar nada
      más allá de que el cambio de variable surta efecto, lo cual en Vercel
      ya requiere un redeploy).

**`supabase/config.toml` (`site_url`, `additional_redirect_urls`) es solo
del stack local** (`pnpm exec supabase start`) y **no hace falta
replicarlo en el proyecto de Supabase en la nube**, ni ahora ni en Fase B.
Verificado en `src/lib/admin/owner-inviter.ts:46-65`: el flujo de
invitación de dueños usa deliberadamente `properties.hashed_token` +
`supabase.auth.verifyOtp({ token_hash, type: 'invite' })` y **nunca**
`properties.action_link` ni `options.redirectTo` — precisamente para no
depender de la lista de redirects permitidos. Esa mecánica no cambia entre
Fase A y Fase B: solo cambia el dominio que usa `APP_BASE_URL` para
construir el enlace (`${APP_BASE_URL}/panel/invitacion?token_hash=...`),
no ningún ajuste de Supabase Auth.

## 7. Avisos y trampas conocidas

- **`pnpm db:migrate` es `prisma migrate dev` — nunca contra producción.**
  `prisma migrate dev` puede generar y aplicar una migración nueva sobre la
  marcha (útil en local para iterar rápido) e incluso ofrecer resetear la
  BD si detecta drift. Contra producción, usa siempre `pnpm db:deploy`
  (`prisma migrate deploy`), que solo aplica migraciones ya existentes en
  `prisma/migrations/` y no genera ni resetea nada.
- **No ejecutes `pnpm db:seed` contra producción.** `prisma/seed.ts` crea
  un negocio demo, un dueño demo y un super-admin demo con las contraseñas
  literales que están en `.env.example` (`DEMO_OWNER_PASSWORD`,
  `DEMO_SUPERADMIN_PASSWORD`) — y `.env.example` está **versionado en
  git**, es público. Ejecutarlo en producción crearía cuentas reales con
  contraseñas que cualquiera puede leer en el repo.
- **La ruta `/` sigue siendo la plantilla de `create-next-app`.**
  `src/app/page.tsx` es literalmente el boilerplate por defecto de Next.js
  (logo de Next, enlaces a "Deploy now" y "Read our docs" de Vercel/Next,
  sin nada de Appoint). La URL raíz de producción mostrará esa plantilla,
  no una landing del producto — no es un bug del despliegue, es contenido
  pendiente que nunca se ha construido. Las páginas reales del producto
  están en `/admin`, `/panel` y `/<slug-de-negocio>`.
- **Los Runtime Logs de Vercel llevan PII operativa.** El patrón de
  logging del proyecto (`console.error`/`console.warn` con objeto de
  contexto, ver `src/lib/admin/platform-business-service.ts:122,202`,
  `src/lib/email/appointment-notifications.tsx` en varios puntos,
  `src/app/panel/invitacion/actions.ts:84`) incluye `businessId`,
  `userId`, `appointmentId` y, en los logs de email, la propia dirección
  de destino (`to: message.to`). Es información operativa normal para
  depurar, pero ten presente que los logs de Vercel no son un lugar neutro
  si en el futuro se comparten con terceros o se exportan a otra
  herramienta.
- **`TEST_DATABASE_URL` no hace falta en Vercel.** Solo la usa `pnpm test`
  contra Postgres local/CI (`src/test/prisma-client.ts`,
  `src/test/global-setup.ts`); no la lee ningún código de runtime.
