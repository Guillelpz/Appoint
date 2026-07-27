import { Prisma, BusinessType } from '@prisma/client';
import type { PrismaClient, Business } from '@prisma/client';
import type { OwnerInviter, OwnerInvitationLink } from './owner-inviter';
import { PAGE_SIZE, paginationMeta, type PaginatedResult } from '../pagination';

export interface PlatformBusinessSummary {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  createdAt: Date;
}

// Dos campos de email distintos (decisión confirmada con el usuario tras
// una ambigüedad detectada en la redacción del plan): `businessEmail` es el
// email de contacto PÚBLICO del negocio (opcional, igual que
// `Business.email` ya es nullable en el schema — es el que se muestra en la
// página pública) y `ownerEmail` es el email REAL del dueño (obligatorio),
// usado exclusivamente para crear su usuario de Supabase Auth e invitarlo.
// Pueden coincidir o no.
export interface NewBusinessInput {
  name: string;
  slug: string;
  type: BusinessType;
  businessEmail: string | null;
  ownerEmail: string;
}

export type CreatePlatformBusinessResult =
  | { ok: true; business: Business; ownerUserId: string; invitationTokenHash: string }
  | { ok: false; reason: 'INVALID_INPUT' | 'SLUG_TAKEN' | 'OWNER_INVITE_FAILED' };

// Rutas de primer nivel ya usadas por la app: un negocio con uno de estos
// slugs sería indistinguible de esas rutas en `/{slug}` (página pública).
// 'panel' ya estaba reservado de facto desde la Fase 5 (ver CONTINUAR.md);
// aquí se hace explícito junto al resto de segmentos reales de src/app/.
const RESERVED_SLUGS = new Set(['panel', 'admin', 'cita', 'confirmar', 'api']);
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidNewBusinessInput(input: NewBusinessInput): boolean {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const ownerEmail = input.ownerEmail.trim();
  const businessEmail = input.businessEmail?.trim() ?? '';
  return (
    name.length > 0 &&
    name.length <= 120 &&
    SLUG_PATTERN.test(slug) &&
    slug.length <= 60 &&
    !RESERVED_SLUGS.has(slug) &&
    Object.values(BusinessType).includes(input.type) &&
    EMAIL_PATTERN.test(ownerEmail) &&
    (businessEmail.length === 0 || EMAIL_PATTERN.test(businessEmail))
  );
}

export async function listPlatformBusinesses(prisma: PrismaClient, page: number = 1): Promise<PaginatedResult<PlatformBusinessSummary>> {
  const { safePage, hasNextPage, hasPreviousPage } = paginationMeta(page, await prisma.business.count());
  const businesses = await prisma.business.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return {
    items: businesses.map((b) => ({ id: b.id, slug: b.slug, name: b.name, active: b.active, createdAt: b.createdAt })),
    hasNextPage,
    hasPreviousPage,
  };
}

// Alcance de plataforma (no tenant-scoped, opera sin businessId de sesión):
// crea el Business y, en la misma operación de negocio, invita al dueño real
// por email (Supabase Auth Admin API, vía `ownerInviter` inyectable — mismo
// patrón de inyección que `emailSender` en src/lib/email/) y le da de alta
// como Membership OWNER. `ownerInviter` es una llamada de red externa que no
// puede formar parte de una transacción de Prisma: si falla DESPUÉS de crear
// el Business, se revierte el alta a mano (borrado compensatorio) para no
// dejar negocios huérfanos sin ningún dueño que pueda entrar a /panel.
export async function createPlatformBusiness(
  prisma: PrismaClient,
  ownerInviter: OwnerInviter,
  input: NewBusinessInput
): Promise<CreatePlatformBusinessResult> {
  if (!isValidNewBusinessInput(input)) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }

  const slug = input.slug.trim().toLowerCase();
  const ownerEmail = input.ownerEmail.trim();
  const businessEmail = input.businessEmail?.trim() || null;

  const existing = await prisma.business.findUnique({ where: { slug } });
  if (existing) {
    return { ok: false, reason: 'SLUG_TAKEN' };
  }

  let business: Business;
  try {
    business = await prisma.business.create({
      data: {
        slug,
        name: input.name.trim(),
        type: input.type,
        email: businessEmail,
        active: true,
      },
    });
  } catch (error) {
    // Carrera perdida: otra alta se llevó el mismo slug entre el
    // findUnique de arriba y este create (restricción única Business.slug).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'SLUG_TAKEN' };
    }
    throw error;
  }

  let invite: OwnerInvitationLink;
  try {
    invite = await ownerInviter.generateInviteLink(ownerEmail);
  } catch (error) {
    console.error('[admin] fallo al invitar al dueño, revirtiendo alta de negocio', { businessId: business.id, error });
    await prisma.business.delete({ where: { id: business.id } });
    return { ok: false, reason: 'OWNER_INVITE_FAILED' };
  }

  await prisma.membership.create({
    data: { userId: invite.userId, businessId: business.id, role: 'OWNER' },
  });

  return { ok: true, business, ownerUserId: invite.userId, invitationTokenHash: invite.hashedToken };
}

// Mismo criterio que setServiceActive/setEmployeeActive (Fase 5): claim
// atómico updateMany-scoped. Aquí no hay businessId de sesión que aplicar en
// el `where` (alcance de plataforma), pero sí se mantiene el patrón
// updateMany + comprobación de count por consistencia con el resto del
// proyecto, aunque no haya un "estado origen" que perder por carrera (es un
// booleano simple, cualquier orden de dos togglings concurrentes es
// aceptable: el último gana, igual que en setServiceActive).
export async function setPlatformBusinessActive(
  prisma: PrismaClient,
  businessId: string,
  active: boolean
): Promise<{ ok: true; business: Business } | { ok: false; reason: 'NOT_FOUND' }> {
  const claim = await prisma.business.updateMany({ where: { id: businessId }, data: { active } });
  if (claim.count === 0) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  return { ok: true, business };
}

export type ResendOwnerInvitationResult =
  | { ok: true; business: Business; ownerEmail: string; invitationTokenHash: string }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_COMPLETED' | 'BUSINESS_INACTIVE' | 'OWNER_INVITE_FAILED' };

// Recuperación manual para el caso límite documentado en CONTINUAR.md
// (verifyOtp con éxito pero updateUser falla justo después): reutiliza
// ownerInviter.generateInviteLink, el mismo mecanismo que el alta inicial,
// generando un hashed_token nuevo. ALREADY_COMPLETED se decide leyendo
// Membership.invitationCompletedAt en Postgres (fuente de verdad, ver
// owner-inviter.ts), no la Admin API de Supabase.
//
// BUSINESS_INACTIVE (decisión del usuario): un negocio suspendido no
// recibe reenvío. Si se permitiera, el dueño podría fijar contraseña y
// entrar por /panel/invitacion, pero requirePanelSession le bloquearía el
// acceso igualmente ("Este negocio está suspendido") — mismo criterio que
// ya se aplicó a los recordatorios de 24h de un negocio suspendido (Fase
// 6). Esta comprobación va ANTES de tocar el ownerInviter, para no generar
// un enlace de invitación (ni gastar la llamada a la Admin API) que nunca
// debería usarse.
export async function resendOwnerInvitation(
  prisma: PrismaClient,
  ownerInviter: OwnerInviter,
  businessId: string
): Promise<ResendOwnerInvitationResult> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  if (!business.active) {
    return { ok: false, reason: 'BUSINESS_INACTIVE' };
  }
  const membership = await prisma.membership.findFirst({ where: { businessId, role: 'OWNER' } });
  if (!membership) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  if (membership.invitationCompletedAt !== null) {
    return { ok: false, reason: 'ALREADY_COMPLETED' };
  }

  const ownerEmail = await ownerInviter.getOwnerEmail(membership.userId);
  if (!ownerEmail) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  try {
    const invite = await ownerInviter.generateInviteLink(ownerEmail);
    return { ok: true, business, ownerEmail, invitationTokenHash: invite.hashedToken };
  } catch (error) {
    console.error('[admin] fallo al reenviar la invitación al dueño', { businessId, error });
    return { ok: false, reason: 'OWNER_INVITE_FAILED' };
  }
}

// Resuelve el estado "¿el dueño ya completó su alta?" en una sola consulta
// a Postgres (Membership.invitationCompletedAt), sin tocar la Admin API de
// Supabase — evita hasta N llamadas de red por carga de /admin/negocios
// (ver owner-inviter.ts para el porqué completo). Fail-closed: si no se
// puede resolver el estado de un negocio (sin Membership OWNER) se trata
// como "completada", ocultando el botón de reenviar en vez de mostrar uno
// que fallaría.
export async function getOwnerInvitationCompletionMap(prisma: PrismaClient, businessIds: string[]): Promise<Map<string, boolean>> {
  const memberships = await prisma.membership.findMany({
    where: { businessId: { in: businessIds }, role: 'OWNER' },
    select: { businessId: true, invitationCompletedAt: true },
  });
  const map = new Map<string, boolean>();
  for (const membership of memberships) {
    map.set(membership.businessId, membership.invitationCompletedAt !== null);
  }
  for (const businessId of businessIds) {
    if (!map.has(businessId)) {
      map.set(businessId, true);
    }
  }
  return map;
}
