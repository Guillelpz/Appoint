'use client';

import type { CSSProperties } from 'react';
import type { ThemePreset } from '@prisma/client';
import { getThemeCssVariables } from '@/lib/theme/theme';

const THEME_PRESET_OPTIONS: { value: ThemePreset; label: string }[] = [
  { value: 'BOUTIQUE_EDITORIAL', label: 'Boutique editorial' },
  { value: 'VIBRANT', label: 'Vibrante' },
  { value: 'MINIMAL_SERENE', label: 'Minimal sereno' },
];

// Único punto del panel que aplica las variables CSS del tema público
// (getThemeCssVariables, de la Fase 3): el resto del panel se mantiene
// neutro (slate/blanco) a propósito, esto es solo una vista previa en
// miniatura de cómo verá el cliente final la página pública del negocio.
export function ThemePreview({
  preset,
  accentColor,
  onPresetChange,
  onAccentColorChange,
}: {
  preset: ThemePreset;
  accentColor: string;
  onPresetChange: (preset: ThemePreset) => void;
  onAccentColorChange: (accentColor: string) => void;
}) {
  const theme = getThemeCssVariables({ themePreset: preset, accentColor });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <select
          value={preset}
          onChange={(e) => onPresetChange(e.target.value as ThemePreset)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          {THEME_PRESET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="color"
          value={accentColor}
          onChange={(e) => onAccentColorChange(e.target.value)}
          className="h-9 w-16 rounded border border-slate-300"
        />
      </div>

      <div style={theme as CSSProperties} className="rounded-[var(--radius-theme)] bg-[var(--color-bg)] p-6 shadow-[var(--shadow-theme)]">
        <div className="rounded-[var(--radius-theme)] bg-[var(--color-surface)] p-4">
          <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--color-text)]">Vista previa</p>
          <p className="text-sm text-[var(--color-text-muted)]">Así se verá tu página pública.</p>
          <button
            type="button"
            className="mt-3 rounded-[var(--radius-theme)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast)]"
          >
            Reservar
          </button>
        </div>
      </div>
    </div>
  );
}
