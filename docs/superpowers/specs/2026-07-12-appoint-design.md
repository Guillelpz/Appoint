# Appoint — Especificación de diseño

**Fecha:** 2026-07-12 · **Estado:** aprobada por el usuario (brainstorming completado)

## Resumen

SaaS multi-tenant de gestión de citas para negocios locales (peluquerías, clínicas, barberías...). Cada negocio obtiene una página pública con QR imprimible; sus clientes escanean, ven huecos disponibles y reservan sin registrarse. El distintivo del producto es el diseño visual: base "camaleónica" con temas por negocio, muy responsive (mobile-first).

## Decisiones clave (validadas con el usuario)

| Tema | Decisión |
|---|---|
| Modelo | SaaS multi-tenant, un solo despliegue |
| Identificación cliente | Sin registro para reservar (nombre + teléfono + email); registro opcional post-reserva vía enlace mágico |
| Agenda | Servicios + empleados con horarios propios; cliente elige servicio y opcionalmente profesional |
| Notificaciones | Email desde el día 1 (Resend); arquitectura preparada para SMS/WhatsApp futuro |
| Stack | Next.js App Router + TypeScript + Tailwind, Prisma sobre PostgreSQL de Supabase, Supabase Auth (solo negocio/admin), Vercel |
| Hosting | Vercel + Supabase; dominio propio pendiente de comprar |
| Alcance MVP | Reserva pública vía QR + panel del negocio + panel super-admin. Sin pagos |
| Idioma | Solo español (código preparado para i18n futuro) |
| Dirección visual | Camaleónica: 3 presets de tema + color de acento por negocio. Preset por defecto: **Boutique editorial** (crema/terracota, serif elegante) |
| Flujo de reserva | Híbrido: página-escaparate + hoja inferior (bottom sheet) para reservar |
| Anti-fraude | Límites y duplicados + confirmación por email + lista negra por negocio |
| Arquitectura | Monolito Next.js con lógica en Server Actions/Route Handlers y Prisma (sin RLS; autorización en capa de aplicación) |

## Arquitectura

Una sola app Next.js (App Router, TypeScript) en Vercel:

- **Frontend:** React + Tailwind CSS. GSAP para transiciones de la hoja inferior y microinteracciones. Temas con variables CSS aplicadas en servidor (sin FOUC).
- **Backend:** Server Actions + Route Handlers. Toda la lógica de negocio (huecos, reservas, anti-fraude) en TypeScript testeable.
- **BD:** PostgreSQL (Supabase) vía Prisma. Multi-tenancy por columna `businessId` filtrada en capa de aplicación.
- **Auth:** Supabase Auth (email+contraseña) para dueños/empleados y super-admin. Clientes finales sin cuenta; registro opcional post-reserva con magic link.
- **Email:** Resend + React Email. Plantillas: confirmación, recordatorio (24 h antes), cancelación, invitación de dueño.
- **Cron:** Vercel Cron horario para recordatorios.
- **QR:** generado en el panel (`qrcode`), descarga PNG/PDF listo para imprimir, apunta a `/{slug}?src=qr`.

### Rutas

| Zona | Ruta | Usuario |
|---|---|---|
| Pública | `/{slug}` | Cliente (escaparate + reserva) |
| Pública | `/cita/{token}` | Cliente: ver/cancelar cita |
| Pública | `/confirmar/{token}` | Cliente: confirmar cita |
| Panel | `/panel` (agenda), `/panel/servicios`, `/panel/equipo`, `/panel/clientes`, `/panel/ajustes` | Dueño/staff |
| Admin | `/admin` (negocios, métricas) | Super-admin |

## Modelo de datos

Todas las tablas de negocio llevan `businessId`.

- **Business:** slug, nombre, tipo, dirección, teléfono, email, tema (`preset` + `accentColor` + logo), ajustes (ventana máxima de reserva, antelación mínima, política de cancelación, `manualApproval` on/off), `active`.
- **Membership:** userId (Supabase Auth) ↔ businessId + rol `OWNER` | `STAFF`; rol global `SUPERADMIN`.
- **Service:** nombre, descripción, duración (min), precio, buffer posterior (min), activo, orden.
- **Employee:** nombre, foto, color de agenda; N:M con Service (`ServiceEmployee`); opcionalmente vinculado a un user.
- **WorkingHours:** por empleado y día de semana, tramos horarios (varios por día).
- **TimeOff:** ausencias por empleado (rango fecha-hora, motivo).
- **Appointment:** businessId, serviceId, employeeId, datos cliente (nombre, teléfono, email), start, end, estado, `confirmToken`, `cancelToken`, origen (`qr` | `web` | `manual`), timestamps.
  - Estados: `PENDING` → `CONFIRMED` → `COMPLETED` | `CANCELLED` | `NO_SHOW`.
  - La transacción de reserva revalida solapes antes de insertar; la restricción única `(employeeId, start)` (parcial, solo citas activas) actúa de red de seguridad ante carreras por el mismo hueco exacto.
- **Customer:** por negocio (email/teléfono únicos por negocio); creado automáticamente al reservar; `registered`, `marketingConsent`; histórico de citas.
- **BlacklistEntry:** businessId + teléfono/email + motivo.

### Motor de huecos

`horario laboral del empleado − citas activas − ausencias`. Los huecos se generan en pasos de granularidad configurable por negocio (15 min por defecto), y un hueco es válido si la duración completa del servicio (+ buffer) cabe sin solapar nada. Citas `PENDING` bloquean el hueco solo 30 min desde su creación (expiración perezosa: el cálculo de huecos ignora pendientes caducadas; no se necesita cron de limpieza). Reserva dentro de transacción; ante violación de la restricción única se muestra "ese hueco acaba de ocuparse" con alternativas.

## Flujos

### Cliente

1. Escanea QR → `/{slug}`: escaparate con tema del negocio (cabecera, fotos, servicios con precio/duración, equipo).
2. Toca servicio → hoja inferior: profesional (o "cualquiera"), día (selector horizontal), hora (chips de huecos).
3. Nombre + teléfono + email → "Reservar" → cita `PENDING`.
4. Email con botón **Confirmar** (caduca 30 min → libera hueco). Al confirmar: pantalla de éxito con resumen, .ics "añadir a calendario", enlace de cancelación e invitación opcional a registrarse (magic link, sin contraseña).
5. Recordatorio email 24 h antes con enlace de cancelación.

Si elige "cualquiera" como profesional, el sistema asigna el empleado disponible con menos carga ese día.

### Negocio (`/panel`)

- **Agenda** (principal): vista día/semana por empleado; confirmar pendientes, marcar completada/no-show, crear cita manual, cancelar (envía email al cliente).
- **Servicios / Equipo:** CRUD; horarios semanales por empleado y ausencias.
- **Clientes:** listado con historial; bloquear (lista negra).
- **Ajustes:** datos del negocio, tema (preset + acento con vista previa en vivo), políticas de reserva, descarga del QR.

### Super-admin (`/admin`)

Alta de negocios (crea negocio + invita a dueño por email), activar/suspender, métricas simples (negocios activos, citas/semana).

## Theming

3 presets — **Boutique editorial** (defecto), **Vibrante**, **Minimal sereno** — definidos como archivos de tema con variables CSS (colores, tipografías, radios, sombras). El negocio elige preset + color de acento + logo. Aplica solo a páginas públicas; panel y admin usan estilo propio neutro. Los componentes públicos leen variables: añadir un preset futuro = un archivo nuevo.

## Anti-fraude

1. **Límites:** máx. 2 citas activas por teléfono/email por negocio; sin solapes entre citas del mismo cliente; máx. 5 intentos de reserva/hora por IP (respuesta amable).
2. **Confirmación email:** cita nace `PENDING`, caduca a los 30 min sin confirmar. El negocio puede confirmar manualmente desde la agenda.
3. **Lista negra:** por teléfono/email y por negocio; interruptor global `manualApproval` (todas las citas requieren aprobación del negocio).

## Manejo de errores

- Hueco ocupado en el último segundo → mensaje + huecos alternativos.
- Token de confirmación/cancelación caducado o usado → pantalla explicativa con opción de re-reservar.
- Negocio suspendido/inexistente → página amable.
- Sin huecos disponibles → mensaje con próximo día disponible ("avísame si se libera": fase 2).

## Pruebas

- **TDD (Vitest):** motor de huecos, reglas anti-fraude, transiciones de estado, asignación "cualquier profesional".
- **Playwright e2e:** reservar → confirmar → cancelar; login del panel y confirmación manual.

## Fases de construcción

1. **Fundación:** proyecto Next.js, Prisma + esquema completo, Supabase Auth, seed con negocio demo.
2. **Motor de reservas:** huecos + transacción de reserva + anti-fraude (TDD puro, sin UI).
3. **Página pública:** escaparate + hoja inferior + theming (máximo esfuerzo de diseño).
4. **Emails:** plantillas + confirmación/cancelación + cron de recordatorios.
5. **Panel del negocio:** agenda, CRUDs, ajustes, QR.
6. **Super-admin + despliegue:** Vercel + Supabase producción; dominio propio cuando se compre.

## Fuera de alcance (fase 2+)

Pagos/suscripciones, SMS/WhatsApp, i18n, lista de espera ("avísame si se libera"), OTP progresivo, apps nativas, subdominios por negocio.

---

## Anexo — Desviaciones respecto a la implementación (revisión 2026-11-18)

El cuerpo de esta spec se conserva tal como se aprobó. Este anexo recoge en qué se aparta hoy el código. Así nadie toma la spec como descripción literal del sistema. Los huecos que siguen abiertos están también en `docs/superpowers/CONTINUAR.md`, en "Huecos respecto a la spec".

### Cambios de diseño ya decididos (la implementación es la referencia)

| Spec | Implementación | Dónde se decidió |
|---|---|---|
| `Membership` con rol global `SUPERADMIN` | Tabla propia `PlatformAdmin` (`userId` único), independiente de `Membership`. `MembershipRole` solo tiene `OWNER` y `STAFF` | Plan de la Fase 6 |
| Cron: Vercel Cron horario para recordatorios | **No hay cron programado.** `vercel.json` se borró en `816d939` porque el plan Hobby solo admite crons diarios. `/api/cron/reminders` existe y funciona si se invoca a mano. Ventana de envío: `[now+23h, now+25h)` | Decisión del usuario en la Fase A del despliegue (ver `DESPLIEGUE.md`, `LANZAMIENTO.md` §0.3) |
| Rol `STAFF` con acceso a `/panel` | Declarado en el enum, sin UI ni autorización: solo `OWNER` entra al panel | Plan de la Fase 5 |
| Presets "definidos como archivos de tema" | Un único mapa `THEME_PRESETS` en `src/lib/theme/theme.ts`. Añadir un preset = una entrada nueva en ese mapa + un valor en el enum `ThemePreset` (migración) | Implementación de la Fase 3 |
| `manualApproval`: "todas las citas requieren aprobación del negocio" (sin más detalle) | Doble paso: confirmar por email fija `emailVerifiedAt` y la cita **sigue `PENDING`** hasta que el negocio la aprueba en `/panel`. Una pendiente ya verificada no caduca a los 30 min y sigue bloqueando el hueco | Plan de la Fase 4 (concreción, no contradicción) |
| Super-admin + despliegue en la misma fase 6 | La Fase 6 solo incluyó el super-admin. El despliegue es un hito aparte (`DESPLIEGUE.md`) | Plan de la Fase 6 |

### Funcionalidad de la spec no implementada (pendiente de decisión del usuario)

- **QR "descarga PNG/PDF listo para imprimir"**: solo se descarga en **SVG** (`src/lib/panel/qr.ts`, `/panel/ajustes`).
- **Registro opcional post-reserva con magic link**: no existe. El plan de la Fase 3 lo dejó fuera de alcance y no se retomó. `Customer.registered` nunca se pone a `true`.
- **"El negocio elige preset + color de acento + logo"**: `/panel/ajustes` permite elegir preset y acento, pero **no el logo**. Tampoco hay ninguna pantalla para las fotos del negocio (`Business.imageUrls`) ni para las fotos de los empleados (`Employee.photoUrl`). La página pública las muestra, pero hoy solo se rellenan por seed o por SQL.
- **`Customer.marketingConsent`**: existe en el modelo, pero no se recoge ni se usa (ver `LANZAMIENTO.md` §1.1).
