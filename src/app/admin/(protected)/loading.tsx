// Esqueleto de carga para las páginas de super-administración (Dashboard,
// Negocios). Next.js envuelve automáticamente `page.tsx` en un <Suspense>
// con este componente como fallback: el layout (cabecera con navegación) ya
// está visible mientras esto se muestra, solo sustituye el contenido de
// `<main>`. El diseño combina un bloque de tarjetas (como el dashboard) con
// uno de tabla (como Negocios) para encajar en ambas rutas del segmento.
export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-6 w-48 rounded bg-slate-200" />

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, cardIndex) => (
          <div key={cardIndex} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 h-3 w-24 rounded bg-slate-200" />
            <div className="h-8 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 p-3">
          <div className="h-3 w-full max-w-md rounded bg-slate-200" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 4 }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex items-center gap-4 p-3">
              <div className="h-4 w-32 rounded bg-slate-200" />
              <div className="h-4 w-20 rounded bg-slate-200" />
              <div className="h-4 w-16 rounded bg-slate-200" />
              <div className="h-4 w-24 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
