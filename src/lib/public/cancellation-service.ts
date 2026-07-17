import type { PrismaClient } from '@prisma/client';
import { cancelAppointment, type CancelAppointmentResult } from '@/lib/booking/tokens';
import { CANCELLABLE_STATUSES } from '@/lib/booking/state';
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
  // Claim atómica: un único UPDATE condicionado por status decide, a nivel
  // de base de datos, qué invocación es la que realmente cancela la cita.
  // Esto es necesario porque un "leer estado, luego decidir si envío
  // email" no es seguro ante dos peticiones concurrentes sobre el mismo
  // token (doble click, doble pestaña): ambas leerían "todavía no
  // cancelada" antes de que la otra escriba, y las dos enviarían los
  // emails (duplicados). Con updateMany + where en status, solo una de las
  // dos consigue count === 1; la otra ve count === 0 y no envía nada.
  //
  // El where reutiliza CANCELLABLE_STATUSES (src/lib/booking/state.ts), que
  // replica exactamente las transiciones que canTransition() permite hacia
  // CANCELLED, para que ambas listas no puedan divergir. El token sigue
  // siendo el único selector (multi-tenant safe, igual que antes).
  const claim = await prisma.appointment.updateMany({
    where: { cancelToken: input.token, status: { in: [...CANCELLABLE_STATUSES] } },
    data: { status: 'CANCELLED' },
  });

  if (claim.count === 1) {
    // Esta invocación es la única responsable de la cancelación: solo ella
    // envía los dos emails.
    const withRelations = await prisma.appointment.findUnique({
      where: { cancelToken: input.token },
      include: { service: true, employee: true, business: true },
    });

    // No debería poder ser null (acabamos de actualizarla en esta misma
    // función), pero se comprueba de forma defensiva sin lanzar.
    if (withRelations) {
      const emailSender = input.emailSender ?? getEmailSender();
      const ctx = {
        appointment: withRelations,
        service: withRelations.service,
        employee: withRelations.employee,
        business: withRelations.business,
      };
      await sendCancellationConfirmationEmail(emailSender, ctx);
      await sendCancellationNoticeToBusinessEmail(emailSender, ctx);
      return { ok: true, appointment: withRelations };
    }
  }

  // claim.count === 0: esta invocación no ha cancelado nada. Puede deberse a
  // que el token no existe, a que la cita ya estaba CANCELLED (reintento /
  // doble click perdedor) o a que está en un estado no cancelable
  // (COMPLETED, NO_SHOW). Se delega en cancelAppointment (motor) solo para
  // clasificar el resultado exactamente igual que antes — no volverá a
  // escribir nada porque ninguna de esas transiciones es válida ni cambia
  // el estado, así que tampoco reenvía emails.
  return cancelAppointment(prisma, input.token);
}
