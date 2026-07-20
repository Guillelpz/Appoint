import type { PrismaClient, Service } from '@prisma/client';

export interface ServiceInput {
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  bufferAfterMinutes: number;
  active: boolean;
  sortOrder: number;
}

export type ServiceMutationResult = { ok: true; service: Service } | { ok: false; reason: 'INVALID_INPUT' | 'NOT_FOUND' };

function isValidServiceInput(input: ServiceInput): boolean {
  const name = input.name.trim();
  return (
    name.length > 0 &&
    name.length <= 120 &&
    Number.isInteger(input.durationMinutes) &&
    input.durationMinutes > 0 &&
    input.durationMinutes <= 600 &&
    Number.isInteger(input.priceCents) &&
    input.priceCents >= 0 &&
    Number.isInteger(input.bufferAfterMinutes) &&
    input.bufferAfterMinutes >= 0 &&
    input.bufferAfterMinutes <= 240 &&
    Number.isInteger(input.sortOrder)
  );
}

export async function listServicesForBusiness(prisma: PrismaClient, businessId: string): Promise<Service[]> {
  return prisma.service.findMany({ where: { businessId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}

export async function createServiceForBusiness(
  prisma: PrismaClient,
  businessId: string,
  input: ServiceInput
): Promise<ServiceMutationResult> {
  if (!isValidServiceInput(input)) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  const service = await prisma.service.create({
    data: {
      businessId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      durationMinutes: input.durationMinutes,
      priceCents: input.priceCents,
      bufferAfterMinutes: input.bufferAfterMinutes,
      active: input.active,
      sortOrder: input.sortOrder,
    },
  });
  return { ok: true, service };
}

export async function updateServiceForBusiness(
  prisma: PrismaClient,
  businessId: string,
  serviceId: string,
  input: ServiceInput
): Promise<ServiceMutationResult> {
  if (!isValidServiceInput(input)) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  const claim = await prisma.service.updateMany({
    where: { id: serviceId, businessId },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      durationMinutes: input.durationMinutes,
      priceCents: input.priceCents,
      bufferAfterMinutes: input.bufferAfterMinutes,
      active: input.active,
      sortOrder: input.sortOrder,
    },
  });
  if (claim.count === 0) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  return { ok: true, service };
}

export async function setServiceActive(
  prisma: PrismaClient,
  businessId: string,
  serviceId: string,
  active: boolean
): Promise<{ ok: true; service: Service } | { ok: false; reason: 'NOT_FOUND' }> {
  const claim = await prisma.service.updateMany({ where: { id: serviceId, businessId }, data: { active } });
  if (claim.count === 0) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  return { ok: true, service };
}
