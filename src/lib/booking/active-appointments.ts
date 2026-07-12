import type { Prisma } from '@prisma/client';

export const PENDING_EXPIRY_MINUTES = 30;

export function activeAppointmentWhere(now: Date): Prisma.AppointmentWhereInput {
  const pendingCutoff = new Date(now.getTime() - PENDING_EXPIRY_MINUTES * 60 * 1000);
  return {
    OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', createdAt: { gt: pendingCutoff } }],
  };
}
