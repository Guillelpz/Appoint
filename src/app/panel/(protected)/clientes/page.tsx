import Link from 'next/link';
import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { listCustomersForBusiness } from '@/lib/panel/customers-service';
import { parsePageParam } from '@/lib/pagination';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { businessId } = await requirePanelSession();
  const { page } = await searchParams;
  const currentPage = parsePageParam(page);
  const { items: customers, hasNextPage, hasPreviousPage } = await listCustomersForBusiness(prisma, businessId, currentPage);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Clientes</h1>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Teléfono</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Citas</th>
              <th className="px-4 py-2">Última cita</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <Link href={`/panel/clientes/${customer.id}`} className="font-medium text-slate-900 underline">
                    {customer.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{customer.phone ?? '—'}</td>
                <td className="px-4 py-2">{customer.email ?? '—'}</td>
                <td className="px-4 py-2">{customer.appointmentCount}</td>
                <td className="px-4 py-2">{customer.lastAppointmentStart ? formatAppointmentDateTime(customer.lastAppointmentStart) : '—'}</td>
                <td className="px-4 py-2">
                  {customer.blacklisted ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Bloqueado</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Todavía no hay clientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        {hasPreviousPage ? (
          <Link href={`/panel/clientes?page=${currentPage - 1}`} className="text-slate-600 underline">
            Anterior
          </Link>
        ) : (
          <span className="text-slate-300">Anterior</span>
        )}
        <span className="text-slate-500">Página {currentPage}</span>
        {hasNextPage ? (
          <Link href={`/panel/clientes?page=${currentPage + 1}`} className="text-slate-600 underline">
            Siguiente
          </Link>
        ) : (
          <span className="text-slate-300">Siguiente</span>
        )}
      </div>
    </div>
  );
}
