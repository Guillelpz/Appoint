import type { PrismaClient, Appointment } from '@prisma/client';
import { PENDING_EXPIRY_MINUTES } from './active-appointments';
import { canTransition } from './state';

export type ConfirmAppointmentFailureReason = 'NOT_FOUND' | 'EXPIRED' | 'INVALID_STATE';

export type ConfirmAppointmentResult =
  | { ok: true; appointment: Appointment; pendingApproval: boolean }
  | { ok: false; reason: ConfirmAppointmentFailureReason };

export function isPendingAppointmentExpired(
  appointment: Pick<Appointment, 'createdAt'>,
  now: Date = new Date()
): boolean {
  // Misma convención canónica que activeAppointmentWhere: en el instante
  // exacto de los 30 minutos, ya está caducada (comparación >=, no >).
  const expiresAt = new Date(appointment.createdAt.getTime() + PENDING_EXPIRY_MINUTES * 60 * 1000);
  return now >= expiresAt;
}

export async function confirmAppointment(
  prisma: PrismaClient,
  token: string,
  now: Date = new Date()
): Promise<ConfirmAppointmentResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { confirmToken: token },
    include: { business: true },
  });

  if (!appointment) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  // Idempotencia: si el email ya se verificó antes (con o sin
  // manualApproval), un segundo click en el mismo enlace no debe volver a
  // evaluar la caducidad ni fallar — ya cumplió su función la primera vez.
  // Esto sustituye el caso especial que antes vivía en la página
  // /confirmar/{token} (comparar status === 'CONFIRMED' tras un
  // INVALID_STATE): con manualApproval el status nunca cambia a CONFIRMED
  // en este paso, así que ese caso especial ya no serviría.
  if (appointment.emailVerifiedAt) {
    return { ok: true, appointment, pendingApproval: appointment.business.manualApproval };
  }

  // Único estado con transición válida hacia CONFIRMED: PENDING. Cualquier
  // otro estado terminal (CANCELLED, COMPLETED, NO_SHOW) cae aquí como
  // INVALID_STATE.
  if (!canTransition(appointment.status, 'CONFIRMED')) {
    return { ok: false, reason: 'INVALID_STATE' };
  }

  if (isPendingAppointmentExpired(appointment, now)) {
    return { ok: false, reason: 'EXPIRED' };
  }

  // Sin manualApproval: confirmar por token es suficiente, la cita pasa a
  // CONFIRMED. Con manualApproval: confirmar por token solo fija
  // emailVerifiedAt (verifica que el email es del cliente real); la cita
  // sigue PENDING hasta que el negocio la apruebe manualmente (Fase 5).
  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: appointment.business.manualApproval
      ? { emailVerifiedAt: now }
      : { status: 'CONFIRMED', emailVerifiedAt: now },
  });

  return { ok: true, appointment: updated, pendingApproval: appointment.business.manualApproval };
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
