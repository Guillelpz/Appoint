import { redirect } from 'next/navigation';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getOwnerBusinessIdForUser(prismaClient: PrismaClient, userId: string): Promise<string | null> {
  const membership = await prismaClient.membership.findFirst({
    where: { userId, role: 'OWNER' },
  });
  return membership?.businessId ?? null;
}

export interface PanelSession {
  userId: string;
  email: string;
  businessId: string;
}

// Segunda barrera de protección (la primera es el middleware): se llama
// desde el layout protegido del panel y desde cada Server Action, y
// redirige si no hay usuario autenticado o si el usuario no es OWNER de
// ningún negocio (p. ej. un STAFF, fuera de alcance en esta fase, o un
// usuario de Supabase Auth sin Membership).
export async function requirePanelSession(): Promise<PanelSession> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/panel/login');
  }

  const businessId = await getOwnerBusinessIdForUser(prisma, user.id);
  if (!businessId) {
    redirect('/panel/login?error=' + encodeURIComponent('Tu cuenta no tiene acceso a ningún panel de negocio.'));
  }

  return { userId: user.id, email: user.email ?? '', businessId };
}
