import type { PrismaClient } from '@prisma/client';
import { activeAppointmentWhere } from './active-appointments';

export interface CheckActiveAppointmentLimitParams {
  businessId: string;
  phone: string;
  email: string;
  now?: Date;
  maxActive?: number;
}

export async function checkActiveAppointmentLimit(
  prisma: PrismaClient,
  params: CheckActiveAppointmentLimitParams
): Promise<boolean> {
  const now = params.now ?? new Date();
  const maxActive = params.maxActive ?? 2;

  const count = await prisma.appointment.count({
    where: {
      businessId: params.businessId,
      AND: [
        { OR: [{ customerPhone: params.phone }, { customerEmail: params.email }] },
        activeAppointmentWhere(now),
      ],
    },
  });

  return count < maxActive;
}

export interface CheckNoOverlapForCustomerParams {
  businessId: string;
  phone: string;
  email: string;
  start: Date;
  end: Date;
  now?: Date;
}

export async function checkNoOverlapForCustomer(
  prisma: PrismaClient,
  params: CheckNoOverlapForCustomerParams
): Promise<boolean> {
  const now = params.now ?? new Date();

  const overlapping = await prisma.appointment.findFirst({
    where: {
      businessId: params.businessId,
      AND: [
        { OR: [{ customerPhone: params.phone }, { customerEmail: params.email }] },
        activeAppointmentWhere(now),
        { start: { lt: params.end } },
        { end: { gt: params.start } },
      ],
    },
  });

  return overlapping === null;
}
