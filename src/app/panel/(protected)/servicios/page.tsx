import Link from 'next/link';
import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { listServicesForBusiness } from '@/lib/panel/services-service';
import { formatDurationMinutes, formatPriceCents } from '@/lib/public/format-datetime';
import { createServiceAction, setServiceActiveAction } from './actions';

export default async function ServiciosPage() {
  const { businessId } = await requirePanelSession();
  const services = await listServicesForBusiness(prisma, businessId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Servicios</h1>

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

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Nuevo servicio</h2>
        <form action={createServiceAction} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Nombre
            <input name="name" required maxLength={120} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Descripción
            <input name="description" className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Duración (min)
            <input name="durationMinutes" type="number" min={1} max={600} required defaultValue={30} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Precio (céntimos)
            <input name="priceCents" type="number" min={0} required defaultValue={0} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Buffer posterior (min)
            <input name="bufferAfterMinutes" type="number" min={0} max={240} defaultValue={0} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            Orden
            <input name="sortOrder" type="number" defaultValue={0} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked />
            Activo
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Crear servicio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
