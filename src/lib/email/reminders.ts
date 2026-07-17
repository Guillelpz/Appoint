import type { PrismaClient } from '@prisma/client';
import { getEmailSender } from './get-email-sender';
import type { EmailSender } from './types';
import { sendReminderEmail } from './appointment-notifications';

// Ventana ampliada a 2h (en vez de 1h) a propósito: si una ejecución horaria
// del cron falla o se salta, la siguiente pasada (una hora después) todavía
// encuentra la cita dentro de la ventana y la recupera. El claim atómico con
// reminderSentAt: null en el where hace que el solapamiento entre pasadas sea
// seguro (a lo sumo un envío por cita).
const REMINDER_WINDOW_START_HOURS = 23;
const REMINDER_WINDOW_END_HOURS = 25;

export interface SendDueRemindersParams {
  now?: Date;
  emailSender?: EmailSender;
}

export interface SendDueRemindersResult {
  sent: number;
}

export async function sendDueReminders(
  prisma: PrismaClient,
  params: SendDueRemindersParams = {}
): Promise<SendDueRemindersResult> {
  const now = params.now ?? new Date();
  const emailSender = params.emailSender ?? getEmailSender();

  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_START_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_END_HOURS * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: 'CONFIRMED',
      start: { gte: windowStart, lt: windowEnd },
      reminderSentAt: null,
    },
    include: { service: true, employee: true, business: true },
  });

  let sent = 0;
  for (const appointment of appointments) {
    // Reclama la cita de forma atómica ANTES de enviar el email: si otra
    // ejecución del cron se solapa (misma cita seleccionada por ambas antes
    // de que ninguna la marque), este updateMany con reminderSentAt: null en
    // el where hace que como mucho una de las dos consiga count === 1. La
    // otra ve count === 0 y la salta, evitando el envío duplicado.
    //
    // status: 'CONFIRMED' también se repite aquí (no solo en el findMany de
    // arriba) porque entre la selección y este claim la cita podría haberse
    // cancelado (p. ej. el cliente cancela justo en ese intervalo); sin este
    // filtro el claim tendría éxito igualmente y se enviaría un recordatorio
    // a una cita ya cancelada.
    const claim = await prisma.appointment.updateMany({
      where: { id: appointment.id, status: 'CONFIRMED', reminderSentAt: null },
      data: { reminderSentAt: now },
    });

    if (claim.count === 0) {
      continue;
    }

    const result = await sendReminderEmail(emailSender, {
      appointment,
      service: appointment.service,
      employee: appointment.employee,
      business: appointment.business,
    });

    if (result.ok) {
      sent += 1;
    } else {
      // El envío falló: la cita no debe quedar marcada como recordada, así
      // que revertimos la marca puesta al reclamarla. Best-effort: si este
      // revert también fallara, la cita quedaría marcada sin haberse
      // enviado el email realmente (caso extremo aceptado; se detectaría y
      // reintentaría manualmente).
      try {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { reminderSentAt: null },
        });
      } catch (error) {
        console.error('[reminders] no se pudo revertir reminderSentAt tras un envío fallido', {
          appointmentId: appointment.id,
          error,
        });
      }
    }
  }

  return { sent };
}
