interface LoginCardProps {
  title: string;
  description: string;
  // Firma exacta de signInAction / signInAdminAction. Un Server Action puede
  // pasarse como prop entre Server Components: viaja como referencia, no se
  // serializa su cuerpo.
  action: (formData: FormData) => Promise<void>;
  error?: string;
}

// Tarjeta de acceso compartida por /panel/login y /admin/login. SOLO
// presentación: cada zona conserva su propio Server Action, porque /panel y
// /admin son superficies de autenticación distintas, con tablas de roles y
// guards separados a propósito (ver CLAUDE.md).
export function LoginCard({ title, description, action, error }: LoginCardProps) {
  // El error llega por un `redirect(...?error=)`, es decir en la propia carga
  // de página: el `role="alert"` ya existe cuando el árbol de accesibilidad se
  // construye, así que los lectores de pantalla no lo anuncian por sí solo
  // (las regiones "live" anuncian mutaciones posteriores, no su aparición
  // inicial). `aria-describedby` + `aria-invalid` en los campos sí se leen al
  // entrar en ellos con tabulación, que es cuando de verdad hace falta el
  // motivo del error.
  const errorFieldProps = error
    ? { 'aria-describedby': 'login-error', 'aria-invalid': true as const }
    : {};

  return (
    <main className="flex min-h-screen items-center-safe justify-center px-4 py-8">
      <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm sm:w-96">
        <div className="p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{description}</p>
        </div>

        <form action={action}>
          <div className="grid gap-4 p-6 pt-0">
            {error && (
              <p id="login-error" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="grid gap-2">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                {...errorFieldProps}
                className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:border-slate-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                {...errorFieldProps}
                className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:border-slate-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              />
            </div>
          </div>

          <div className="p-6 pt-0">
            <button
              type="submit"
              className="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              Entrar
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
