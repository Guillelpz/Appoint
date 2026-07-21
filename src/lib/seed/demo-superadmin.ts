import type { PrismaClient } from '@prisma/client';
import { getSupabaseAdminAuthClient } from '@/lib/supabase/admin';

export interface DemoSuperAdminCredentials {
  email: string;
  password: string;
}

export function getDemoSuperAdminCredentials(): DemoSuperAdminCredentials {
  return {
    email: process.env.DEMO_SUPERADMIN_EMAIL || 'superadmin@appoint.example',
    password: process.env.DEMO_SUPERADMIN_PASSWORD || 'appoint-admin-2026',
  };
}

// Idempotente, mismo patrón que ensureDemoOwnerAuthUser: si el usuario ya
// existe (createUser devuelve error de email duplicado), lo busca en
// listUsers() y reutiliza su id.
export async function ensureDemoSuperAdminAuthUser(): Promise<{ userId: string; email: string }> {
  const { email, password } = getDemoSuperAdminCredentials();
  const admin = getSupabaseAdminAuthClient();

  const created = await admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) {
    return { userId: created.data.user.id, email };
  }

  const { data, error } = await admin.listUsers();
  if (error) {
    throw new Error(`No se pudo listar usuarios de Supabase Auth: ${error.message}`);
  }
  const existing = data.users.find((u) => u.email === email);
  if (!existing) {
    throw new Error(`No se pudo crear ni encontrar el super-admin demo (${email}): ${created.error?.message}`);
  }
  return { userId: existing.id, email };
}

export async function seedDemoSuperAdminRecord(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.platformAdmin.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}
