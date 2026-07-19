import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { getCustomerDetail } from '@/lib/panel/customers-service';
import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import { addToBlacklistAction, removeFromBlacklistAction } from '../actions';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No presentado',
};

const AVISO_MESSAGES: Record<string, string> = {
  'accion-no-aplicada': 'Esa acción ya no se puede aplicar: el cliente cambió mientras tanto. La página se ha actualizado.',
  'sin-contacto': 'No se puede bloquear a este cliente: no tiene teléfono ni email registrados.',
};

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { businessId } = await requirePanelSession();
  const { id } = await params;
  const { aviso } = await searchParams;
  const customer = await getCustomerDetail(prisma, businessId, id);

  if (!customer) {
    notFound();
  }

  const avisoMessage = aviso ? AVISO_MESSAGES[aviso] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{customer.name}</h1>
        {customer.blacklisted ? (
          <form action={removeFromBlacklistAction.bind(null, customer.id)}>
            <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm">
              Quitar de la lista negra
            </button>
          </form>
        ) : (
          <form action={addToBlacklistAction.bind(null, customer.id)} className="flex items-center gap-2">
            <input type="text" name="reason" placeholder="Motivo (opcional)" className="rounded border border-slate-300 px-2 py-1 text-sm" />
            <button type="submit" className="rounded bg-red-600 px-3 py-1.5 text-sm text-white">
              Bloquear
            </button>
          </form>
        )}
      </div>

      {avisoMessage && (
        <div className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{avisoMessage}</span>
          <Link href={`/panel/clientes/${customer.id}`} className="font-medium underline shrink-0">
            Cerrar
          </Link>
        </div>
      )}

      <p className="text-sm text-slate-600">
        {customer.phone ?? 'Sin teléfono'} · {customer.email ?? 'Sin email'}
      </p>

      <div className="rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Servicio</th>
              <th className="px-4 py-2">Profesional</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {customer.appointments.map((appt) => (
              <tr key={appt.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{formatAppointmentDateTime(appt.start)}</td>
                <td className="px-4 py-2">{appt.serviceName}</td>
                <td className="px-4 py-2">{appt.employeeName}</td>
                <td className="px-4 py-2">{STATUS_LABELS[appt.status]}</td>
              </tr>
            ))}
            {customer.appointments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Sin citas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
