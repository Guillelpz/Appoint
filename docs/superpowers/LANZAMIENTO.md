# Roadmap de lanzamiento comercial

**Creado:** 2026-07-31 · **Estado:** borrador de trabajo, pendiente de aprobación final del usuario
**Para leer cuando:** el desarrollo se dé por terminado (frontend, backend, eficiencia).

Este documento cubre el camino desde "la app funciona" hasta "hay peluquerías
pagando por ella". No cubre desarrollo de producto: para el estado técnico y la
siguiente tarea de ingeniería, `CONTINUAR.md` sigue siendo la fuente de verdad;
para el despliegue paso a paso, `DESPLIEGUE.md`.

---

## ⚠️ Tres cosas de aquí NO deberían esperar al final del desarrollo

Están en el Bloque 0 y son agujeros abiertos **hoy** en producción, no mejoras:

1. **Resend sin dominio verificado** — ninguna clienta de ninguna peluquería
   puede recibir un email. El producto es email-céntrico: sin esto no hay
   producto que enseñar, ni siquiera a un amigo.
2. **Los recordatorios de 24 h están apagados** — se cayeron al borrar
   `vercel.json` (commit `816d939`) por el límite de cron del plan Hobby.
   Es la funcionalidad que justifica el precio.
3. **No hay copias de seguridad** — Supabase Free no las hace. El día que haya
   una agenda real dentro, un fallo sin copia se lleva por delante al cliente
   y su boca a boca.

Todo lo demás sí puede esperar a que termines de pulir producto.

---

## 1. Punto de partida (31 de julio de 2026)

**Lo que está hecho:**
- Fases 1-6 completas y en `main`: motor de reservas, página pública con temas,
  emails, panel del negocio, panel de super-admin. 394 tests Vitest + 3 e2e.
- Desplegado en Vercel (plan Hobby) sobre Supabase en la nube, con la URL
  `.vercel.app`, y **verificado end-to-end** por el usuario.

**Lo que no está hecho, y bloquea vender:**

| Agujero | Consecuencia comercial |
|---|---|
| Resend sin dominio verificado | Los emails solo llegan a la dirección del propio usuario. Cero clientes posibles. |
| Cron de recordatorios eliminado | Se pierde el argumento de venta principal (reducir plantones). |
| `/` es la plantilla de `create-next-app` | Quien busque el producto ve el boilerplate de Next.js. |
| Cero RGPD en `src/` | El formulario público pide nombre, teléfono y email sin informar. Incumplimiento y objeción comercial garantizada. |
| Sin backups | Riesgo de pérdida total de datos de un cliente real. |
| Alta de negocios solo manual desde `/admin` | No es un problema para el piloto; lo es a partir de ~10 clientes. |
| Sin cobro de ningún tipo | Sin ingresos posibles, y el usuario no está dado de alta fiscalmente. |

---

## 2. Decisiones ya tomadas con el usuario (2026-07-31)

| Tema | Decisión |
|---|---|
| Estado del despliegue | Fase A desplegada **y verificada** |
| Primeros clientes | **Desde cero**: no hay ningún contacto en el sector |
| Cobro inicial | **Piloto gratis**, cobrar después |
| Presupuesto de infraestructura | Todo gratuito **hasta el primer cliente pagando** |
| Nombre | **Abierto a cambiar** "Appoint" antes de comprar dominio |
| App móvil | **Ninguna por ahora** (ni nativa ni PWA) |
| Situación fiscal | **Ni autónomo ni SL** — no puede facturar todavía |
| Dedicación | **15-30 h/semana** |
| Camino elegido | **Opción A: piloto conserje** (ver §3) |

---

## 3. El camino elegido: "piloto conserje"

Arreglar solo lo que impide que el producto funcione con gente real, y meter
**una peluquería de verdad** cuanto antes. El usuario hace el alta a mano,
configura los servicios y horarios del salón, y le lleva el QR impreso. Cero
autoservicio, cero cobro. Después, iterar con feedback real.

**Por qué:** el producto ya está construido y verificado. El trabajo pendiente
para dejarlo usable por extraños son ~3 semanas al ritmo del usuario. Es poco
comparado con el riesgo de las alternativas.

**Alternativas descartadas y por qué:**

- **Producto completo primero** (landing potente + autoservicio + Stripe + precios
  publicados, y entonces vender): 3-4 meses hasta el primer usuario, construidos
  sobre suposiciones. Es el error clásico — invertir el 80% del esfuerzo en
  facturación y onboarding antes de saber si alguien quiere el producto.
- **Vender antes de arreglar nada** (enseñar la app desde el móvil mañana mismo):
  más rápido, pero quema contactos. Si la primera dueña dice que sí y resulta que
  los emails no llegan a sus clientas, se pierde el mejor contacto disponible, y
  en un negocio local no hay segunda oportunidad.

De esta última **sí se roba una cosa**: empezar las visitas de descubrimiento en
la semana 1, en paralelo, sin vender nada — solo preguntar cómo gestionan las
citas hoy y cuántos plantones tienen. Valida discurso y precio sin arriesgar a
nadie.

---

## 4. Bloque 0 — Que el producto funcione fuera de tu ordenador

**~10-12 h · semana 1**

### 0.1 · Naming y dominio *(decisión + 1 h)*
"Appoint" es genérico y en inglés para un mercado de peluquerías españolas.
Elegir nombre comercial y comprar el dominio el mismo día: bloquea emails,
landing y credibilidad. **No hace falta renombrar el repo ni el código** — el
nombre comercial vive en la landing, el dominio y los emails. Coste: 10-15 €/año.

### 0.2 · Verificar el dominio en Resend *(2 h)*
**El bloqueo número uno de todo el proyecto.** Hoy Resend solo permite enviar
desde `onboarding@resend.dev` y solo a la dirección de la propia cuenta.
Traducción: con una peluquería dentro, ninguna de sus clientas recibiría
confirmación ni recordatorio.

Pasos (ya escritos en `DESPLIEGUE.md` §6): registros DNS SPF/DKIM en el dominio,
`EMAIL_FROM` a una dirección del dominio, `APP_BASE_URL` al dominio nuevo, y el
dominio apuntado en Vercel → Project Settings → Domains. Redeploy después.

**Trampa conocida** (`DESPLIEGUE.md` §2): si `APP_BASE_URL` se queda mal, la app
funciona en apariencia pero todos los enlaces de todos los emails y el QR de cada
negocio apuntan a la URL vieja. No se detecta navegando: solo abriendo un email
ya enviado, cuando ya es tarde.

### 0.3 · Resucitar los recordatorios de 24 h *(2-3 h)*
Cayeron al borrar `vercel.json`. **El recordatorio es el principal argumento de
venta**: es lo que reduce los plantones, que es el dolor por el que una
peluquería paga.

Solución gratuita: workflow de GitHub Actions con `schedule: cron` horario que
llame a `/api/cron/reminders` con la cabecera `Authorization: Bearer $CRON_SECRET`
(secreto en GitHub Secrets). Entra de sobra en los 2.000 min/mes gratuitos de
repos privados. GitHub puede retrasar disparos 10-15 min bajo carga: **irrelevante
aquí**, porque la ventana de envío es `[now+23h, now+25h)` y tiene dos horas de
holgura por diseño.

Alternativa de pago: Vercel Pro (~20 $/mes) devuelve el cron nativo. Va en el
Bloque 5, atado al primer cobro.

### 0.4 · Copias de seguridad *(2 h)*
Supabase Free no hace backups. Mismo mecanismo: `pg_dump` diario desde GitHub
Actions, guardado como artefacto (o subido a un bucket). Gratis y suficiente para
un piloto. Supabase Pro (~25 $/mes) trae backups diarios gestionados: Bloque 5.

**Segundo riesgo de Supabase Free:** los proyectos se pausan por inactividad
prolongada. Con un salón activo no debería ocurrir, pero conviene saberlo por si
hay un parón entre el piloto y el siguiente cliente.

### 0.5 · Prueba de fuego con un tercero *(2 h)*
Recorrer el checklist de `DESPLIEGUE.md` §5, pero **con el móvil y el email real
de otra persona**: reservar, confirmar, recibir el recordatorio, cancelar. Es la
única forma de cazar los fallos que la cuenta propia enmascara (sobre todo los de
Resend).

### ⚠️ Aviso sobre el plan Hobby de Vercel
El plan Hobby está restringido a **uso no comercial**. Un piloto gratuito es
defendible; el día que se cobre el primer euro se está fuera de sus términos, con
riesgo de suspensión de cuenta sin previo aviso y con clientes dentro. Por eso
Vercel Pro entra en el Bloque 5 atado al primer cobro, no antes.

---

## 5. Bloque 1 — Lo mínimo legal

**~12-14 h · semana 2, solapable con el Bloque 0**

No es burocracia opcional. Se tratan nombre, teléfono y email de las clientas de
otro negocio: en términos del RGPD, **la peluquería es la responsable del
tratamiento y tú eres el encargado**, y el artículo 28 exige contrato firmado
entre ambos. Sin él, la peluquería que te contrate está incumpliendo — y es
exactamente la objeción que pondrá cualquier dueña con asesoría.

Verificado el 2026-07-31: **cero coincidencias** de `privacidad|RGPD|consent|
privacy` en todo `src/`.

### 1.1 · Aviso de privacidad en el formulario de reserva *(4 h)*
Hoy se piden tres datos personales sin decir quién los trata, para qué, ni
cuánto tiempo se conservan. Hay que añadir el texto informativo y el enlace a la
política en el paso de datos del cliente (`StepCustomerData`).

Aprovechar para activar `Customer.marketingConsent` (`prisma/schema.prisma:226`),
que existe en el modelo pero **nunca se recoge ni se usa**: una casilla
desmarcada de "quiero recibir novedades" que le da a la peluquería una lista de
marketing legal. Es, de paso, un argumento de venta.

### 1.2 · Páginas legales *(4 h)*
Aviso legal, política de privacidad y política de cookies en `/legal/*`.

**Buena noticia sobre cookies:** hoy solo se usan cookies de sesión de Supabase,
estrictamente necesarias, que **no requieren banner de consentimiento**.
Recomendación firme: mantenerlo así. Si más adelante se quiere analítica, que sea
sin cookies (Vercel Web Analytics, Plausible) y se evita el banner para siempre —
un banner de cookies en la página de reserva empeora la conversión justo donde
más duele.

### 1.3 · Contrato de encargado de tratamiento *(3 h)*
Plantilla que se firma con cada negocio al darlo de alta. La AEPD publica
modelos. **Recomendación explícita: que lo revise un abogado o una asesoría** —
es barato comparado con el riesgo, y aquí no hay asesoramiento jurídico que
valga desde una sesión de desarrollo.

### Sobre la situación fiscal
No estar dado de alta **no impide** hacer el piloto gratuito ni firmar ese
contrato como persona física. Sí impide facturar. El alta de autónomo va en el
Bloque 5, atada al primer cobro, para no pagar cuotas mientras se valida.

---

## 6. Bloque 2 — La cara pública

**~15-20 h · semana 3**

### 2.1 · Landing en `/` *(12-15 h)*
Hoy la raíz es el boilerplate de Next.js. Una sola página, sin blog ni secciones
de relleno, que responda en 10 segundos: qué es, para quién, qué problema
resuelve, y cómo se prueba.

Estructura recomendada:
1. **Titular por el dolor, no por la funcionalidad.** No "software de gestión de
   citas", sino algo del estilo "Que no te dejen plantada. Tus clientas reservan
   solas y reciben recordatorio el día antes".
2. **Demo real, no capturas.** El negocio demo ("Salón Aura") ya existe en
   producción: enlazarlo como escaparate vivo y dejar que cualquiera reserve una
   cita de prueba. Vale mil veces más que un vídeo.
3. **Las tres funcionalidades que se venden solas:** QR en el mostrador sin que
   la clienta se instale nada, recordatorio automático 24 h antes, agenda en el
   móvil de la dueña.
4. **Cómo se ve en su salón:** el sistema de temas es el diferenciador del
   producto — enseñar los 3 presets aplicados.
5. **Contacto:** WhatsApp y teléfono. Nada de formularios largos, y **sin precios
   publicados todavía** (ver §11).

Este es el bloque donde aplica la skill `frontend-design`, y donde tiene sentido
invertir esfuerzo de diseño: es la primera impresión y compite con el argumento
"esto lo puede hacer cualquiera".

### 2.2 · Material de venta *(4 h)*
- QR de muestra impreso y plastificado, con el diseño real de un salón ficticio.
- La demo cargada en el móvil, probada en 4G y no solo en tu wifi.
- Una hoja A4: qué es, qué cuesta (rango), y qué ofreces en el piloto.

---

## 7. Bloque 3 — Conseguir la primera peluquería

**Continuo, arranca ya en la semana 1**

Es el bloque más importante y el único que no se resuelve programando. Con 15-30
h/semana, dedicar **al menos 5 h semanales a esto desde el primer día**, en
paralelo al desarrollo.

### 3.1 · Lista de objetivos
30 peluquerías de la zona en una hoja de cálculo: nombre, dirección, si tienen
Instagram activo, si ya usan algún sistema de reservas online (mirar su web o su
bio de Instagram), y horas valle para visitar (media mañana entre semana; nunca
sábado).

**Perfil ideal para el primer cliente:** salón de 1-3 profesionales, con
Instagram activo pero **sin** sistema de reservas online, que hoy coge las citas
por WhatsApp y libreta. Los que ya tienen Booksy o similar son la conversación
más difícil y no valen como primer cliente.

### 3.2 · Visitas de descubrimiento (semanas 1-2, en paralelo al Bloque 0)
**No se vende nada todavía.** Se pregunta, y son 5 minutos:
- ¿Cómo cogéis las citas ahora mismo?
- ¿Cuántas clientas te dejan plantada a la semana? ¿Qué te cuesta cada plantón?
- ¿Cuánto tiempo al día se te va contestando WhatsApps de citas fuera de horario?
- ¿Habéis probado algo? ¿Por qué lo dejasteis?

Objetivo: 10 conversaciones. De ahí salen el titular de la landing, el precio, y
las dos o tres funcionalidades que faltan de verdad (que casi nunca son las que
uno cree).

### 3.3 · La oferta del piloto (semanas 3-4)
- **3 meses gratis**, sin compromiso ni tarjeta.
- **Montaje incluido**: tú les das de alta, les cargas servicios, precios,
  empleados y horarios, y les llevas el QR impreso. Ellas no configuran nada.
  Esto es lo que hace que digan que sí.
- A cambio: feedback honesto, un testimonio si les gusta, y permiso para
  nombrarles como referencia.
- **Fecha de fin explícita** desde el principio: "a los 3 meses hablamos de
  precio". Un piloto sin fecha se convierte en un cliente gratis para siempre.

### 3.4 · Meta del bloque
**1 salón usándolo con citas reales.** No tres. Uno bien atendido enseña más que
tres a medias, y el Bloque 4 va a consumir tiempo.

---

## 8. Bloque 4 — Iterar con feedback real

**2-4 semanas, duración impredecible por definición**

Aquí es donde aparecen los agujeros de verdad. Reservar capacidad para esto es la
decisión más importante de todo el roadmap: **no encadenar el Bloque 5 sin haber
dejado hueco al 4**.

Cosas que suelen aparecer en este punto en negocios de este tipo (hipótesis, no
certezas — se confirman con el piloto):
- "¿Puedo meter las clientas que ya tengo?" → importación de clientes.
- Horario partido, cierres por vacaciones, festivos locales.
- "Mis clientas mayores no usan el email" → el recordatorio por WhatsApp aparece
  antes o después. Está fuera de alcance por decisión de la spec, pero la
  arquitectura de emails se diseñó para admitir otros canales.
- Servicios con duraciones variables (tinte + corte), o dos profesionales para un
  mismo servicio.
- Que la dueña quiera meter citas a mano mientras habla por teléfono, y que eso
  tenga que ser rapidísimo.

**Regla de decisión:** solo se construye lo que el piloto **usa y bloquea**, no lo
que pide en abstracto. La diferencia se ve preguntando "¿esto te ha pasado esta
semana?".

---

## 9. Bloque 5 — Convertir a pago

**Gate: 1-2 salones usándolo ≥ 1 mes con citas reales, y la dueña dice que lo
echaría de menos si se lo quitas.**

Sin ese gate, no se entra en este bloque. Cobrar antes de que exista uso real es
la forma más rápida de perder el único cliente.

Orden de los pasos:
1. **Sesión de pricing** (ver §11). Es una conversación aparte, con datos.
2. **Alta de autónomo.** Es el momento: no antes, para no pagar cuotas durante la
   validación; no después, porque sin alta no se puede emitir factura.
3. **Subir la infraestructura**, atado al primer cobro:
   - Vercel Pro (~20 $/mes) — obligatorio por términos de uso comercial, y
     recupera el cron nativo.
   - Supabase Pro (~25 $/mes) — backups gestionados y sin pausas por inactividad.
   - Resend: el plan gratuito (3.000 emails/mes) aguanta bastantes salones.
     Revisar el consumo cuando haya varios.
4. **Cobro manual primero**: transferencia o domiciliación, factura emitida a
   mano. Con menos de 10 clientes, montar Stripe es tirar semanas. **Stripe entra
   solo cuando el cobro manual duela de verdad**, y eso se nota — normalmente a
   partir de 8-10 clientes.

---

## 10. Bloque 6 — Escalar (solo si el Bloque 5 funciona)

Nada de aquí se toca antes. Orden probable, a revisar con datos reales:
1. **Autoservicio de alta** (registro sin pasar por `/admin`), cuando dar de alta
   a mano sea el cuello de botella.
2. **Stripe Billing**: suscripción, periodo de prueba, portal del cliente,
   suspensión por impago.
3. **PWA instalable para la dueña**: icono en la pantalla de inicio, sin tiendas
   ni revisiones. 1-2 semanas.
4. **Rol `STAFF`**: ya está declarado en el enum sin UI ni autorización. Sale
   cuando un salón con varios profesionales pida que cada uno vea su agenda.
5. Lista de espera ("avísame si se libera"), SMS/WhatsApp, subdominios por
   negocio — todo ya marcado como fase 2+ en la spec.

---

## 11. Pricing: cuándo pensarlo

Hay **dos momentos distintos**, y confundirlos es un error caro:

**Momento 1 — hipótesis barata (Bloque 3, antes de las visitas).**
En la primera visita te van a preguntar "¿y esto cuánto vale?". Hay que tener una
respuesta, no un silencio. Basta con un rango y una postura: *"va a estar entre X
y Y al mes, y contigo el piloto es gratis 3 meses"*. No se publica en la landing.

**Momento 2 — decisión real (Bloque 5, con datos de uso).**
Cuando haya 1-2 salones usándolo un mes, se sabe: cuántas citas gestionan, cuántos
plantones se han evitado, cuánto tiempo ahorran. Con eso el precio se ancla en
**valor** ("un plantón te cuesta 30 €; esto te evita cuatro al mes") y no en
coste. Esa es la sesión de pricing a hacer juntos.

**Qué llevar a esa sesión:**
- Precios reales y actualizados de los competidores en España (Booksy, Treatwell,
  Koibox, Timify, Bookitit y similares) — **verificarlos en el momento**, cambian.
- Coste real por cliente (infraestructura + tu tiempo de soporte).
- Datos de uso del piloto.
- Decisiones a tomar: precio único vs. tramos por número de profesionales; mensual
  vs. anual con descuento; si hay plan gratuito y qué limita.

**Postura de partida a discutir:** precio único, mensual, sin permanencia, y
deliberadamente por debajo de los grandes al principio — no por competir en
precio, sino porque un negocio local sin referencias no puede pedir lo mismo que
una marca conocida. Se sube con los clientes 5 y siguientes, respetando el precio
a los primeros de por vida (y diciéndoselo: es un argumento de cierre potente).

---

## 12. App móvil: por qué no, y cuándo reconsiderarlo

**Decisión tomada: ninguna app por ahora.** Motivos:

- **Para la clienta final sería un tiro en el pie.** El valor entero del producto
  es "escanea el QR y reserva en 20 segundos, sin instalar nada". Pedirle a
  alguien que se instale una app para pedir hora en la peluquería mata la
  conversión. Ninguna app.
- **Para la dueña**, `/panel` ya es responsive y funciona en el móvil. Una app
  nativa cuesta semanas de trabajo, 25 $ de alta en Google Play, 99 $/año de Apple
  Developer, y revisiones de Apple en cada versión. No la ha pedido nadie porque
  todavía no hay nadie.

**Cuándo reconsiderarlo:** si varios clientes de pago piden específicamente
notificaciones push en el móvil ("quiero enterarme al momento de una reserva
nueva"). La respuesta correcta entonces es una **PWA instalable** (Bloque 6.3),
no una app nativa: cubre el 90% del valor por el 10% del coste. La app nativa
solo si la PWA se queda corta con clientes pagando, que es un problema que
merece la pena tener.

---

## 13. Puertas de decisión (no avanzar sin cumplirlas)

| Para pasar a | Hace falta |
|---|---|
| Bloque 2 (landing) | Un email real llega a un tercero desde el dominio propio, y el recordatorio de 24 h se dispara solo. |
| Bloque 3 (captación) | Páginas legales publicadas y aviso de privacidad en el formulario. Salir a vender sin esto es indefendible. |
| Bloque 4 (iterar) | 1 salón con al menos 10 citas reales gestionadas. |
| Bloque 5 (cobrar) | 1-2 salones con ≥ 1 mes de uso y respuesta afirmativa a "¿lo echarías de menos?". |
| Bloque 6 (escalar) | 3+ clientes pagando y el trabajo manual empezando a doler. |

---

## 14. Riesgos principales

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| No conseguir ninguna peluquería (desde cero, sin contactos) | **Alta** | Es el riesgo dominante. Visitas de descubrimiento desde la semana 1, no al final; 30 objetivos en lista, no 5; oferta con el montaje incluido para eliminar la fricción de "no tengo tiempo de configurarlo". |
| El piloto lo usa una semana y lo abandona | Media | Montarlo tú, pasar por el salón la primera semana, y mirar los datos de uso en vez de fiarte de "muy bien, muy bien". |
| Suspensión de cuenta de Vercel por uso comercial en Hobby | Baja-media | Pasar a Pro el día del primer cobro. No estirarlo. |
| Pérdida de datos sin backup | Baja / impacto letal | Bloque 0.4 antes de meter a nadie. |
| Reclamación de protección de datos | Baja / impacto alto | Bloque 1 completo antes de captar. Contrato de encargado revisado por un profesional. |
| Sobre-construir antes de validar | **Alta** (es la tentación natural aquí) | Las puertas de la §13. Nada del Bloque 6 antes del 5. |
| Que el email no sea el canal correcto (clientas mayores) | Media | Se detecta en el Bloque 4. La arquitectura de envío ya admite otros canales. |

---

## 15. Calendario orientativo (15-30 h/semana)

| Semana | Desarrollo | Comercial |
|---|---|---|
| 1 | Bloque 0: dominio, Resend, cron, backups, prueba con un tercero | Lista de 30 salones. Primeras 3 visitas de descubrimiento |
| 2 | Bloque 1: legal | 4-7 visitas de descubrimiento |
| 3 | Bloque 2: landing y material | Ajustar discurso con lo aprendido |
| 4 | Retoques de la landing | Ofrecer el piloto a los 3 mejores contactos |
| 5-6 | Montaje del salón piloto | Acompañamiento presencial |
| 7-10 | Bloque 4: iterar con feedback | Segundo salón si el primero va bien |
| 11-12 | — | Bloque 5: pricing, alta de autónomo, planes de pago |

**Este calendario asume que el desarrollo de producto está terminado.** Si al
abrir este documento aún quedan cosas de frontend, backend o eficiencia, todo se
desplaza — salvo los tres puntos del aviso del principio, que no deberían
esperar.

---

## 16. Lo que NO se hace (anti-alcance)

Escrito para poder decir que no cuando aparezca la tentación:

- Stripe y facturación automática — Bloque 6, no antes.
- App nativa en tiendas — solo si una PWA con clientes de pago se queda corta.
- Rol `STAFF`, multi-idioma, subdominios por negocio — fase 2+ según la spec.
- Blog, SEO de contenidos, campañas de pago — con 0 clientes, el canal es la
  puerta de la peluquería, no Google.
- Rediseñar el panel entero antes de que un cliente real lo haya usado.
- Nuevos presets de tema "porque quedarían bien". Los 3 actuales sobran para
  vender; el cuarto lo pedirá un cliente o no existirá.

---

## 17. Decisiones pendientes

1. **¿El bloque legal va antes o después del piloto?** Recomendación firme:
   antes. Pendiente de confirmación del usuario — fue la pregunta que quedó
   abierta al guardar este documento.
2. **Nombre comercial y dominio** — sin decidir. Bloquea el Bloque 0 entero.
3. **Zona geográfica de captación** — no discutida; se asumió "local, en persona".
4. **Quién revisa el contrato de encargado de tratamiento** (abogado, asesoría o
   plantilla de la AEPD asumiendo el riesgo).
5. **Rango de precio para la hipótesis del Momento 1** — decidir antes de la
   primera visita.

---

## 18. Deuda de producto que sí afecta a vender

De la lista completa de minors de `CONTINUAR.md`, estos son los que un cliente
real nota (el resto son internos y pueden esperar):

- **`/` es el boilerplate de Next.js** — se resuelve en el Bloque 2.
- **La vista de semana del panel está simplificada** (misma columna por empleado,
  sin agrupar por franjas). Es lo primero que mira una dueña acostumbrada a una
  agenda de papel. Candidato número uno a pulir antes del piloto.
- **Al volver de un error en la hoja de reserva se pierden los datos tecleados** —
  fricción justo en el paso donde se convierte. Barato de arreglar, alto impacto.
- **Una ausencia que solapa citas ya confirmadas no avisa ni cancela nada** — la
  dueña se marcha de vacaciones y las citas siguen ahí. Es el fallo que más
  confianza destruye de todos los pendientes.
- **El email de reenvío de invitación es idéntico al del alta inicial** —
  cosmético, pero se ve en el onboarding de cada cliente nuevo.
- **Sin adjunto `.ics` en el email de "cita aprobada"** — decisión consciente;
  revisar solo si algún cliente lo pide.
