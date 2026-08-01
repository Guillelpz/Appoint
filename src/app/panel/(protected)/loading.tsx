// Esqueleto de carga para las páginas del panel (Agenda, Servicios, Equipo,
// Clientes, Ajustes). Next.js envuelve automáticamente `page.tsx` (y sus
// segmentos hijos) en un <Suspense> con este componente como fallback, así
// que el layout (cabecera con navegación) ya está visible mientras esto se
// muestra: solo sustituye el contenido de `<main>`.
export default function PanelLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-6 w-28 rounded bg-slate-200" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 rounded bg-slate-200" />
          <div className="h-8 w-20 rounded bg-slate-200" />
          <div className="h-8 w-24 rounded bg-slate-200" />
        </div>
      </div>

      <div className="h-24 rounded-lg border border-slate-200 bg-white p-4">
        <div className="h-4 w-1/3 rounded bg-slate-200" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, cardIndex) => (
          <div key={cardIndex} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-slate-200" />
              <div className="h-4 w-24 rounded bg-slate-200" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <div key={rowIndex} className="h-12 rounded border border-slate-100 bg-slate-50" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
