import Link from 'next/link';
import { requireAdminSession } from '@/lib/admin/session';
import { prisma } from '@/lib/db';
import { listPlatformBusinesses, getOwnerInvitationCompletionMap } from '@/lib/admin/platform-business-service';
import { setBusinessActiveAction, resendOwnerInvitationAction } from './actions';
import { CreateBusinessForm } from './CreateBusinessForm';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date
  );
}

const AVISO_MESSAGES: Record<string, string> = {
  'accion-no-aplicada': 'Esa acción ya no se puede aplicar: el negocio cambió mientras tanto. La lista se ha actualizado.',
  'invitacion-reenviada': 'Invitación reenviada al dueño por email.',
  'invitacion-ya-completada': 'Ese dueño ya había completado su alta: no hacía falta reenviar la invitación.',
  'invitacion-fallida': 'No se pudo reenviar la invitación al dueño. Inténtalo de nuevo; si persiste, revisa su usuario en Supabase.',
  'negocio-suspendido': 'Este negocio está suspendido: reactívalo antes de reenviar la invitación a su dueño.',
};

export default async function AdminNegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; page?: string }>;
}) {
  await requireAdminSession();
  const { aviso, page } = await searchParams;
  const rawPage = Number(page);
  const currentPage = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage) || 1) : 1;
  const { items: businesses, hasNextPage, hasPreviousPage } = await listPlatformBusinesses(prisma, currentPage);
  const completionMap = await getOwnerInvitationCompletionMap(
    prisma,
    businesses.map((b) => b.id)
  );

  const avisoMessage = aviso ? AVISO_MESSAGES[aviso] : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Negocios</h1>

      {avisoMessage && (
        <div className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{avisoMessage}</span>
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
                  <div className="flex items-center gap-3">
                    <form action={setBusinessActiveAction.bind(null, business.id, !business.active)}>
                      <button type="submit" className="text-xs text-slate-500 underline">
                        {business.active ? 'Suspender' : 'Activar'}
                      </button>
                    </form>
                    {completionMap.get(business.id) === false && business.active && (
                      <form action={resendOwnerInvitationAction.bind(null, business.id)}>
                        <button type="submit" className="text-xs text-slate-500 underline">
                          Reenviar invitación
                        </button>
                      </form>
                    )}
                  </div>
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
