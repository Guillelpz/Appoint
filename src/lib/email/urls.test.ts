import { describe, it, expect, afterEach } from 'vitest';
import { getAppBaseUrl, buildConfirmUrl, buildCancelUrl } from './urls';

describe('urls de email', () => {
  const originalBaseUrl = process.env.APP_BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = originalBaseUrl;
    }
  });

  it('usa http://localhost:3000 por defecto si APP_BASE_URL no está definida', () => {
    delete process.env.APP_BASE_URL;
    expect(getAppBaseUrl()).toBe('http://localhost:3000');
  });

  it('usa APP_BASE_URL cuando está definida', () => {
    process.env.APP_BASE_URL = 'https://salonaura.example';
    expect(getAppBaseUrl()).toBe('https://salonaura.example');
  });

  it('construye una URL absoluta de confirmación con el token', () => {
    process.env.APP_BASE_URL = 'https://salonaura.example';
    expect(buildConfirmUrl('abc123')).toBe('https://salonaura.example/confirmar/abc123');
  });

  it('construye una URL absoluta de cancelación con el token', () => {
    process.env.APP_BASE_URL = 'https://salonaura.example';
    expect(buildCancelUrl('abc123')).toBe('https://salonaura.example/cita/abc123');
  });
});
