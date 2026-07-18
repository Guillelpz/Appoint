import { notFound } from 'next/navigation';
import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { updateServiceAction } from '../actions';

export default async function ServiceEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { businessId } = await requirePanelSession();
  const { id } = await params;
  const service = await prisma.service.findUnique({ where: { id } });

  if (!service || service.businessId !== businessId) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Editar servicio</h1>
      <form action={updateServiceAction.bind(null, service.id)} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="text-sm">
          Nombre
          <input name="name" defaultValue={service.name} required maxLength={120} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="text-sm">
          Descripción
          <input name="description" defaultValue={service.description ?? ''} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="text-sm">
          Duración (min)
          <input name="durationMinutes" type="number" min={1} max={600} required defaultValue={service.durationMinutes} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="text-sm">
          Precio (céntimos)
          <input name="priceCents" type="number" min={0} required defaultValue={service.priceCents} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="text-sm">
          Buffer posterior (min)
          <input name="bufferAfterMinutes" type="number" min={0} max={240} defaultValue={service.bufferAfterMinutes} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="text-sm">
          Orden
          <input name="sortOrder" type="number" defaultValue={service.sortOrder} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={service.active} />
          Activo
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  );
}
