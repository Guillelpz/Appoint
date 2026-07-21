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

// Separada de getOwnerBusinessIdForUser para no tocar su contrato (tiene
// tests propios ya establecidos) y poder testear el caso "negocio
// suspendido" de forma aislada.
export async function isBusinessActive(prismaClient: PrismaClient, businessId: string): Promise<boolean> {
  const business = await prismaClient.business.findUnique({ where: { id: businessId }, select: { active: true } });
  return business?.active ?? false;
}

export interface PanelSession {
  userId: string;
  email: string;
  businessId: string;
}

// Segunda barrera de protección (la primera es el middleware): se llama
// desde el layout protegido del panel y desde cada Server Action, y
// redirige si no hay usuario autenticado, si el usuario no es OWNER de
// ningún negocio, o si el negocio del que es OWNER está suspendido
// (bug cerrado en Fase 6: antes de este cambio, un negocio con
// `active: false` seguía siendo accesible desde /panel para su dueño con
// sesión válida — el flag `active` solo se comprobaba en la página pública,
// business-lookup.ts).
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

  const active = await isBusinessActive(prisma, businessId);
  if (!active) {
    redirect('/panel/login?error=' + encodeURIComponent('Este negocio está suspendido. Contacta con el soporte de Appoint.'));
  }

  return { userId: user.id, email: user.email ?? '', businessId };
}
