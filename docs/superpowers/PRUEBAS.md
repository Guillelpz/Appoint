# Guía de pruebas manuales — de "funciona" a "listo para clientes"

**Creada:** 2026-11-19 · **Negocio B confirmado:** Salón Aura · **Entorno:** producción (`https://<tu-app>.vercel.app`) · **Ronda en curso:** 1

Objetivo: recorrer la app como lo harán una dueña de peluquería y sus clientas,
**subiendo el volumen de datos día a día**, para cazar bugs y mejoras. Ciclo:

```
probar → reportar → arreglar (rama + deploy) → re-probar lo arreglado → siguiente día
```

Los días no tienen que ser consecutivos. Cada día dura entre 45 y 90 minutos.

---

## 1. Cómo reportar (lo único que tienes que hacer)

Cuando algo falle o chirríe, escríbelo en el chat de Claude Code con este formato
(una captura vale más que la descripción):

```
P2.4 · 🟠 · iPhone 13 / Safari
Hice: reservé "Corte" con "cualquier profesional" a las 17:00
Esperaba: que la asignara a quien tiene menos citas
Pasó: la asignó a Lucía, que ya tenía 5
```

- **P2.4** = el ID de la prueba de esta guía (si no sale de ninguna, pon `libre`).
- **Gravedad:**
  - 🔴 **Bloqueante** — no se puede reservar o gestionar, se pierden datos, o un
    negocio ve datos de otro.
  - 🟠 **Importante** — funciona mal pero hay rodeo, o una clienta se confundiría.
  - 🟡 **Menor** — visual, texto, detalle.
  - 💡 **Mejora** — no es un fallo, es una idea.

Claude lo apunta en el registro (§12), lo arregla en una rama, y cuando se
despliega te dice qué volver a probar.

**No reportes lo que ya está en §11 (problemas conocidos)**, salvo que lo veas
peor de lo descrito o que quieras subirle la prioridad.

---

## 2. Qué observar siempre (en todas las pruebas)

El diseño visual y el móvil son lo que diferencia al producto, así que cuentan
igual que un fallo funcional:

- **Móvil primero.** Haz cada día al menos la mitad de las pruebas desde el
  móvil. Gira la pantalla alguna vez.
- Nada se sale de la pantalla ni hay que hacer scroll horizontal.
- Los botones se pueden pulsar con el dedo sin acertar al de al lado.
- Las horas son siempre las de España: la que eliges, la del email, la del
  panel y la del `.ics` deben coincidir.
- Los textos están en español correcto y se entienden sin explicación.
- Nada tarda más de 2-3 segundos sin dar feedback (spinner, "Guardando…").
- Doble toque rápido en un botón de enviar no crea nada dos veces.

**Dispositivos:** apunta en qué dispositivos has probado (tabla al final de cada
día). Para dar la app por buena hacen falta como mínimo **un iPhone, un Android
y un ordenador**. Pide el móvil prestado a alguien si hace falta.

---

## 3. Límites de producción que condicionan las pruebas

- **Los emails solo llegan a tu dirección** (la de la cuenta de Resend): sin
  dominio verificado, Resend rechaza cualquier otro destinatario. La reserva
  funciona igual, pero esa clienta no recibe nada.
  → Usa tu email real solo en las reservas donde quieras probar el email.
  → Para el volumen, usa emails inventados (§4.3) y **confirma la cita desde la
  agenda del panel** (la caducidad de 30 min se la saltaría si no).
- **Máximo 2 citas activas por teléfono o email** en cada negocio. Por eso cada
  clienta de prueba lleva un teléfono y un email distintos.
- **Máximo 5 intentos de reserva por hora desde la misma conexión** (IP). Para
  meter volumen por la página pública, alterna wifi y datos móviles; para lo
  demás, usa las **citas manuales del panel**, que no tienen ese límite.
- **No hay recordatorios automáticos** (no hay cron). En el Día 5 se lanzan a
  mano.

---

## 4. Día 0 — Preparación (una sola vez, ~45 min)

### 4.1 Seguridad antes de nada 🔴

Producción tiene cuentas demo con contraseñas públicas (ver `DESPLIEGUE.md` §1).
Mientras existan, cualquiera puede entrar en `/admin`. Antes de meter datos:

- [ ] P0.1 Borrar el super-admin demo (`superadmin@appoint.example`) siguiendo
      `DESPLIEGUE.md` §1, pasos 1-2.
- [ ] P0.2 Cambiar la contraseña del dueño demo de Salón Aura
      (`dueno@salonaura.example`) en Supabase → Authentication → Users. Lo
      usaremos como **negocio B** de pruebas.
- [ ] P0.3 Comprobar que con la contraseña antigua (`appoint-demo-2026`) ya no
      se entra en `/panel/login`, y que tu super-admin real sí entra en `/admin`.

### 4.2 Negocio A — "Peluquería Pruebas"

- [ ] P0.4a **Averigua el email de tu cuenta de Resend:** es con el que te
      registraste en resend.com (lo ves en Resend → Settings → Team, o en el
      correo de bienvenida de Resend). Compáralo con el de tu super-admin (el
      que usas en `/admin/login`).
- [ ] P0.4b En `/admin/negocios`, da de alta **"Peluquería Pruebas"** (slug
      `pruebas`, tipo peluquería):
      - **Si los dos emails son distintos:** pon como email del dueño el de
        Resend. Te llegará la invitación → sigue con P0.5.
      - **Si son el mismo** (o el alta falla): pon un email inventado
        (`dueno@pruebas.example`). La invitación no llegará; pídeme el SQL para
        fijarle la contraseña desde el editor SQL de Supabase y salta P0.5.
        Ojo: en ese caso, las pruebas de email (P1.3, P1.7, P2.8…) se hacen
        con **tu email como clienta**, no como dueña, así que no cambia nada.
- [ ] P0.5 Abre el email de invitación, fija la contraseña y entra en `/panel`.
- [ ] P0.6 **Ajustes:** dirección, teléfono, política de cancelación (un texto
      de dos líneas), tema por defecto, ventana 30 días, antelación 60 min,
      aprobación manual **desactivada**.
- [ ] P0.7 **Servicios** (5):

  | Servicio | Duración | Precio | Buffer |
  |---|---|---|---|
  | Corte mujer | 45 min | 25 € | 10 min |
  | Corte hombre | 30 min | 15 € | 0 |
  | Color | 90 min | 55 € | 15 min |
  | Peinado | 30 min | 20 € | 0 |
  | Tratamiento hidratante | 60 min | 35 € | 5 min |

- [ ] P0.8 **Equipo** (3), con horarios distintos a propósito:

  | Empleada | Servicios | Horario |
  |---|---|---|
  | Lucía | todos | L-V 09:00-14:00 y 16:00-20:00 |
  | Marta | todos menos Color | L-S 10:00-18:00 |
  | Andrés | Corte hombre, Corte mujer | M-S 09:00-15:00 |

- [ ] P0.9 Abre `https://<tu-app>.vercel.app/pruebas` en el móvil y comprueba que
      salen los 5 servicios y las 3 personas.

### 4.3 Clientas de prueba

Usa siempre estas (nombre · teléfono · email). Tu email real solo cuando la
prueba lo pida.

| # | Nombre | Teléfono | Email |
|---|---|---|---|
| 01 | Ana Prueba | 600 000 001 | ana01@example.com |
| 02 | Bea Prueba | 600 000 002 | bea02@example.com |
| 03 | Carla Prueba | 600 000 003 | carla03@example.com |
| … | (sigue la serie) | 600 000 0NN | nombreNN@example.com |
| 40 | Zoe Prueba | 600 000 040 | zoe40@example.com |

---

## 5. Día 1 — Volumen bajo: el camino feliz (≈5 citas)

**Foco:** que una clienta real, sin explicaciones, pueda reservar desde el móvil.

### Página pública
- [ ] P1.1 Abre `/pruebas?src=qr` en el móvil. Primera impresión: ¿parece un
      sitio profesional? ¿Se entiende qué hacer en 3 segundos?
- [ ] P1.2 Reserva **Corte mujer** con **Lucía**, mañana, primera hora libre,
      con **tu email real**. Cuenta cuántos toques te ha costado.
- [ ] P1.3 Te llega el email de confirmación (mira spam). Revisa: hora, servicio,
      profesional, dirección del negocio, enlaces. ¿Se ve bien en el móvil?
- [ ] P1.4 Pulsa **Confirmar**. Comprueba la pantalla de éxito y descarga el
      **.ics**: ¿se añade al calendario del móvil con la hora correcta?
- [ ] P1.5 Vuelve a pulsar el enlace de confirmar del mismo email. Debe decir
      algo sensato (ya confirmada), no un error feo.
- [ ] P1.6 Reserva **Peinado** con **"cualquier profesional"** con tu email,
      **no confirmes** y espera 35 min: el hueco debe volver a aparecer libre y
      el enlace de confirmar debe explicar que ha caducado.
- [ ] P1.7 Desde el email de la cita de P1.2, **cancela**. Te debe llegar el
      email de cancelación y el hueco debe volver a estar libre.

### Panel
- [ ] P1.8 En `/panel` (agenda, vista día) aparecen las citas de hoy/mañana en la
      columna de la empleada correcta, con la hora correcta y el estado correcto.
- [ ] P1.9 Crea una **cita manual** (Ana Prueba 01, Color, Lucía, mañana 16:00).
      Aparece confirmada en la agenda y bloquea ese hueco en la página pública.
- [ ] P1.10 Repite P1.1–P1.4 desde el **ordenador**.

**Dispositivos usados hoy:** ______________________

---

## 6. Día 2 — Volumen medio: el día a día del salón (≈20 citas)

**Foco:** que la agenda sea manejable con un día normal de trabajo.

### Carga de datos (≈20 min)
- [ ] P2.1 Mete 5 reservas por la **página pública** (clientas 02–06, emails
      inventados), repartidas entre mañana y pasado. Confírmalas desde la agenda.
- [ ] P2.2 Mete 15 **citas manuales** (clientas 07–21) repartidas en los
      próximos 5 días, con las 3 empleadas y los 5 servicios.

### Agenda
- [ ] P2.3 Vista **día** y vista **semana**: ¿se entiende de un vistazo quién
      está libre y cuándo? Navega adelante/atrás. ¿Y en el móvil?
- [ ] P2.4 Reserva 3 veces seguidas con **"cualquier profesional"** a una hora
      en que estén libres varias: debe asignar a la que tenga **menos citas ese
      día**.
- [ ] P2.5 Marca una cita de hoy como **completada** y otra como **no
      presentada**. Comprueba que se distinguen bien en la agenda.
- [ ] P2.6 **Cancela** una cita desde el panel. El hueco se libera en la página
      pública (si la clienta eres tú, te llega el email).
- [ ] P2.7 Intenta crear una cita manual **encima** de otra de la misma empleada.
      Debe impedirlo con un mensaje claro.

### Aprobación manual
- [ ] P2.8 Activa **aprobación manual** en Ajustes. Reserva desde la página
      pública con tu email y confirma desde el email: la cita debe quedarse
      **pendiente** hasta que la apruebes en el panel. ¿Lo explica la pantalla
      a la clienta?
- [ ] P2.9 Aprueba esa cita (te llega email de "aprobada"). Haz otra y
      **recházala** (te llega email de cancelación).
- [ ] P2.10 Desactiva de nuevo la aprobación manual.

### Clientes
- [ ] P2.11 `/panel/clientes`: aparecen las ~20 clientas, sin duplicados. Abre
      una y revisa su historial de citas.

**Dispositivos usados hoy:** ______________________

---

## 7. Día 3 — Reglas, límites y errores

**Foco:** que nada se rompa cuando la clienta o la dueña hacen algo raro.

### Anti-fraude
- [ ] P3.1 Con la clienta 22, haz 2 reservas activas. La **3ª** debe
      rechazarse con un mensaje amable (y con el mismo teléfono pero otro email
      también).
- [ ] P3.2 Con la clienta 23, intenta reservar **dos citas solapadas** (misma
      hora, distintas empleadas). Debe impedirlo.
- [ ] P3.3 Desde la misma conexión, haz **6 intentos de reserva en menos de una
      hora**. El 6º debe rechazarse amablemente. (Cambia a datos móviles para
      seguir probando.)
- [ ] P3.4 **Lista negra:** bloquea a la clienta 24 desde su ficha. Intenta
      reservar con su teléfono y luego con su email. Ambas deben rechazarse sin
      desvelar que está bloqueada. Desbloquéala y vuelve a probar.

### Reglas de reserva
- [ ] P3.5 **Antelación mínima:** con 60 min configurados, hoy no deben salir
      horas de dentro de la próxima hora. Cámbiala a 1440 (24 h) y comprueba que
      hoy desaparece entero.
- [ ] P3.6 **Ventana máxima:** con 30 días, el día 31 no debe ofrecerse. Bájala a
      7 y comprueba.
- [ ] P3.7 **Buffer:** reserva Corte mujer (45+10) a las 10:00 con Lucía. La
      siguiente hora libre de Lucía debe ser 10:55 o después, no 10:45.
- [ ] P3.8 **Hueco ocupado al momento:** abre la misma hora en dos móviles (o
      dos pestañas), elige el mismo hueco y reserva en los dos casi a la vez. El
      segundo debe ver "ese hueco acaba de ocuparse" con alternativas.

### Equipo y servicios
- [ ] P3.9 Registra una **ausencia** de Marta pasado mañana de 10:00 a 13:00.
      Esas horas no deben ofrecerse con ella. Prueba también fechas inválidas
      (ayer, más de 90 días) y una ausencia que se solape con otra.
- [ ] P3.10 **Desactiva un servicio**: desaparece de la página pública. ¿Qué pasa
      con las citas que ya lo tenían?
- [ ] P3.11 **Desactiva a Andrés**: desaparece de la página pública y no recibe
      citas con "cualquier profesional". ¿Qué pasa con sus citas futuras?
      Reactívalo.
- [ ] P3.12 Edita el horario de Lucía (quita la tarde del viernes). Los huecos
      públicos de ese viernes deben cambiar al momento.

### Enlaces y páginas de error
- [ ] P3.13 Abre `/no-existe` y `/cita/token-inventado`: página amable, sin
      errores técnicos.
- [ ] P3.14 Usa un enlace de cancelar de una cita **ya cancelada** y uno de una
      cita **ya pasada**.
- [ ] P3.15 En el formulario de reserva: nombre vacío, email mal escrito,
      teléfono con letras, nombre de 200 caracteres, emojis en el nombre.
- [ ] P3.16 En Ajustes y Servicios: valores negativos, 0, decimales, campos
      vacíos, precio de 9.999 €.

**Dispositivos usados hoy:** ______________________

---

## 8. Día 4 — Volumen alto: salón lleno (≈60 citas, 40 clientas)

**Foco:** que la app siga siendo usable (y rápida) con una semana real de
trabajo.

### Carga de datos (≈40 min)
- [ ] P4.1 Llena **un día entero** de Lucía (sin un hueco libre) con citas
      manuales.
- [ ] P4.2 Llega hasta **40 clientas** distintas y **~60 citas** en las
      próximas dos semanas (manuales + públicas alternando conexión). Mezcla
      estados: confirmadas, completadas, no presentadas, canceladas.

### Comprobaciones
- [ ] P4.3 En la página pública, el día lleno de Lucía: con Lucía no debe haber
      huecos y el mensaje debe ayudar (otra profesional, otro día). Con
      "cualquier profesional" deben salir los huecos de las demás.
- [ ] P4.4 Agenda, vista **semana**, en el **móvil**: ¿sigue siendo legible con
      ~30 citas a la vista?
- [ ] P4.5 `/panel/clientes`: con 40 clientas hay **paginación de 20 en 20**.
      Pasa de página. ¿Echas de menos un **buscador**? (💡 si sí.)
- [ ] P4.6 **Rendimiento percibido:** cronometra a ojo (en el móvil, con datos)
      abrir la página pública, abrir la hoja de reserva, cambiar de día y cargar
      la agenda. Apunta lo que pase de 2-3 segundos.
- [ ] P4.7 Una clienta con muchas citas en su historial: la ficha se lee bien.

**Dispositivos usados hoy:** ______________________

---

## 9. Día 5 — Super-admin, temas, aislamiento y recordatorios

### Temas (lo que vende)
- [ ] P5.1 Prueba los **3 temas** con **3 colores de acento** cada uno (uno
      claro, uno oscuro, uno chillón) mirando la vista previa y la página
      pública en el móvil. Apunta cualquier combinación ilegible (texto sobre
      fondo sin contraste).
- [ ] P5.2 Elige el tema que enseñarías a una peluquería y hazle capturas: te
      servirán para vender.
- [ ] P5.3 Descarga el **QR** desde Ajustes, ábrelo y escanéalo con otro móvil:
      debe llevar a `/pruebas?src=qr`. Imprímelo en A6 y comprueba que se escanea
      bien en papel.

### Aislamiento entre negocios 🔴
- [ ] P5.4 Entra en el panel de **Salón Aura** (negocio B). No debe aparecer
      **nada** de Peluquería Pruebas: ni clientas, ni citas, ni empleadas.
- [ ] P5.5 Estando en el panel de Salón Aura, pega en la barra la URL de la
      ficha de una clienta de Peluquería Pruebas (`/panel/clientes/<id>`, cópiala
      antes desde el otro panel). Debe dar "no encontrado".
- [ ] P5.6 Reserva en Salón Aura con la clienta 01 (que ya tiene 2 citas en
      Pruebas): el límite de 2 citas es **por negocio**, así que debe dejarte.

### Super-admin
- [ ] P5.7 `/admin`: las métricas (negocios activos, citas de la semana) cuadran
      con lo que has creado.
- [ ] P5.8 **Suspende** Peluquería Pruebas. La página pública muestra una página
      amable y su dueña no puede entrar en `/panel`. **Reactívalo** y comprueba
      que todo vuelve, citas incluidas.
- [ ] P5.9 Da de alta un tercer negocio con un email de dueño inventado y prueba
      **reenviar invitación** (el email no llegará, pero la app no debe romper ni
      mentir sobre lo que ha pasado).

### Recordatorios
- [ ] P5.10 Crea una cita **para mañana a esta misma hora** con tu email real.
      Lanza el cron a mano (Claude te da el comando con tu `CRON_SECRET`, ver
      `DESPLIEGUE.md` §5). Debe llegarte el recordatorio, **una sola vez** aunque
      lo lances dos veces.

### Cambio de hora (bonus)
- [ ] P5.11 Sube la ventana de reserva a 365 días y reserva el **viernes 26 de
      marzo de 2027** a las 10:00 y el **lunes 29 de marzo** a las 10:00 (el
      cambio a horario de verano es el domingo 28). En el email, el panel y el
      `.ics` deben ser las 10:00 en los dos casos. Devuelve la ventana a 30.

**Dispositivos usados hoy:** ______________________

---

## 10. Ronda de regresión (tras cada tanda de arreglos, ~30 min)

Cuando Claude despliegue arreglos:

1. Re-prueba **cada bug arreglado** con sus pasos originales (columna "Re-probar"
   del registro). Si está bien, dilo y se marca ✅.
2. Pasa la **prueba de humo**: P1.2, P1.3, P1.4, P1.7, P1.9, P2.3, P2.8, P3.1,
   P5.4. Si alguna falla, es una regresión → 🔴.
3. Sigue con el siguiente día pendiente.

### Criterio de "listo para clientes"

- [ ] Dos rondas completas seguidas (Días 1-5) **sin ningún 🔴 ni 🟠 abierto**.
- [ ] Probado en al menos **un iPhone, un Android y un ordenador**.
- [ ] Una **persona ajena** ha reservado desde su móvil sin ayuda y sin dudar
      (`LANZAMIENTO.md` §0.5).
- [ ] Bloque 0 de `LANZAMIENTO.md` resuelto (dominio + Resend, recordatorios,
      backups) y aviso de privacidad del Bloque 1 puesto.
- [ ] **Limpieza:** suspender o borrar los negocios de prueba antes de dar de
      alta al primer cliente real.

---

## 11. Problemas ya conocidos (no hace falta reportarlos)

Están documentados en `CONTINUAR.md` y `Checklist.txt`. Si al probar alguno te
molesta más de lo esperado, dilo y se sube de prioridad.

**Limitaciones de producción hoy:**
- Emails solo a tu dirección (sin dominio en Resend). Sin recordatorios
  automáticos. Sin copias de seguridad.
- La portada `/` es la plantilla por defecto de Next.js.
- Sin aviso de privacidad ni páginas legales.

**Funcionalidad que falta:**
- No se puede subir **logo**, **fotos del negocio** ni **fotos de empleadas**
  desde ninguna pantalla.
- El QR solo se descarga en **SVG** (no PNG/PDF).
- No hay registro de clientas tras reservar (magic link).
- No se puede **deshacer** un cambio de estado (completada/no presentada por
  error). *(Checklist)*
- Si la reserva da error, no hay botón para **contactar** con el negocio.
  *(Checklist)*
- La página de **establecer contraseña** es mejorable. *(Checklist)*

**Fallos menores conocidos:**
- Tras un error en la hoja de reserva, al volver se pierden nombre, teléfono y
  email tecleados.
- Solo se ofrecen horas alternativas cuando el hueco se acaba de ocupar; con
  otros errores solo invita a elegir "otro horario".
- Una **ausencia** que pisa citas ya confirmadas no avisa ni las cancela.
- `?page=999` en un listado muestra una lista vacía en vez de la última página.
- El email de "reenviar invitación" es idéntico al primero.
- Una cita aprobada con menos de 23 h de antelación no recibe recordatorio.
- La vista semana de la agenda es simple (columnas por empleada, sin franjas).

---

## 12. Registro de bugs y mejoras

Lo mantiene Claude a partir de lo que reportes en el chat. Estados:
🆕 nuevo · 🔧 arreglado (pendiente de re-probar) · ✅ verificado ·
⏸️ aplazado (decisión del usuario) · ❌ no es bug.

| ID | Prueba | Grav. | Descripción | Dispositivo | Estado | Arreglo (commit/PR) | Re-probar |
|---|---|---|---|---|---|---|---|
| — | — | — | _(vacío)_ | — | — | — | — |

### Registro de rondas

| Ronda | Fechas | Días cubiertos | Bugs nuevos (🔴/🟠/🟡/💡) | Notas |
|---|---|---|---|---|
| 1 | | | | |
