'use client';

import { useState, useTransition } from 'react';
import type { WorkingHoursBlockInput } from '@/lib/panel/working-hours-service';
import { replaceWorkingHoursAction } from './actions';

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function minutesToInputValue(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function inputValueToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function WorkingHoursEditor({
  employeeId,
  initialBlocks,
}: {
  employeeId: string;
  initialBlocks: WorkingHoursBlockInput[];
}) {
  const [blocks, setBlocks] = useState<WorkingHoursBlockInput[]>(initialBlocks);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addBlock(weekday: number) {
    setBlocks((prev) => [...prev, { weekday, startMinute: 540, endMinute: 1020 }]);
  }
  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }
  function updateBlock(index: number, field: 'startMinute' | 'endMinute', value: string) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: inputValueToMinutes(value) } : b)));
  }

  function save() {
    startTransition(async () => {
      const result = await replaceWorkingHoursAction(employeeId, blocks);
      setMessage(result.ok ? 'Horario guardado.' : (result.message ?? 'No se pudo guardar el horario.'));
    });
  }

  return (
    <div className="space-y-4">
      {WEEKDAY_LABELS.map((label, weekday) => (
        <div key={weekday} className="rounded border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-900">{label}</h3>
            <button type="button" onClick={() => addBlock(weekday)} className="text-xs text-slate-500 underline">
              + Añadir tramo
            </button>
          </div>
          {blocks
            .map((block, index) => ({ block, index }))
            .filter(({ block }) => block.weekday === weekday)
            .map(({ block, index }) => (
              <div key={index} className="mb-2 flex items-center gap-2 text-sm">
                <input
                  type="time"
                  value={minutesToInputValue(block.startMinute)}
                  onChange={(e) => updateBlock(index, 'startMinute', e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1"
                />
                <span>–</span>
                <input
                  type="time"
                  value={minutesToInputValue(block.endMinute)}
                  onChange={(e) => updateBlock(index, 'endMinute', e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1"
                />
                <button type="button" onClick={() => removeBlock(index)} className="text-xs text-red-600 underline">
                  Quitar
                </button>
              </div>
            ))}
        </div>
      ))}
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Guardar horario
      </button>
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  );
}
