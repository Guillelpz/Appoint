import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import { seedDemoSuperAdminRecord, getDemoSuperAdminCredentials } from './demo-superadmin';

describe('seedDemoSuperAdminRecord', () => {
  it('crea un registro PlatformAdmin para el userId indicado', async () => {
    await seedDemoSuperAdminRecord(prisma, 'user-demo-superadmin');

    const record = await prisma.platformAdmin.findUnique({ where: { userId: 'user-demo-superadmin' } });
    expect(record).not.toBeNull();
  });

  it('es idempotente: llamarlo dos veces no crea registros duplicados', async () => {
    await seedDemoSuperAdminRecord(prisma, 'user-demo-superadmin-2');
    await seedDemoSuperAdminRecord(prisma, 'user-demo-superadmin-2');

    const count = await prisma.platformAdmin.count({ where: { userId: 'user-demo-superadmin-2' } });
    expect(count).toBe(1);
  });
});

describe('getDemoSuperAdminCredentials', () => {
  it('devuelve un email y contraseña no vacíos (por defecto o de variables de entorno)', () => {
    const { email, password } = getDemoSuperAdminCredentials();
    expect(email.length).toBeGreaterThan(0);
    expect(password.length).toBeGreaterThan(0);
  });
});
