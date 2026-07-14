'use client';

import { formatSlotTime } from '@/lib/public/format-datetime';

export interface StepErrorProps {
  message: string;
  alternativeSlots: Date[];
  onBack: () => void;
  onSelectAlternative: (start: Date) => void;
}

export function StepError({ message, alternativeSlots, onBack, onSelectAlternative }: StepErrorProps) {
  return (
    <div className="py-4">
      <p className="mb-4 text-[var(--color-text)]">{message}</p>

      {alternativeSlots.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {alternativeSlots.map((slot) => (
            <button
              key={slot.toISOString()}
              type="button"
              onClick={() => onSelectAlternative(slot)}
              className="rounded-[var(--radius-theme)] border px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
            >
              {formatSlotTime(slot)}
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={onBack} className="text-sm text-[var(--color-accent)]">
        ← Elegir otro horario
      </button>
    </div>
  );
}
