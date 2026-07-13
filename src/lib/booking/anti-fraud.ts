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

export interface CheckBlacklistParams {
  businessId: string;
  phone: string;
  email: string;
}

export async function checkBlacklist(prisma: PrismaClient, params: CheckBlacklistParams): Promise<boolean> {
  const entry = await prisma.blacklistEntry.findFirst({
    where: {
      businessId: params.businessId,
      OR: [{ phone: params.phone }, { email: params.email }],
    },
  });

  return entry === null;
}

export interface RecordBookingAttemptParams {
  businessId: string;
  ipAddress: string;
}

export async function recordBookingAttempt(
  prisma: PrismaClient,
  params: RecordBookingAttemptParams
): Promise<void> {
  await prisma.bookingAttempt.create({
    data: { businessId: params.businessId, ipAddress: params.ipAddress },
  });
}

export interface CheckRateLimitParams {
  businessId: string;
  ipAddress: string;
  now?: Date;
  maxAttemptsPerHour?: number;
}

export async function checkRateLimit(prisma: PrismaClient, params: CheckRateLimitParams): Promise<boolean> {
  const now = params.now ?? new Date();
  const maxAttemptsPerHour = params.maxAttemptsPerHour ?? 5;
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000);

  const count = await prisma.bookingAttempt.count({
    where: {
      businessId: params.businessId,
      ipAddress: params.ipAddress,
      createdAt: { gt: windowStart },
    },
  });

  return count < maxAttemptsPerHour;
}
