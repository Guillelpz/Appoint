import { cache } from 'react';
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
//
// Envuelta en cache() de React: memoiza por render de servidor (no entre
// peticiones ni entre usuarios distintos — el cache se descarta al acabar
// la petición), así que el layout protegido, la página y las Server
// Actions que se ejecuten dentro de la misma petición/revalidación
// comparten una única resolución de sesión en vez de repetir la llamada de
// red a Supabase Auth + las consultas a Postgres en cada punto de la
// jerarquía de componentes. Si esta función lanza (redirect() funciona
// lanzando la excepción interna NEXT_REDIRECT), cache() no atrapa ni
// transforma la excepción: simplemente memoiza la promesa devuelta por la
// primera invocación, así que el segundo llamador recibe esa misma promesa
// rechazada y la relanza — el flujo de redirección de Next.js sigue
// intacto.
export const requirePanelSession = cache(async (): Promise<PanelSession> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/panel/login');
  }

  // Ruta rápida: fusiona en una sola consulta lo que getOwnerBusinessIdForUser
  // + isBusinessActive hacían en dos round-trips secuenciales a Postgres.
  // Ambas funciones se mantienen exportadas e intactas (tienen tests propios
  // establecidos) para quien necesite resolver cada paso por separado; esta
  // es únicamente la ruta optimizada que usa requirePanelSession().
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, role: 'OWNER' },
    select: { businessId: true, business: { select: { active: true } } },
  });

  if (!membership) {
    redirect('/panel/login?error=' + encodeURIComponent('Tu cuenta no tiene acceso a ningún panel de negocio.'));
  }

  if (!membership.business.active) {
    redirect('/panel/login?error=' + encodeURIComponent('Este negocio está suspendido. Contacta con el soporte de Appoint.'));
  }

  return { userId: user.id, email: user.email ?? '', businessId: membership.businessId };
});
