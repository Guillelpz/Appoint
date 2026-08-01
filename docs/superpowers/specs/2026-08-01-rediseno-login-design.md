# Rediseño de las páginas de login — diseño

_Fecha: 2026-08-01. Estado: aprobado por el usuario._

## Problema

Las dos pantallas de acceso al back-office (`/panel/login` para dueños de negocio y
`/admin/login` para el super-admin) son funcionales pero visualmente crudas: un
formulario suelto sobre fondo blanco, sin contenedor ni jerarquía.

Además están duplicadas. `/panel/login` nació en la Fase 5 (`516dc83`, 2026-07-18) y
`/admin/login` se creó tres días después copiándola (`a629eac`, 2026-07-21). De sus 44
líneas solo difieren cinco: el nombre del import, el nombre de la función, el `<h1>`, el
`<p>` y la referencia al Server Action.

## Alcance

Rediseño **puramente visual** de ambas páginas, más la extracción del componente
compartido que elimina la duplicación. No cambia la autenticación, ni los Server Actions,
ni el modelo de datos, ni las rutas.

Fuera de alcance explícito:

- Unificar los Server Actions de `/panel` y `/admin` (ver "Qué no se comparte").
- Introducir shadcn/ui o cualquier dependencia nueva.
- Los dos hallazgos globales preexistentes de la sección "Hallazgos anotados, no
  corregidos".

## Decisiones tomadas con el usuario

1. **Tailwind puro, sin dependencias nuevas.** El componente de referencia que motivó el
   rediseño venía de shadcn/ui, que no está instalado: no hay `components.json`, ni
   `@radix-ui/*`, ni `class-variance-authority`, ni `clsx`/`tailwind-merge`, ni
   `src/lib/utils.ts` con el `cn()`. Los tokens que usa (`bg-card`, `text-muted-foreground`,
   `border-input`, `ring-ring`, `bg-primary`) tampoco existen en `src/app/globals.css`, que
   solo define `--background`/`--foreground`. Se replica el mismo resultado visual con
   clases Tailwind directas sobre la paleta `slate` que ya usa el resto del back-office.
2. **Las dos páginas, compartiendo componente de presentación.**
3. **Sin botones de OAuth ni enlace de registro.** El proyecto no tiene OAuth, y los dueños
   no se registran: entran por invitación del super-admin (`/panel/invitacion`). Botones
   que no hacen nada en una pantalla de acceso real son ruido.

## Arquitectura

Un componente de presentación nuevo, `src/components/LoginCard.tsx`, Server Component (no
necesita estado propio ni manejadores de eventos).

```
LoginCard({ title, description, action, error })
  └── <form action={action}> con los dos campos y un <button type="submit">
```

Cada página queda reducida a leer sus `searchParams` y renderizar el `LoginCard` con su
título, su descripción y su Server Action. Desaparecen ~39 líneas duplicadas; solo se
repite lo que legítimamente difiere entre las dos zonas.

### Interfaz

```ts
interface LoginCardProps {
  title: string;
  description: string;
  // Firma exacta de signInAction / signInAdminAction.
  action: (formData: FormData) => Promise<void>;
  error?: string;
}
```

Pasar un Server Action como prop de un Server Component a otro es válido en el App Router:
la acción viaja como referencia, no se serializa su cuerpo.

### Ubicación

`src/components/LoginCard.tsx`. **No** en
`src/components/ui/`: esa carpeta es la convención de shadcn para primitivas generadas por
su CLI, y crearla señalizaría una estructura que este proyecto no tiene.

### Qué no se comparte (y por qué)

Los Server Actions `signInAction` y `signInAdminAction` también son casi idénticos —
difieren solo en el nombre y en las rutas de `redirect()` — y **se mantienen separados a
propósito**. `CLAUDE.md` establece que `/admin` y `/panel` son zonas distintas, con tablas
de roles distintas (`PlatformAdmin` vs `Membership`) y guards distintos
(`requireAdminSession` vs `requirePanelSession`). Fusionar la capa de autenticación
acoplaría dos superficies de seguridad que interesa mantener independientes. Se comparte la
presentación y nada más.

## Contrato con el backend

Es lo que hace que el rediseño sea seguro. Verificado leyendo los actions y los e2e, no de
memoria:

| Elemento | Valor exigido | Quién lo exige |
|---|---|---|
| `name` del campo de email | `email` | `formData.get('email')` en ambos actions |
| `name` del campo de contraseña | `password` | `formData.get('password')` en ambos actions |
| Etiqueta del email | `Email`, con `htmlFor`/`id` explícitos | `getByLabel('Email')` en `panel-approval.spec.ts:69` y `admin-flow.spec.ts:30` |
| Etiqueta de la contraseña | `Contraseña`, con `htmlFor`/`id` explícitos | `getByLabel('Contraseña')` en `panel-approval.spec.ts:70` y `admin-flow.spec.ts:31` |
| Texto del botón | `Entrar` | `getByRole('button', { name: 'Entrar' })` en ambos specs |
| Tipo del prop `action` | `(formData: FormData) => Promise<void>` | firma de ambos Server Actions |
| Origen del error | `searchParams.error`, tras el `redirect(...?error=)` del action | `login/actions.ts:14` en ambas zonas |

Las etiquetas actuales envuelven al input (`<label>Email<input/></label>`), que es la otra
forma válida de asociarlos. El rediseño pasa a `htmlFor`/`id` explícitos porque separa
visualmente la etiqueta del campo; `getByLabel` sigue funcionando igual con ambas formas.

**Corrección posterior (2026-08-01).** La primera versión de esta spec daba por hecho un
componente `SubmitButton` con estado "Entrando…", porque se redactó leyendo las páginas de
login desde el checkout de la rama `perf/optimizacion-latencia`, que contiene un refactor
de ese componente **sin commitear**. En `main` esas páginas usan un `<button
type="submit">` plano y `src/components/SubmitButton.tsx` no existe. Por decisión del
usuario, este rediseño **no** introduce ese componente: duplicaría un archivo que la otra
rama ya aporta y mezclaría dos trabajos que se decidió mantener separados. Consecuencia
aceptada: el login no gana estado de carga, que en `main` tampoco tenía.

## Aspecto visual

Traducción del layout de referencia a Tailwind puro, en español y con la paleta actual:

- Contenedor centrado a pantalla completa, `px-4`. Tarjeta `w-full sm:w-96`.
- Tarjeta: `rounded-xl border border-slate-200 bg-white shadow-sm`.
- Cabecera (`p-6`): `<h1>` en `text-2xl font-semibold tracking-tight` + descripción en
  `text-sm text-slate-500`.
- Cuerpo (`p-6 pt-0`, `grid gap-4`): los dos campos, etiqueta encima del input.
- Inputs: `h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm`.
- Pie (`p-6 pt-0`): `<button type="submit">` a ancho completo, `bg-slate-900 text-white`.
- Aviso de error: se conserva el bloque `rounded bg-red-50 text-red-700` actual, dentro de
  la tarjeta, con `role="alert"`. El error llega por un `redirect(...?error=)`, es decir en
  la propia carga de página: el `role="alert"` ya existe cuando se construye el árbol de
  accesibilidad, así que la mayoría de lectores de pantalla no lo anuncian solo por eso (las
  regiones "live" anuncian mutaciones posteriores a su aparición, no la aparición inicial).
  Para que el error sí se oiga, el `<p>` del aviso lleva `id="login-error"` y, mientras hay
  error, ambos inputs añaden `aria-describedby="login-error"` y `aria-invalid="true"`: al
  tabular a cualquiera de los dos campos, el lector de pantalla lee el motivo del error.
  Ambos atributos están ausentes (no vacíos) cuando no hay error.

**Accesibilidad y estados:**

- Focus visible en inputs y botón: `focus-visible:ring-2 focus-visible:ring-slate-900
  focus-visible:ring-offset-2`. El componente de referencia lo traía vía tokens de shadcn y
  no se pierde en la traducción.
- `autoComplete="email"` y `autoComplete="current-password"` en los campos, para los
  gestores de contraseñas.
- **Sin estado de carga en el botón.** `main` no lo tiene y esta rama no lo añade (ver la
  corrección más arriba). Queda como minor conocido: al pulsar "Entrar" no hay feedback
  visual mientras el Server Action está en vuelo.

**Mobile-first**, según la regla del proyecto: en móvil la tarjeta ocupa el ancho
disponible con márgenes; a partir de `sm` se fija a 384 px y se centra.

**Sin theming de negocio, a propósito.** La regla de temas de `CLAUDE.md` aplica a las
páginas públicas (`src/app/(public)/**`), que leen variables CSS del negocio. `/panel` y
`/admin` son back-office y mantienen la paleta `slate` neutra que ya usan todas sus
pantallas.

## Verificación

- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
- `pnpm exec playwright test` (los 3 specs, en solitario)

Los e2e son la prueba de fondo: si `panel-approval.spec.ts` y `admin-flow.spec.ts` pasan
**sin modificarlos**, el rediseño es visual y el contrato con el backend está intacto.

No se añaden tests unitarios: es un componente de presentación sin lógica, y la regla de
TDD del proyecto aplica a lógica de negocio (motor de huecos, anti-fraude, estados de
cita).

## Hallazgos anotados, no corregidos

Encontrados al verificar el contrato. Los tres primeros son preexistentes y de alcance
global; corregirlos dentro de un rediseño de login sería ampliar el alcance sin pedirlo.

1. **`<html lang="en">` con la UI en español** (`src/app/layout.tsx:26`). Afecta a la
   pronunciación en lectores de pantalla y a la separación silábica. Arreglo de una línea,
   pero toca todas las páginas.
2. **`body { font-family: Arial }` anula las fuentes Geist** (`src/app/globals.css:25`),
   que el root layout carga y expone como `--font-geist-sans`/`--font-geist-mono`
   (`layout.tsx:5-13`). La aplicación entera renderiza en Arial. Cambiarlo alteraría todas
   las pantallas.
3. **El texto de `?error=` se renderiza tal cual viene de la URL.** React lo escapa, así
   que no hay XSS, pero permite fabricar un enlace a `/panel/login?error=<texto
   arbitrario>` que muestre un mensaje falso con aspecto oficial. Es comportamiento actual
   y el rediseño lo preserva; acotarlo exigiría mapear códigos de error en vez de pasar el
   mensaje por la URL, lo que toca los Server Actions.
4. **`/panel/invitacion` sigue con el formulario suelto de siempre**, sin el `LoginCard` ni
   el resto de este rediseño. Es la siguiente pantalla obvia para esta misma línea de
   trabajo, pero cae fuera de "las dos páginas de login" que pidió el usuario.

## Rama

Rama propia partiendo de `main`. La rama actual (`perf/optimizacion-latencia`) tiene ~35
archivos de trabajo en curso sin relación con esto.
