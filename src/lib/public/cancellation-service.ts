import type { PrismaClient } from '@prisma/client';
import { cancelAppointment, type CancelAppointmentResult } from '@/lib/booking/tokens';
import { getEmailSender } from '@/lib/email/get-email-sender';
import type { EmailSender } from '@/lib/email/types';
import { sendCancellationConfirmationEmail, sendCancellationNoticeToBusinessEmail } from '@/lib/email/appointment-notifications';

export interface CancelPublicAppointmentInput {
  token: string;
  emailSender?: EmailSender;
}

export async function cancelPublicAppointment(
  prisma: PrismaClient,
  input: CancelPublicAppointmentInput
): Promise<CancelAppointmentResult> {
  // Se comprueba el estado ANTES de cancelar para no reenviar emails si la
  // cita ya estaba CANCELLED (cancelAppointment es idempotente y devuelve
  // ok:true en ambos casos, sin distinguirlos).
  const before = await prisma.appointment.findUnique({ where: { cancelToken: input.token } });
  const wasAlreadyCancelled = before?.status === 'CANCELLED';

  const result = await cancelAppointment(prisma, input.token);

  if (result.ok && !wasAlreadyCancelled) {
    const emailSender = input.emailSender ?? getEmailSender();
    const withRelations = await prisma.appointment.findUnique({
      where: { id: result.appointment.id },
      include: { service: true, employee: true, business: true },
    });

    if (withRelations) {
      const ctx = {
        appointment: withRelations,
        service: withRelations.service,
        employee: withRelations.employee,
        business: withRelations.business,
      };
      await sendCancellationConfirmationEmail(emailSender, ctx);
      await sendCancellationNoticeToBusinessEmail(emailSender, ctx);
    }
  }

  return result;
}
