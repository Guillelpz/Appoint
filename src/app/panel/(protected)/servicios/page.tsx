import Link from 'next/link';
import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { listServicesForBusiness } from '@/lib/panel/services-service';
import { formatDurationMinutes, formatPriceCents } from '@/lib/public/format-datetime';
import { setServiceActiveAction } from './actions';
import { CreateServiceForm } from './CreateServiceForm';

export default async function ServiciosPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { businessId } = await requirePanelSession();
  const { aviso } = await searchParams;
  const services = await listServicesForBusiness(prisma, businessId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Servicios</h1>

      {aviso === 'accion-no-aplicada' && (
        <div className="flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>Esa acción ya no se puede aplicar: el servicio cambió mientras tanto. La lista se ha actualizado.</span>
          <Link href="/panel/servicios" className="font-medium underline shrink-0">
            Cerrar
          </Link>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Duración</th>
              <th className="px-4 py-2">Precio</th>
              <th className="px-4 py-2">Buffer</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <Link href={`/panel/servicios/${service.id}`} className="font-medium text-slate-900 underline">
                    {service.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{formatDurationMinutes(service.durationMinutes)}</td>
                <td className="px-4 py-2">{formatPriceCents(service.priceCents)}</td>
                <td className="px-4 py-2">{service.bufferAfterMinutes} min</td>
                <td className="px-4 py-2">{service.active ? 'Activo' : 'Inactivo'}</td>
                <td className="px-4 py-2">
                  <form action={setServiceActiveAction.bind(null, service.id, !service.active)}>
                    <button type="submit" className="text-xs text-slate-500 underline">
                      {service.active ? 'Desactivar' : 'Activar'}
                    </button>
                  </form>
                  {service.active && (
                    <p className="mt-1 text-xs text-slate-400">Al desactivarlo, dejará de poder reservarse.</p>
                  )}
                </td>
              </tr>
            ))}
            {services.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Todavía no hay servicios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateServiceForm />
    </div>
  );
}
