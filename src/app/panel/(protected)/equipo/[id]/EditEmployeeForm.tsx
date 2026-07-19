'use client';

import { useState, useTransition, type FormEvent } from 'react';
import type { Employee } from '@prisma/client';
import { updateEmployeeAction } from '../actions';

interface ServiceOption {
  id: string;
  name: string;
}

export function EditEmployeeForm({
  employee,
  services,
  initialServiceIds,
}: {
  employee: Employee;
  services: ServiceOption[];
  initialServiceIds: string[];
}) {
  const [name, setName] = useState(employee.name);
  const [color, setColor] = useState(employee.color);
  const [active, setActive] = useState(employee.active);
  const [serviceIds, setServiceIds] = useState<string[]>(initialServiceIds);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleService(serviceId: string) {
    setServiceIds((current) => (current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateEmployeeAction(employee.id, { name, color, active, serviceIds });
      setMessage(result.ok ? 'Datos guardados.' : (result.message ?? 'No se pudo guardar el empleado.'));
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
        Color de agenda
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="mt-1 block h-9 w-full rounded border border-slate-300"
        />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium text-slate-700">Servicios que ofrece</legend>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {services.map((service) => (
            <label key={service.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={serviceIds.includes(service.id)} onChange={() => toggleService(service.id)} />
              {service.name}
            </label>
          ))}
          {services.length === 0 && <p className="text-sm text-slate-400 sm:col-span-3">No hay servicios activos todavía.</p>}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Activo
      </label>

      {message && (
        <p className={`text-sm sm:col-span-2 ${message === 'Datos guardados.' ? 'text-slate-600' : 'rounded bg-red-50 px-3 py-2 text-red-700'}`}>
          {message}
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Guardar datos
        </button>
      </div>
    </form>
  );
}
