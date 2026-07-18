import type { PrismaClient } from '@prisma/client';
import { CANCELLABLE_STATUSES } from '@/lib/booking/state';
import { getEmailSender } from '@/lib/email/get-email-sender';
import type { EmailSender } from '@/lib/email/types';
import { sendAppointmentCancelledByBusinessEmail } from '@/lib/email/appointment-notifications';

export type CancelFromPanelFailureReason = 'NOT_FOUND';
export type CancelAppointmentFromPanelResult = { ok: true } | { ok: false; reason: CancelFromPanelFailureReason };

export interface CancelAppointmentFromPanelInput {
  businessId: string;
  appointmentId: string;
  emailSender?: EmailSender;
}

// Mismo patrón de claim atómico que cancelPublicAppointment
// (src/lib/public/cancellation-service.ts), reutilizando CANCELLABLE_STATUSES
// de state.ts en vez de duplicar la lista. Aquí el where añade además
// businessId: solo el dueño del negocio puede cancelar sus propias citas.
export async function cancelAppointmentFromPanel(
  prisma: PrismaClient,
  input: CancelAppointmentFromPanelInput
): Promise<CancelAppointmentFromPanelResult> {
  const claim = await prisma.appointment.updateMany({
    where: {
      id: input.appointmentId,
      businessId: input.businessId,
      status: { in: [...CANCELLABLE_STATUSES] },
    },
    data: { status: 'CANCELLED' },
  });

  if (claim.count === 0) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const withRelations = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    include: { service: true, employee: true, business: true },
  });

  if (withRelations) {
    const emailSender = input.emailSender ?? getEmailSender();
    await sendAppointmentCancelledByBusinessEmail(emailSender, {
      appointment: withRelations,
      service: withRelations.service,
      employee: withRelations.employee,
      business: withRelations.business,
    });
  }

  return { ok: true };
}
