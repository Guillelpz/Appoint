import { describe, it, expect } from 'vitest';
import { prisma } from '../../test/prisma-client';
import {
  listPlatformBusinesses,
  createPlatformBusiness,
  setPlatformBusinessActive,
  type NewBusinessInput,
} from './platform-business-service';
import type { OwnerInviter, OwnerInvitationLink } from './owner-inviter';

class FakeOwnerInviter implements OwnerInviter {
  calls: string[] = [];
  async generateInviteLink(email: string): Promise<OwnerInvitationLink> {
    this.calls.push(email);
    return { userId: `fake-user-${email}`, hashedToken: `fake-token-${email}` };
  }
}

class FailingOwnerInviter implements OwnerInviter {
  async generateInviteLink(): Promise<OwnerInvitationLink> {
    throw new Error('fallo de red simulado');
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

    const list = await listPlatformBusinesses(prisma);

    expect(list.map((b) => b.id)).toEqual([second.business.id, first.business.id]);
  });
});
