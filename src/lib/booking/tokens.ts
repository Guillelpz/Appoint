import type { PrismaClient, Appointment } from '@prisma/client';
import { PENDING_EXPIRY_MINUTES } from './active-appointments';

export type ConfirmAppointmentFailureReason = 'NOT_FOUND' | 'EXPIRED' | 'INVALID_STATE';

export type ConfirmAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: ConfirmAppointmentFailureReason };

export async function confirmAppointment(
  prisma: PrismaClient,
  token: string,
  now: Date = new Date()
): Promise<ConfirmAppointmentResult> {
  const appointment = await prisma.appointment.findUnique({ where: { confirmToken: token } });

  if (!appointment) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (appointment.status !== 'PENDING') {
    return { ok: false, reason: 'INVALID_STATE' };
  }

  const expiresAt = new Date(appointment.createdAt.getTime() + PENDING_EXPIRY_MINUTES * 60 * 1000);
  if (now > expiresAt) {
    return { ok: false, reason: 'EXPIRED' };
  }

  const confirmed = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'CONFIRMED' },
  });

  return { ok: true, appointment: confirmed };
}

export type CancelAppointmentFailureReason = 'NOT_FOUND' | 'INVALID_STATE';

export type CancelAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: CancelAppointmentFailureReason };

export async function cancelAppointment(prisma: PrismaClient, token: string): Promise<CancelAppointmentResult> {
  const appointment = await prisma.appointment.findUnique({ where: { cancelToken: token } });

  if (!appointment) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (appointment.status === 'CANCELLED') {
    return { ok: true, appointment };
  }

  if (appointment.status === 'COMPLETED' || appointment.status === 'NO_SHOW') {
    return { ok: false, reason: 'INVALID_STATE' };
  }

  const cancelled = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'CANCELLED' },
  });

  return { ok: true, appointment: cancelled };
}
