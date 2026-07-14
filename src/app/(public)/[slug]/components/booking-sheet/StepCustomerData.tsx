'use client';

import { useState, type FormEvent } from 'react';
import { formatAppointmentDateTime, formatDurationMinutes, formatPriceCents } from '@/lib/public/format-datetime';

export interface StepCustomerDataService {
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface StepCustomerDataProps {
  service: StepCustomerDataService;
  slotStart: Date;
  onBack: () => void;
  onSubmit: (data: { name: string; phone: string; email: string }) => void;
}

export function StepCustomerData({ service, slotStart, onBack, onSubmit }: StepCustomerDataProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ name, phone, email });
  }

  return (
    <form onSubmit={handleSubmit}>
      <button type="button" onClick={onBack} className="mb-3 text-sm text-[var(--color-accent)]">
        ← Cambiar hora
      </button>

      <div className="mb-4 rounded-[var(--radius-theme)] bg-[var(--color-bg)] p-3 text-sm text-[var(--color-text-muted)]">
        <p className="font-medium text-[var(--color-text)]">{service.name}</p>
        <p>{formatAppointmentDateTime(slotStart)}</p>
        <p>
          {formatDurationMinutes(service.durationMinutes)} · {formatPriceCents(service.priceCents)}
        </p>
      </div>

      <label className="mb-2 block text-sm text-[var(--color-text)]">
        Nombre y apellidos
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded-[var(--radius-theme)] border px-3 py-2 text-[var(--color-text)]"
        />
      </label>
      <label className="mb-2 block text-sm text-[var(--color-text)]">
        Teléfono
        <input
          required
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="mt-1 w-full rounded-[var(--radius-theme)] border px-3 py-2 text-[var(--color-text)]"
        />
      </label>
      <label className="mb-4 block text-sm text-[var(--color-text)]">
        Email
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-[var(--radius-theme)] border px-3 py-2 text-[var(--color-text)]"
        />
      </label>

      <button
        type="submit"
        className="w-full rounded-[var(--radius-theme)] bg-[var(--color-accent)] py-3 font-semibold text-[var(--color-accent-contrast)]"
      >
        Confirmar reserva
      </button>
    </form>
  );
}
