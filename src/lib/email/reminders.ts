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
    const result = await sendReminderEmail(emailSender, {
      appointment,
      service: appointment.service,
      employee: appointment.employee,
      business: appointment.business,
    });

    if (result.ok) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { reminderSentAt: now },
      });
      sent += 1;
    }
  }

  return { sent };
}
