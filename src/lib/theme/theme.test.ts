import { describe, it, expect } from 'vitest';
import { getThemeCssVariables, getContrastTextColor, THEME_PRESETS } from './theme';

describe('getContrastTextColor', () => {
  it('devuelve un texto oscuro para colores claros', () => {
    expect(getContrastTextColor('#FFFFFF')).toBe('#1A1A1A');
  });

  it('devuelve un texto claro para colores oscuros', () => {
    expect(getContrastTextColor('#000000')).toBe('#FFFFFF');
  });

  it('devuelve un texto claro para el terracota por defecto de Boutique editorial', () => {
    expect(getContrastTextColor('#B25539')).toBe('#FFFFFF');
  });
});

describe('getThemeCssVariables', () => {
  it('usa los valores del preset Boutique editorial por defecto', () => {
    const vars = getThemeCssVariables({ themePreset: 'BOUTIQUE_EDITORIAL', accentColor: '#B25539' });

    expect(vars['--color-bg']).toBe(THEME_PRESETS.BOUTIQUE_EDITORIAL.backgroundColor);
    expect(vars['--color-accent']).toBe('#B25539');
    expect(vars['--font-heading']).toBe('var(--font-playfair)');
    expect(vars['--font-body']).toBe('var(--font-lora)');
  });

  it('respeta el color de acento personalizado del negocio en vez del de preset', () => {
    const vars = getThemeCssVariables({ themePreset: 'VIBRANT', accentColor: '#00A86B' });

    expect(vars['--color-accent']).toBe('#00A86B');
    expect(vars['--color-accent-contrast']).toBe(getContrastTextColor('#00A86B'));
  });

  it('genera variables para los tres presets sin errores', () => {
    for (const preset of ['BOUTIQUE_EDITORIAL', 'VIBRANT', 'MINIMAL_SERENE'] as const) {
      const vars = getThemeCssVariables({ themePreset: preset, accentColor: THEME_PRESETS[preset].accentColor });
      expect(Object.keys(vars).length).toBeGreaterThan(0);
    }
  });
});
