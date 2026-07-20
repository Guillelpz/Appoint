import { describe, it, expect } from 'vitest';
import { buildBusinessPublicUrl, generateBusinessQrSvg } from './qr';

describe('buildBusinessPublicUrl', () => {
  it('construye la URL pública del negocio con el parámetro src=qr', () => {
    expect(buildBusinessPublicUrl('salon-aura')).toBe('http://localhost:3000/salon-aura?src=qr');
  });
});

describe('generateBusinessQrSvg', () => {
  it('genera un SVG no vacío', async () => {
    const svg = await generateBusinessQrSvg('salon-aura');
    expect(svg).toContain('<svg');
    expect(svg.length).toBeGreaterThan(100);
  });
});
