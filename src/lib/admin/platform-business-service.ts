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
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_COMPLETED' | 'OWNER_INVITE_FAILED' };

// Recuperación manual para el caso límite documentado en CONTINUAR.md
// (verifyOtp con éxito pero updateUser falla justo después): reutiliza
// ownerInviter.generateInviteLink, el mismo mecanismo que el alta inicial,
// generando un hashed_token nuevo. `getInvitationStatus` es quien decide si
// procede (ALREADY_COMPLETED si el dueño ya fijó su contraseña).
export async function resendOwnerInvitation(
  prisma: PrismaClient,
  ownerInviter: OwnerInviter,
  businessId: string
): Promise<ResendOwnerInvitationResult> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  const membership = await prisma.membership.findFirst({ where: { businessId, role: 'OWNER' } });
  if (!membership) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  const status = await ownerInviter.getInvitationStatus(membership.userId);
  if (!status) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  if (status.completed) {
    return { ok: false, reason: 'ALREADY_COMPLETED' };
  }

  try {
    const invite = await ownerInviter.generateInviteLink(status.email);
    return { ok: true, business, ownerEmail: status.email, invitationTokenHash: invite.hashedToken };
  } catch (error) {
    console.error('[admin] fallo al reenviar la invitación al dueño', { businessId, error });
    return { ok: false, reason: 'OWNER_INVITE_FAILED' };
  }
}

// Si no se puede resolver el estado de un negocio (sin Membership OWNER, o
// la Admin API no devuelve el usuario) se trata como "completada": oculta
// el botón de reenviar en vez de mostrarlo para un caso que no se sabe
// arreglar desde la UI (evita un botón que siempre fallaría).
export async function getOwnerInvitationCompletionMap(
  prisma: PrismaClient,
  ownerInviter: OwnerInviter,
  businessIds: string[]
): Promise<Map<string, boolean>> {
  const memberships = await prisma.membership.findMany({
    where: { businessId: { in: businessIds }, role: 'OWNER' },
  });
  const entries = await Promise.all(
    memberships.map(async (membership) => {
      const status = await ownerInviter.getInvitationStatus(membership.userId);
      return [membership.businessId, status?.completed ?? true] as const;
    })
  );
  const map = new Map(entries);
  for (const businessId of businessIds) {
    if (!map.has(businessId)) {
      map.set(businessId, true);
    }
  }
  return map;
}
