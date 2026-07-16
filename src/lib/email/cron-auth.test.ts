import { describe, it, expect } from 'vitest';
import { isAuthorizedCronRequest } from './cron-auth';

describe('isAuthorizedCronRequest', () => {
  it('autoriza cuando el header coincide exactamente con Bearer + el secreto', () => {
    expect(isAuthorizedCronRequest('Bearer abc123', 'abc123')).toBe(true);
  });

  it('rechaza si el header no está presente', () => {
    expect(isAuthorizedCronRequest(null, 'abc123')).toBe(false);
  });

  it('rechaza si el secreto no está configurado en el servidor', () => {
    expect(isAuthorizedCronRequest('Bearer abc123', undefined)).toBe(false);
  });

  it('rechaza si el token del header no coincide', () => {
    expect(isAuthorizedCronRequest('Bearer otro-token', 'abc123')).toBe(false);
  });

  it('rechaza si falta el prefijo "Bearer "', () => {
    expect(isAuthorizedCronRequest('abc123', 'abc123')).toBe(false);
  });
});
