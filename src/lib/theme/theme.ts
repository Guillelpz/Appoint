import type { ThemePreset } from '@prisma/client';

export interface ThemeDefinition {
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  headingFontVar: string;
  bodyFontVar: string;
  radius: string;
  shadow: string;
}

export const THEME_PRESETS: Record<ThemePreset, ThemeDefinition> = {
  BOUTIQUE_EDITORIAL: {
    backgroundColor: '#FAF6F0',
    surfaceColor: '#FFFFFF',
    textColor: '#2B211B',
    mutedTextColor: '#6B5D53',
    accentColor: '#B25539',
    headingFontVar: '--font-playfair',
    bodyFontVar: '--font-lora',
    radius: '0.25rem',
    shadow: '0 12px 32px -16px rgba(43, 33, 27, 0.35)',
  },
  VIBRANT: {
    backgroundColor: '#FFF7ED',
    surfaceColor: '#FFFFFF',
    textColor: '#1F1147',
    mutedTextColor: '#5B4B8A',
    accentColor: '#E23E7A',
    headingFontVar: '--font-poppins',
    bodyFontVar: '--font-inter',
    radius: '1.25rem',
    shadow: '0 16px 40px -12px rgba(226, 62, 122, 0.45)',
  },
  MINIMAL_SERENE: {
    backgroundColor: '#F7F8F7',
    surfaceColor: '#FFFFFF',
    textColor: '#20281F',
    mutedTextColor: '#5D6B5A',
    accentColor: '#5C7A66',
    headingFontVar: '--font-work-sans',
    bodyFontVar: '--font-work-sans',
    radius: '0.5rem',
    shadow: '0 8px 24px -12px rgba(32, 40, 31, 0.18)',
  },
};

export function getContrastTextColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1A1A1A' : '#FFFFFF';
}

export interface BusinessThemeInput {
  themePreset: ThemePreset;
  accentColor: string;
}

export type ThemeCssVariables = Record<string, string>;

export function getThemeCssVariables(business: BusinessThemeInput): ThemeCssVariables {
  const preset = THEME_PRESETS[business.themePreset];
  const accentColor = business.accentColor || preset.accentColor;

  return {
    '--color-bg': preset.backgroundColor,
    '--color-surface': preset.surfaceColor,
    '--color-text': preset.textColor,
    '--color-text-muted': preset.mutedTextColor,
    '--color-accent': accentColor,
    '--color-accent-contrast': getContrastTextColor(accentColor),
    '--font-heading': `var(${preset.headingFontVar})`,
    '--font-body': `var(${preset.bodyFontVar})`,
    '--radius-theme': preset.radius,
    '--shadow-theme': preset.shadow,
  };
}
