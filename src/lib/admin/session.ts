import { redirect } from 'next/navigation';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function isPlatformAdmin(prismaClient: PrismaClient, userId: string): Promise<boolean> {
  const record = await prismaClient.platformAdmin.findUnique({ where: { userId } });
  return record !== null;
}

export interface AdminSession {
  userId: string;
  email: string;
}

// Segunda barrera de protección de /admin/** (la primera es el middleware,
// Tarea 6) — mismo patrón que requirePanelSession() en
// src/lib/panel/session.ts, pero resolviendo el rol vía PlatformAdmin en
// vez de Membership OWNER.
export async function requireAdminSession(): Promise<AdminSession> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  const isAdmin = await isPlatformAdmin(prisma, user.id);
  if (!isAdmin) {
    redirect('/admin/login?error=' + encodeURIComponent('Tu cuenta no tiene acceso al panel de super-administración.'));
  }

  return { userId: user.id, email: user.email ?? '' };
}
