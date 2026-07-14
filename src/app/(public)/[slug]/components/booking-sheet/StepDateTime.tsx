'use client';

import { useEffect, useState } from 'react';
import { buildDayOptions, formatSlotTime, type DayOption } from '@/lib/public/format-datetime';
import { getLocalDateString, addDaysToLocalDateString } from '@/lib/booking/timezone';
import { fetchAvailableSlotsAction, type SlotOption } from '../../actions';

export interface StepDateTimeProps {
  slug: string;
  serviceId: string;
  employeeId: string | null;
  maxBookingWindowDays: number;
  onBack: () => void;
  onSelect: (start: Date) => void;
}

export function StepDateTime({ slug, serviceId, employeeId, maxBookingWindowDays, onBack, onSelect }: StepDateTimeProps) {
  const [dayOptions] = useState(() => buildDayOptions(new Date(), maxBookingWindowDays));
  const [selectedDate, setSelectedDate] = useState(dayOptions[0]?.localDate ?? '');
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextAvailable, setNextAvailable] = useState<DayOption | null>(null);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNextAvailable(null);

    fetchAvailableSlotsAction({
      slug,
      serviceId,
      employeeId: employeeId ?? undefined,
      dateFrom: selectedDate,
      dateTo: selectedDate,
    }).then((result) => {
      if (cancelled) {
        return;
      }
      setSlots(result);
      setLoading(false);

      // Sin huecos ese día: busca el próximo día disponible dentro de la
      // ventana de reserva del negocio para poder sugerirlo (spec: "Sin
      // huecos disponibles → mensaje con próximo día disponible").
      if (result.length === 0) {
        const lastOption = dayOptions[dayOptions.length - 1];
        const searchFrom = addDaysToLocalDateString(selectedDate, 1);
        if (lastOption && searchFrom <= lastOption.localDate) {
          fetchAvailableSlotsAction({
            slug,
            serviceId,
            employeeId: employeeId ?? undefined,
            dateFrom: searchFrom,
            dateTo: lastOption.localDate,
          }).then((widerResult) => {
            if (cancelled || widerResult.length === 0) {
              return;
            }
            const earliestLocalDate = getLocalDateString(new Date(widerResult[0].start));
            const matchingOption = dayOptions.find((d) => d.localDate === earliestLocalDate);
            if (matchingOption) {
              setNextAvailable(matchingOption);
            }
          });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, employeeId, selectedDate, dayOptions]);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 text-sm text-[var(--color-accent)]">
        ← Cambiar profesional
      </button>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {dayOptions.map((day) => (
          <button
            key={day.localDate}
            type="button"
            onClick={() => setSelectedDate(day.localDate)}
            className={`shrink-0 rounded-[var(--radius-theme)] border px-3 py-2 text-sm capitalize ${
              day.localDate === selectedDate
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
                : 'text-[var(--color-text)]'
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-[var(--color-text-muted)]">Buscando huecos disponibles…</p>}

      {!loading && slots.length === 0 && (
        <div className="text-sm text-[var(--color-text-muted)]">
          <p>No hay huecos disponibles este día.</p>
          {nextAvailable && (
            <button
              type="button"
              onClick={() => setSelectedDate(nextAvailable.localDate)}
              className="mt-2 font-medium text-[var(--color-accent)] underline"
            >
              Ver la próxima disponibilidad ({nextAvailable.label})
            </button>
          )}
        </div>
      )}

      {!loading && slots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((slot) => (
            <button
              key={slot.start}
              type="button"
              onClick={() => onSelect(new Date(slot.start))}
              className="rounded-[var(--radius-theme)] border px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
            >
              {formatSlotTime(new Date(slot.start))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
