'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { BusinessType } from '@prisma/client';
import { createBusinessAction } from './actions';

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  HAIR_SALON: 'Peluquería',
  BARBERSHOP: 'Barbería',
  CLINIC: 'Clínica',
  SPA: 'Spa',
  OTHER: 'Otro',
};

export function CreateBusinessForm() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState<BusinessType>('OTHER');
  const [businessEmail, setBusinessEmail] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createBusinessAction({
        name,
        slug,
        type,
        businessEmail: businessEmail.trim() || null,
        ownerEmail,
      });
      if (result.ok) {
        setMessage('Negocio creado. Se ha enviado la invitación al dueño por email.');
        setName('');
        setSlug('');
        setType('OTHER');
        setBusinessEmail('');
        setOwnerEmail('');
      } else {
        setMessage(result.message ?? 'No se pudo crear el negocio.');
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold text-slate-900">Nuevo negocio</h2>
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
          Slug
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            maxLength={60}
            placeholder="mi-negocio"
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          Tipo
          <select
            value={type}
            onChange={(e) => setType(e.target.value as BusinessType)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          >
            {Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Email de contacto
          <input
            type="email"
            value={businessEmail}
            onChange={(e) => setBusinessEmail(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
          <span className="mt-1 block text-xs text-slate-400">Opcional. Visible en la página pública del negocio.</span>
        </label>
        <label className="text-sm">
          Email del dueño
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
          <span className="mt-1 block text-xs text-slate-400">Obligatorio. Recibe la invitación para acceder al panel.</span>
        </label>

        {message && <p className="rounded bg-red-50 px-3 py-2 text-sm text-slate-700 sm:col-span-2">{message}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Crear negocio
          </button>
        </div>
      </form>
    </div>
  );
}
