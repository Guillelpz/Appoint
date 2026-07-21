import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { isPlatformAdmin } from './session';

describe('isPlatformAdmin', () => {
  it('devuelve true si el usuario tiene un registro PlatformAdmin', async () => {
    await prisma.platformAdmin.create({ data: { userId: 'user-superadmin-1' } });

    expect(await isPlatformAdmin(prisma, 'user-superadmin-1')).toBe(true);
  });

  it('devuelve false si el usuario no tiene ningún registro PlatformAdmin', async () => {
    expect(await isPlatformAdmin(prisma, 'user-sin-admin')).toBe(false);
  });
});
