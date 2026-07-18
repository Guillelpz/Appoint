'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { createServiceAction } from './actions';

export function CreateServiceForm() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [priceCents, setPriceCents] = useState('0');
  const [bufferAfterMinutes, setBufferAfterMinutes] = useState('0');
  const [sortOrder, setSortOrder] = useState('0');
  const [active, setActive] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createServiceAction({
        name,
        description: description.trim() || null,
        durationMinutes: Number(durationMinutes),
        priceCents: Number(priceCents),
        bufferAfterMinutes: Number(bufferAfterMinutes),
        active,
        sortOrder: Number(sortOrder),
      });
      if (result.ok) {
        setMessage(null);
        setName('');
        setDescription('');
        setDurationMinutes('30');
        setPriceCents('0');
        setBufferAfterMinutes('0');
        setSortOrder('0');
        setActive(true);
      } else {
        setMessage(result.message ?? 'No se pudo crear el servicio.');
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold text-slate-900">Nuevo servicio</h2>
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
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
            Crear servicio
          </button>
        </div>
      </form>
    </div>
  );
}
