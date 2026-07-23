import Link from 'next/link';
import { requireAdminSession } from '@/lib/admin/session';
import { prisma } from '@/lib/db';
import { listPlatformBusinesses } from '@/lib/admin/platform-business-service';
import { setBusinessActiveAction } from './actions';
import { CreateBusinessForm } from './CreateBusinessForm';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date
  );
}

export default async function AdminNegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; page?: string }>;
}) {
  await requireAdminSession();
  const { aviso, page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);
  const { items: businesses, hasNextPage, hasPreviousPage } = await listPlatformBusinesses(prisma, currentPage);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Negocios</h1>

      {aviso === 'accion-no-aplicada' && (
        <div className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>Esa acción ya no se puede aplicar: el negocio cambió mientras tanto. La lista se ha actualizado.</span>
          <Link href="/admin/negocios" className="font-medium underline shrink-0">
            Cerrar
          </Link>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Fecha de alta</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => (
              <tr key={business.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{business.name}</td>
                <td className="px-4 py-2 text-slate-500">{business.slug}</td>
                <td className="px-4 py-2">{business.active ? 'Activo' : 'Suspendido'}</td>
                <td className="px-4 py-2 text-slate-500">{formatDate(business.createdAt)}</td>
                <td className="px-4 py-2">
                  <form action={setBusinessActiveAction.bind(null, business.id, !business.active)}>
                    <button type="submit" className="text-xs text-slate-500 underline">
                      {business.active ? 'Suspender' : 'Activar'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {businesses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Todavía no hay negocios de alta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        {hasPreviousPage ? (
          <Link href={`/admin/negocios?page=${currentPage - 1}`} className="text-slate-600 underline">
            Anterior
          </Link>
        ) : (
          <span className="text-slate-300">Anterior</span>
        )}
        <span className="text-slate-500">Página {currentPage}</span>
        {hasNextPage ? (
          <Link href={`/admin/negocios?page=${currentPage + 1}`} className="text-slate-600 underline">
            Siguiente
          </Link>
        ) : (
          <span className="text-slate-300">Siguiente</span>
        )}
      </div>

      <CreateBusinessForm />
    </div>
  );
}
