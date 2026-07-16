import type { Prisma, PrismaClient } from '@prisma/client';

export const PENDING_EXPIRY_MINUTES = 30;

export function activeAppointmentWhere(now: Date): Prisma.AppointmentWhereInput {
  const pendingCutoff = new Date(now.getTime() - PENDING_EXPIRY_MINUTES * 60 * 1000);
  return {
    OR: [
      { status: 'CONFIRMED' },
      { status: 'PENDING', createdAt: { gt: pendingCutoff } },
      // Una PENDING con emailVerifiedAt fijado (el cliente ya confirmó el
      // email, pero el negocio tiene manualApproval activo y aún no ha
      // aprobado la cita) ya no caduca por tiempo: sigue bloqueando el
      // hueco indefinidamente hasta que el negocio decida (Fase 5).
      { status: 'PENDING', emailVerifiedAt: { not: null } },
    ],
  };
}

// Libera (cancela) las PENDING que ocupan un (employeeId, start) exacto y ya
// han caducado por tiempo. Se usa dentro de la transacción de
// createAppointment como red de seguridad ante el índice único parcial
// (employeeId, start) — ver el comentario en create-appointment.ts.
//
// Importante: excluye las PENDING con emailVerifiedAt fijado. Aunque hayan
// "caducado por tiempo" (createdAt antiguo), siguen bloqueando el hueco según
// activeAppointmentWhere de arriba (esperan aprobación del negocio, no
// caducidad), así que cancelarlas aquí sería un bug: liberaría un hueco que
// en realidad sigue ocupado.
export async function releaseExpiredPendingSlot(
  tx: Prisma.TransactionClient | PrismaClient,
  params: { employeeId: string; start: Date; now: Date }
): Promise<void> {
  const pendingCutoff = new Date(params.now.getTime() - PENDING_EXPIRY_MINUTES * 60 * 1000);
  await tx.appointment.updateMany({
    where: {
      employeeId: params.employeeId,
      start: params.start,
      status: 'PENDING',
      createdAt: { lte: pendingCutoff },
      emailVerifiedAt: null,
    },
    data: { status: 'CANCELLED' },
  });
}
