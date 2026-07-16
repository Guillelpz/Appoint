import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import type { EmailMessage, EmailSender } from './types';
import { buildConfirmUrl } from './urls';
import { BookingConfirmationEmail } from './templates/BookingConfirmationEmail';
import { BookingPendingApprovalEmail } from './templates/BookingPendingApprovalEmail';

export interface AppointmentEmailAppointment {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  confirmToken: string;
  cancelToken: string;
  start: Date;
}

export interface AppointmentEmailService {
  name: string;
}

export interface AppointmentEmailEmployee {
  name: string;
}

export interface AppointmentEmailBusiness {
  name: string;
  email: string | null;
  accentColor: string;
  logoUrl: string | null;
}

export interface AppointmentEmailContext {
  appointment: AppointmentEmailAppointment;
  service: AppointmentEmailService;
  employee: AppointmentEmailEmployee;
  business: AppointmentEmailBusiness;
}

// Envuelve emailSender.send en un try/catch común: ninguna función
// sendXEmail de este archivo lanza nunca. Un fallo de envío se registra en
// consola y se refleja como { ok: false }, pero no rompe el flujo que la
// invoca (reserva o cancelación ya han tenido éxito antes de llegar aquí).
async function trySend(emailSender: EmailSender, message: EmailMessage): Promise<{ ok: boolean }> {
  try {
    await emailSender.send(message);
    return { ok: true };
  } catch (error) {
    console.error('[email] fallo al enviar', { to: message.to, subject: message.subject, error });
    return { ok: false };
  }
}

export async function sendBookingConfirmationEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  const message: EmailMessage = {
    to: ctx.appointment.customerEmail,
    subject: `Confirma tu cita en ${ctx.business.name}`,
    react: (
      <BookingConfirmationEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
        confirmUrl={buildConfirmUrl(ctx.appointment.confirmToken)}
      />
    ),
  };

  return trySend(emailSender, message);
}

export async function sendBookingPendingApprovalEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  const message: EmailMessage = {
    to: ctx.appointment.customerEmail,
    subject: `Confirma tu email — tu solicitud en ${ctx.business.name} está pendiente de aprobación`,
    react: (
      <BookingPendingApprovalEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
        confirmUrl={buildConfirmUrl(ctx.appointment.confirmToken)}
      />
    ),
  };

  return trySend(emailSender, message);
}
