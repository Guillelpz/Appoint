import type { PrismaClient } from '@prisma/client';
import { getEmailSender } from './get-email-sender';
import type { EmailSender } from './types';
import { sendReminderEmail } from './appointment-notifications';

const REMINDER_WINDOW_START_HOURS = 24;
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
    const claim = await prisma.appointment.updateMany({
      where: { id: appointment.id, reminderSentAt: null },
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
