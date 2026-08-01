// Esqueleto de carga para la página pública del negocio.
//
// App Router muestra este archivo (vía Suspense automático) mientras
// `page.tsx` resuelve sus consultas al servidor, en vez de dejar la pantalla
// anterior congelada. Se renderiza ANTES de saber qué negocio ni qué tema le
// corresponde (la búsqueda por slug todavía no ha terminado), así que no
// puede leer `getThemeCssVariables()`: usa grises neutros discretos en vez de
// los colores de marca del negocio. La estructura (cabecera, galería,
// servicios, equipo) sí seguimos la de `page.tsx` para que el cambio al
// contenido real no salte de layout.
export default function BusinessPageLoading() {
  return (
    <div className="min-h-screen animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">Cargando la página del negocio…</span>

      <header className="mx-auto max-w-2xl px-6 pb-8 pt-12 text-center sm:pt-16">
        <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-black/10" />
        <div className="mx-auto h-8 w-48 rounded-md bg-black/10 sm:h-9 sm:w-64" />
        <div className="mx-auto mt-3 h-4 w-40 rounded-md bg-black/5" />
      </header>

      <div className="flex gap-3 overflow-hidden px-6 pb-2">
        <div className="h-52 w-72 shrink-0 rounded-lg bg-black/10 sm:h-60 sm:w-80" />
        <div className="h-52 w-72 shrink-0 rounded-lg bg-black/5 sm:h-60 sm:w-80" />
      </div>

      <main className="mx-auto max-w-2xl px-6 pb-16">
        <section className="mb-10 mt-10">
          <div className="mb-4 h-6 w-28 rounded-md bg-black/10" />
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg bg-black/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="h-5 w-2/3 rounded-md bg-black/10" />
                    <div className="mt-2 h-4 w-1/2 rounded-md bg-black/10" />
                    <div className="mt-3 h-6 w-24 rounded-md bg-black/10" />
                  </div>
                  <div className="h-9 w-24 shrink-0 rounded-md bg-black/10" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 h-6 w-20 rounded-md bg-black/10" />
          <div className="flex flex-wrap gap-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="h-16 w-16 rounded-full bg-black/10" />
                <div className="h-3 w-12 rounded-md bg-black/10" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
