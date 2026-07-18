'use client';

import { useState, useTransition } from 'react';
import { formatSlotTime } from '@/lib/public/format-datetime';
import { getManualSlotsAction, createManualAppointmentAction, type ManualSlotOption } from './actions';

export interface ManualAppointmentFormProps {
  services: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; serviceIds: string[] }>;
  defaultDate: string;
}

export function ManualAppointmentForm({ services, employees, defaultDate }: ManualAppointmentFormProps) {
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [slots, setSlots] = useState<ManualSlotOption[]>([]);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const availableEmployees = employees.filter((e) => e.serviceIds.includes(serviceId));

  function loadSlots() {
    if (!serviceId || !employeeId || !date) {
      return;
    }
    startTransition(async () => {
      const result = await getManualSlotsAction({ serviceId, employeeId, date });
      setSlots(result);
      setSelectedStart(null);
    });
  }

  function submit() {
    if (!selectedStart || !customerName.trim()) {
      setMessage('Indica al menos el nombre del cliente y elige un hueco.');
      return;
    }
    startTransition(async () => {
      const result = await createManualAppointmentAction({
        serviceId,
        employeeId,
        start: selectedStart,
        customerName,
        customerPhone,
        customerEmail,
      });
      if (result.ok) {
        setMessage('Cita creada correctamente.');
        setCustomerName('');
        setCustomerPhone('');
        setCustomerEmail('');
        setSelectedStart(null);
        setSlots([]);
        setOpen(false);
      } else {
        setMessage(result.message ?? 'No se pudo crear la cita.');
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
        + Cita manual
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Nueva cita manual</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500">
          Cerrar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Servicio
          <select
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setEmployeeId('');
              setSlots([]);
            }}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          Profesional
          <select
            value={employeeId}
            onChange={(e) => {
              setEmployeeId(e.target.value);
              setSlots([]);
            }}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          >
            <option value="">Selecciona</option>
            {availableEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          Fecha
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSlots([]);
            }}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={loadSlots}
            disabled={isPending || !employeeId}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Ver huecos
          </button>
        </div>
      </div>

      {slots.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {slots.map((slot) => (
            <button
              key={slot.start}
              type="button"
              onClick={() => setSelectedStart(slot.start)}
              className={`rounded border px-2 py-1 text-sm ${
                selectedStart === slot.start ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'
              }`}
            >
              {formatSlotTime(new Date(slot.start))}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Nombre (obligatorio)
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          Teléfono (opcional)
          <input
            type="text"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          Email (opcional)
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={isPending || !selectedStart}
        className="mt-3 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Crear cita
      </button>
    </div>
  );
}
