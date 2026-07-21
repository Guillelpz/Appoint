import type { PrismaClient } from '@prisma/client';
import { getSupabaseAdminAuthClient } from '@/lib/supabase/admin';

export interface DemoOwnerCredentials {
  email: string;
  password: string;
}

export function getDemoOwnerCredentials(): DemoOwnerCredentials {
  return {
    email: process.env.DEMO_OWNER_EMAIL || 'dueno@salonaura.example',
    password: process.env.DEMO_OWNER_PASSWORD || 'appoint-demo-2026',
  };
}

// Idempotente: si el usuario ya existe (createUser devuelve un error de
// email duplicado), lo busca en la lista de usuarios y reutiliza su id. La
// Admin API de supabase-js no expone un getUserByEmail directo, así que se
// recurre a listUsers() como fallback.
export async function ensureDemoOwnerAuthUser(): Promise<{ userId: string; email: string }> {
  const { email, password } = getDemoOwnerCredentials();
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
    throw new Error(`No se pudo crear ni encontrar el usuario dueño demo (${email}): ${created.error?.message}`);
  }
  return { userId: existing.id, email };
}

export async function seedDemoOwnerMembership(prisma: PrismaClient, businessId: string, userId: string): Promise<void> {
  await prisma.membership.upsert({
    where: { userId_businessId: { userId, businessId } },
    update: { role: 'OWNER' },
    create: { userId, businessId, role: 'OWNER' },
  });
}
