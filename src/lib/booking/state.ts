import type { PrismaClient, Appointment, AppointmentStatus } from '@prisma/client';

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// Estados desde los que se puede transicionar a CANCELLED, derivados de
// ALLOWED_TRANSITIONS. Se exporta para que el claim atómico de
// cancellation-service.ts reutilice exactamente esta lista en su `where` en
// vez de mantener una copia manual que podría divergir de esta tabla.
export const CANCELLABLE_STATUSES = (Object.keys(ALLOWED_TRANSITIONS) as AppointmentStatus[]).filter((status) =>
  ALLOWED_TRANSITIONS[status].includes('CANCELLED')
) as readonly AppointmentStatus[];

export type TransitionAppointmentFailureReason = 'NOT_FOUND' | 'INVALID_TRANSITION';

export type TransitionAppointmentResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; reason: TransitionAppointmentFailureReason };

async function transitionAppointment(
  prisma: PrismaClient,
  appointmentId: string,
  to: AppointmentStatus
): Promise<TransitionAppointmentResult> {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });

  if (!appointment) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (!canTransition(appointment.status, to)) {
    return { ok: false, reason: 'INVALID_TRANSITION' };
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: to },
  });

  return { ok: true, appointment: updated };
}

export async function completeAppointment(
  prisma: PrismaClient,
  appointmentId: string
): Promise<TransitionAppointmentResult> {
  return transitionAppointment(prisma, appointmentId, 'COMPLETED');
}

export async function markNoShow(
  prisma: PrismaClient,
  appointmentId: string
): Promise<TransitionAppointmentResult> {
  return transitionAppointment(prisma, appointmentId, 'NO_SHOW');
}
