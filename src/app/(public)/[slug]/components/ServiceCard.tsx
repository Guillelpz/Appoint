'use client';

import { useBookingLauncher } from './BookingLauncherProvider';
import { formatDurationMinutes, formatPriceCents } from '@/lib/public/format-datetime';

export interface ServiceCardService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
}

export interface ServiceCardProps {
  service: ServiceCardService;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const { openService } = useBookingLauncher();

  return (
    <div className="rounded-[var(--radius-theme)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-theme)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--color-text)]">
            {service.name}
          </h3>
          {service.description && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{service.description}</p>
          )}
          <p className="mt-3 inline-block rounded-[var(--radius-theme)] bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">
            {formatDurationMinutes(service.durationMinutes)} · {formatPriceCents(service.priceCents)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openService(service.id)}
          className="shrink-0 rounded-[var(--radius-theme)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast)]"
        >
          Reservar
        </button>
      </div>
    </div>
  );
}
