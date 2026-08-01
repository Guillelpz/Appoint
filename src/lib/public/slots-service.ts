import type { PrismaClient } from '@prisma/client';
import { getAvailableSlots, type AvailableSlot } from '@/lib/booking/slots';
import { dedupeSlotsByStart, type DedupedSlot } from './dedupe-slots';

export interface GetAvailableSlotsForBusinessInput {
  slug: string;
  serviceId: string;
  employeeId?: string;
  dateFrom: string;
  dateTo: string;
  now?: Date;
}

export async function getAvailableSlotsForBusiness(
  prisma: PrismaClient,
  input: GetAvailableSlotsForBusinessInput
): Promise<AvailableSlot[]> {
  const business = await prisma.business.findUnique({ where: { slug: input.slug } });
  if (!business || !business.active) {
    return [];
  }

  return getAvailableSlots(prisma, {
    businessId: business.id,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    now: input.now,
    business,
  });
}

export async function getDedupedAvailableSlotsForBusiness(
  prisma: PrismaClient,
  input: GetAvailableSlotsForBusinessInput
): Promise<DedupedSlot[]> {
  const slots = await getAvailableSlotsForBusiness(prisma, input);
  return dedupeSlotsByStart(slots);
}
