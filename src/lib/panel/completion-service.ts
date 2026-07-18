import type { PrismaClient } from '@prisma/client';

export type CompletionFailureReason = 'NOT_FOUND';
export type CompletionResult = { ok: true } | { ok: false; reason: CompletionFailureReason };

// Sin envío de email: la spec no lo exige para completar/no-show. Sin claim
// atómico "de doble click" tampoco hace falta aquí en el mismo sentido que
// aprobar/rechazar/cancelar (esas sí lo necesitan porque disparan un email;
// completar/no-show son idempotentes en la práctica porque, tras la primera
// transición, la cita deja de estar CONFIRMED y el segundo click —mismo
// where— simplemente no encuentra nada que actualizar).
export async function completeAppointmentFromPanel(
  prisma: PrismaClient,
  params: { businessId: string; appointmentId: string }
): Promise<CompletionResult> {
  const claim = await prisma.appointment.updateMany({
    where: { id: params.appointmentId, businessId: params.businessId, status: 'CONFIRMED' },
    data: { status: 'COMPLETED' },
  });
  return claim.count === 1 ? { ok: true } : { ok: false, reason: 'NOT_FOUND' };
}

export async function markNoShowFromPanel(
  prisma: PrismaClient,
  params: { businessId: string; appointmentId: string }
): Promise<CompletionResult> {
  const claim = await prisma.appointment.updateMany({
    where: { id: params.appointmentId, businessId: params.businessId, status: 'CONFIRMED' },
    data: { status: 'NO_SHOW' },
  });
  return claim.count === 1 ? { ok: true } : { ok: false, reason: 'NOT_FOUND' };
}
