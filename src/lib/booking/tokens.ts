import type { PrismaClient, Appointment } from '@prisma/client';
import { PENDING_EXPIRY_MINUTES } from './active-appointments';
import { canTransition } from './state';

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

  // Único estado con transición válida hacia CONFIRMED: PENDING. Cualquier
  // otro estado (incluido el propio CONFIRMED) cae aquí como INVALID_STATE,
  // igual que con el guard manual anterior.
  if (!canTransition(appointment.status, 'CONFIRMED')) {
    return { ok: false, reason: 'INVALID_STATE' };
  }

  // Convención canónica de caducidad (ver activeAppointmentWhere en
  // active-appointments.ts): createdAt > now-30min ⇒ activa; en el instante
  // exacto de los 30 minutos, ya está caducada.
  const expiresAt = new Date(appointment.createdAt.getTime() + PENDING_EXPIRY_MINUTES * 60 * 1000);
  if (now >= expiresAt) {
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

  // Cancelar una cita ya CANCELLED es idempotente: CANCELLED -> CANCELLED no
  // es una transición válida en la máquina de estados, así que se
  // comprueba aparte antes de delegar en canTransition.
  if (appointment.status === 'CANCELLED') {
    return { ok: true, appointment };
  }

  if (!canTransition(appointment.status, 'CANCELLED')) {
    return { ok: false, reason: 'INVALID_STATE' };
  }

  const cancelled = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'CANCELLED' },
  });

  return { ok: true, appointment: cancelled };
}
