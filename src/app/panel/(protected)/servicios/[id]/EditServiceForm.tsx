'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Service } from '@prisma/client';
import { updateServiceAction } from '../actions';

export function EditServiceForm({ service }: { service: Service }) {
  const router = useRouter();
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? '');
  const [durationMinutes, setDurationMinutes] = useState(String(service.durationMinutes));
  const [priceCents, setPriceCents] = useState(String(service.priceCents));
  const [bufferAfterMinutes, setBufferAfterMinutes] = useState(String(service.bufferAfterMinutes));
  const [sortOrder, setSortOrder] = useState(String(service.sortOrder));
  const [active, setActive] = useState(service.active);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateServiceAction(service.id, {
        name,
        description: description.trim() || null,
        durationMinutes: Number(durationMinutes),
        priceCents: Number(priceCents),
        bufferAfterMinutes: Number(bufferAfterMinutes),
        active,
        sortOrder: Number(sortOrder),
      });
      if (result.ok) {
        router.push('/panel/servicios');
      } else {
        setMessage(result.message ?? 'No se pudo guardar el servicio.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <label className="text-sm">
        Nombre
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
        />
      </label>
      <label className="text-sm">
        Descripción
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
        />
      </label>
      <label className="text-sm">
        Duración (min)
        <input
          type="number"
          min={1}
          max={600}
          required
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
        />
      </label>
      <label className="text-sm">
        Precio (céntimos)
        <input
          type="number"
          min={0}
          required
          value={priceCents}
          onChange={(e) => setPriceCents(e.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
        />
      </label>
      <label className="text-sm">
        Buffer posterior (min)
        <input
          type="number"
          min={0}
          max={240}
          value={bufferAfterMinutes}
          onChange={(e) => setBufferAfterMinutes(e.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
        />
      </label>
      <label className="text-sm">
        Orden
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Activo
      </label>

      {message && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{message}</p>}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Guardar cambios
        </button>
      </div>
    </form>
  );
}
