import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import {
  listPlatformBusinesses,
  createPlatformBusiness,
  setPlatformBusinessActive,
  resendOwnerInvitation,
  getOwnerInvitationCompletionMap,
  type NewBusinessInput,
} from './platform-business-service';
import type { OwnerInviter, OwnerInvitationLink } from './owner-inviter';

// La "completación" de la invitación ya no depende del Fake: vive en
// Postgres (Membership.invitationCompletedAt), así que los tests la mueven
// directamente con prisma.membership.updateMany. El Fake solo simula lo que
// OwnerInviter todavía hace: generar enlaces y resolver el email de un
// userId (usado exclusivamente en el reenvío).
class FakeOwnerInviter implements OwnerInviter {
  calls: string[] = [];
  emailsByUserId = new Map<string, string>();

  async generateInviteLink(email: string): Promise<OwnerInvitationLink> {
    this.calls.push(email);
    const userId = `fake-user-${email}`;
    this.emailsByUserId.set(userId, email);
    return { userId, hashedToken: `fake-token-${email}` };
  }

  async getOwnerEmail(userId: string): Promise<string | null> {
    return this.emailsByUserId.get(userId) ?? null;
  }
}

class FailingOwnerInviter implements OwnerInviter {
  async generateInviteLink(): Promise<OwnerInvitationLink> {
    throw new Error('fallo de red simulado');
  }

  async getOwnerEmail(): Promise<string | null> {
    return null;
  }
}

const VALID_INPUT: NewBusinessInput = {
  name: 'Barbería Ejemplo',
  slug: 'barberia-ejemplo',
  type: 'BARBERSHOP',
  businessEmail: 'contacto@barberia-ejemplo.example',
  ownerEmail: 'dueno@barberia-ejemplo.example',
};

describe('createPlatformBusiness', () => {
  it('crea el negocio, invita al dueño (no al email de contacto) y crea su Membership OWNER', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, VALID_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('esperaba ok:true');
    expect(result.business.slug).toBe('barberia-ejemplo');
    expect(result.business.active).toBe(true);
    expect(result.business.email).toBe('contacto@barberia-ejemplo.example');
    expect(inviter.calls).toEqual(['dueno@barberia-ejemplo.example']);

    const membership = await prisma.membership.findFirst({
      where: { businessId: result.business.id, role: 'OWNER' },
    });
    expect(membership?.userId).toBe(result.ownerUserId);
  });

  it('acepta businessEmail nulo: el email de contacto del negocio es opcional', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, { ...VALID_INPUT, businessEmail: null });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('esperaba ok:true');
    expect(result.business.email).toBeNull();
    expect(inviter.calls).toEqual(['dueno@barberia-ejemplo.example']);
  });

  it('normaliza el slug a minúsculas y recorta espacios en nombre/ambos emails', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, {
      ...VALID_INPUT,
      name: '  Barbería Ejemplo  ',
      slug: 'Barberia-Ejemplo',
      businessEmail: '  contacto@barberia-ejemplo.example  ',
      ownerEmail: '  dueno@barberia-ejemplo.example  ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('esperaba ok:true');
    expect(result.business.slug).toBe('barberia-ejemplo');
    expect(result.business.name).toBe('Barbería Ejemplo');
    expect(result.business.email).toBe('contacto@barberia-ejemplo.example');
    expect(inviter.calls).toEqual(['dueno@barberia-ejemplo.example']);
  });

  it('devuelve INVALID_INPUT si el slug tiene espacios o mayúsculas no normalizables', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, { ...VALID_INPUT, slug: 'Slug Con Espacios' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
    expect(inviter.calls).toHaveLength(0);
  });

  it('devuelve INVALID_INPUT si el slug es una ruta reservada de la app', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, { ...VALID_INPUT, slug: 'admin' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT si el email del dueño no es válido', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, { ...VALID_INPUT, ownerEmail: 'no-es-un-email' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
    expect(inviter.calls).toHaveLength(0);
  });

  it('devuelve INVALID_INPUT si el email de contacto no es válido cuando se indica', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, { ...VALID_INPUT, businessEmail: 'no-es-un-email' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_INPUT' });
  });

  it('devuelve SLUG_TAKEN si el slug ya existe', async () => {
    const inviter = new FakeOwnerInviter();
    await createPlatformBusiness(prisma, inviter, VALID_INPUT);

    const result = await createPlatformBusiness(prisma, inviter, VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'SLUG_TAKEN' });
  });

  it('revierte el alta del negocio si falla la invitación al dueño (sin dejarlo huérfano)', async () => {
    const inviter = new FailingOwnerInviter();

    const result = await createPlatformBusiness(prisma, inviter, VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'OWNER_INVITE_FAILED' });
    const business = await prisma.business.findUnique({ where: { slug: VALID_INPUT.slug } });
    expect(business).toBeNull();
  });
});

describe('setPlatformBusinessActive', () => {
  it('activa/suspende el negocio indicado', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');

    const suspended = await setPlatformBusinessActive(prisma, created.business.id, false);

    expect(suspended.ok).toBe(true);
    if (!suspended.ok) throw new Error('esperaba ok:true');
    expect(suspended.business.active).toBe(false);
  });

  it('devuelve NOT_FOUND si el negocio no existe', async () => {
    const result = await setPlatformBusinessActive(prisma, 'negocio-inexistente', false);
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('listPlatformBusinesses', () => {
  it('lista los negocios ordenados por fecha de alta descendente', async () => {
    const inviter = new FakeOwnerInviter();
    const first = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    const second = await createPlatformBusiness(prisma, inviter, {
      ...VALID_INPUT,
      slug: 'otro-negocio',
      businessEmail: 'otro-contacto@example.com',
      ownerEmail: 'otro-dueno@example.com',
    });
    if (!first.ok || !second.ok) throw new Error('esperaba ok:true');

    const result = await listPlatformBusinesses(prisma);

    expect(result.items.map((b) => b.id)).toEqual([second.business.id, first.business.id]);
  });

  it('pagina de 20 en 20 y calcula hasNextPage/hasPreviousPage', async () => {
    const inviter = new FakeOwnerInviter();
    const before = await prisma.business.count();
    for (let i = 0; i < 25; i++) {
      await createPlatformBusiness(prisma, inviter, {
        ...VALID_INPUT,
        slug: `negocio-paginado-${i}`,
        businessEmail: null,
        ownerEmail: `dueno-paginado-${i}@example.com`,
      });
    }
    const total = before + 25;

    const page1 = await listPlatformBusinesses(prisma, 1);
    expect(page1.items).toHaveLength(20);
    expect(page1.hasPreviousPage).toBe(false);
    expect(page1.hasNextPage).toBe(true);

    const lastPage = Math.ceil(total / 20);
    const pageLast = await listPlatformBusinesses(prisma, lastPage);
    expect(pageLast.hasNextPage).toBe(false);
    expect(pageLast.hasPreviousPage).toBe(true);
  });
});

describe('resendOwnerInvitation', () => {
  it('reenvía la invitación si el dueño no ha completado el alta', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');
    inviter.calls = [];

    const result = await resendOwnerInvitation(prisma, inviter, created.business.id);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('esperaba ok:true');
    expect(result.ownerEmail).toBe(VALID_INPUT.ownerEmail);
    expect(inviter.calls).toEqual([VALID_INPUT.ownerEmail]);
  });

  it('devuelve ALREADY_COMPLETED si la membership ya está marcada como completada en la BD', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');
    await prisma.membership.updateMany({
      where: { businessId: created.business.id, role: 'OWNER' },
      data: { invitationCompletedAt: new Date() },
    });

    const result = await resendOwnerInvitation(prisma, inviter, created.business.id);

    expect(result).toEqual({ ok: false, reason: 'ALREADY_COMPLETED' });
  });

  it('devuelve NOT_FOUND si el negocio no existe', async () => {
    const inviter = new FakeOwnerInviter();

    const result = await resendOwnerInvitation(prisma, inviter, 'negocio-inexistente');

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('devuelve BUSINESS_INACTIVE si el negocio está suspendido, y no llama al inviter', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');
    await prisma.business.update({ where: { id: created.business.id }, data: { active: false } });
    inviter.calls = [];

    const result = await resendOwnerInvitation(prisma, inviter, created.business.id);

    expect(result).toEqual({ ok: false, reason: 'BUSINESS_INACTIVE' });
    expect(inviter.calls).toHaveLength(0);
  });

  it('devuelve OWNER_INVITE_FAILED si el reenvío falla', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');
    const failingInviter: OwnerInviter = {
      generateInviteLink: async () => {
        throw new Error('fallo de red simulado');
      },
      getOwnerEmail: () => inviter.getOwnerEmail(created.ownerUserId),
    };

    const result = await resendOwnerInvitation(prisma, failingInviter, created.business.id);

    expect(result).toEqual({ ok: false, reason: 'OWNER_INVITE_FAILED' });
  });
});

describe('getOwnerInvitationCompletionMap', () => {
  it('un negocio recién creado por createPlatformBusiness queda pendiente (false)', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');

    const map = await getOwnerInvitationCompletionMap(prisma, [created.business.id]);

    expect(map.get(created.business.id)).toBe(false);
  });

  it('devuelve true cuando la membership OWNER tiene invitationCompletedAt', async () => {
    const inviter = new FakeOwnerInviter();
    const created = await createPlatformBusiness(prisma, inviter, VALID_INPUT);
    if (!created.ok) throw new Error('esperaba ok:true');
    await prisma.membership.updateMany({
      where: { businessId: created.business.id, role: 'OWNER' },
      data: { invitationCompletedAt: new Date() },
    });

    const map = await getOwnerInvitationCompletionMap(prisma, [created.business.id]);

    expect(map.get(created.business.id)).toBe(true);
  });

  it('trata como completada (oculta el botón) si el negocio no tiene Membership OWNER', async () => {
    const business = await prisma.business.create({
      data: { slug: 'negocio-sin-membership-owner', name: 'Negocio sin membership' },
    });

    const map = await getOwnerInvitationCompletionMap(prisma, [business.id]);

    expect(map.get(business.id)).toBe(true);
  });
});
