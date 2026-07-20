'use client';

import { useState, useTransition, type FormEvent } from 'react';
import type { Business, ThemePreset } from '@prisma/client';
import { updateSettingsAction } from './actions';
import { ThemePreview } from './ThemePreview';

const GRANULARITY_OPTIONS = [5, 10, 15, 20, 30, 60];

export function SettingsForm({ business }: { business: Business }) {
  const [name, setName] = useState(business.name);
  const [address, setAddress] = useState(business.address ?? '');
  const [phone, setPhone] = useState(business.phone ?? '');
  const [email, setEmail] = useState(business.email ?? '');
  const [themePreset, setThemePreset] = useState<ThemePreset>(business.themePreset);
  const [accentColor, setAccentColor] = useState(business.accentColor);
  const [maxBookingWindowDays, setMaxBookingWindowDays] = useState(String(business.maxBookingWindowDays));
  const [minAdvanceNoticeMinutes, setMinAdvanceNoticeMinutes] = useState(String(business.minAdvanceNoticeMinutes));
  const [cancellationPolicy, setCancellationPolicy] = useState(business.cancellationPolicy ?? '');
  const [manualApproval, setManualApproval] = useState(business.manualApproval);
  const [slotGranularityMinutes, setSlotGranularityMinutes] = useState(String(business.slotGranularityMinutes));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateSettingsAction({
        name,
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        themePreset,
        accentColor,
        maxBookingWindowDays: Number(maxBookingWindowDays),
        minAdvanceNoticeMinutes: Number(minAdvanceNoticeMinutes),
        cancellationPolicy: cancellationPolicy.trim() || null,
        manualApproval,
        slotGranularityMinutes: Number(slotGranularityMinutes),
      });
      setMessage(result.ok ? 'Ajustes guardados.' : (result.message ?? 'No se pudieron guardar los ajustes.'));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
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
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          Teléfono
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          Dirección
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Tema</p>
        <ThemePreview
          preset={themePreset}
          accentColor={accentColor}
          onPresetChange={setThemePreset}
          onAccentColorChange={setAccentColor}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Ventana máxima de reserva (días)
          <input
            type="number"
            min={1}
            max={365}
            required
            value={maxBookingWindowDays}
            onChange={(e) => setMaxBookingWindowDays(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          Antelación mínima (minutos)
          <input
            type="number"
            min={0}
            required
            value={minAdvanceNoticeMinutes}
            onChange={(e) => setMinAdvanceNoticeMinutes(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          Granularidad de huecos (minutos)
          <select
            value={slotGranularityMinutes}
            onChange={(e) => setSlotGranularityMinutes(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
          >
            {GRANULARITY_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={manualApproval} onChange={(e) => setManualApproval(e.target.checked)} />
          Requiere aprobación manual de citas
        </label>
      </div>

      <label className="block text-sm">
        Política de cancelación
        <textarea
          value={cancellationPolicy}
          onChange={(e) => setCancellationPolicy(e.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5"
        />
      </label>

      {message && (
        <p className={`text-sm ${message === 'Ajustes guardados.' ? 'text-slate-600' : 'rounded bg-red-50 px-3 py-2 text-red-700'}`}>
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Guardar ajustes
      </button>
    </form>
  );
}
