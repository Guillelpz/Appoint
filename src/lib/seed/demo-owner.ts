import { createClient } from '@supabase/supabase-js';
import type { PrismaClient } from '@prisma/client';

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

function getSupabaseAdminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son necesarias para crear el usuario dueño demo (Supabase Auth admin API). Revisa .env.'
    );
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin;
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
