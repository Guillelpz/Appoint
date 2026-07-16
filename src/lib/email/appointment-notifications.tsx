import { formatAppointmentDateTime } from '@/lib/public/format-datetime';
import type { EmailMessage, EmailSender } from './types';
import { buildConfirmUrl, buildCancelUrl } from './urls';
import { BookingConfirmationEmail } from './templates/BookingConfirmationEmail';
import { BookingPendingApprovalEmail } from './templates/BookingPendingApprovalEmail';
import { NewPendingRequestEmail } from './templates/NewPendingRequestEmail';
import { CancellationConfirmationEmail } from './templates/CancellationConfirmationEmail';
import { CancellationNoticeToBusinessEmail } from './templates/CancellationNoticeToBusinessEmail';
import { ReminderEmail } from './templates/ReminderEmail';

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

export async function sendCancellationConfirmationEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  const message: EmailMessage = {
    to: ctx.appointment.customerEmail,
    subject: `Tu cita en ${ctx.business.name} ha sido cancelada`,
    react: (
      <CancellationConfirmationEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
      />
    ),
  };

  return trySend(emailSender, message);
}

export async function sendCancellationNoticeToBusinessEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  if (!ctx.business.email) {
    console.warn('[email] el negocio no tiene email configurado, no se envía aviso de cancelación', {
      businessName: ctx.business.name,
    });
    return { ok: false };
  }

  const message: EmailMessage = {
    to: ctx.business.email,
    subject: 'Un cliente ha cancelado su cita',
    react: (
      <CancellationNoticeToBusinessEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        customerPhone={ctx.appointment.customerPhone}
        customerEmail={ctx.appointment.customerEmail}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
      />
    ),
  };

  return trySend(emailSender, message);
}

export async function sendReminderEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  const message: EmailMessage = {
    to: ctx.appointment.customerEmail,
    subject: `Recordatorio: tu cita en ${ctx.business.name} es mañana`,
    react: (
      <ReminderEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
        cancelUrl={buildCancelUrl(ctx.appointment.cancelToken)}
      />
    ),
  };

  return trySend(emailSender, message);
}

export async function sendNewPendingRequestEmail(
  emailSender: EmailSender,
  ctx: AppointmentEmailContext
): Promise<{ ok: boolean }> {
  if (!ctx.business.email) {
    console.warn('[email] el negocio no tiene email configurado, no se envía aviso de nueva solicitud', {
      businessName: ctx.business.name,
    });
    return { ok: false };
  }

  const message: EmailMessage = {
    to: ctx.business.email,
    subject: 'Nueva solicitud de cita pendiente de aprobación',
    react: (
      <NewPendingRequestEmail
        businessName={ctx.business.name}
        accentColor={ctx.business.accentColor}
        logoUrl={ctx.business.logoUrl}
        customerName={ctx.appointment.customerName}
        customerPhone={ctx.appointment.customerPhone}
        customerEmail={ctx.appointment.customerEmail}
        serviceName={ctx.service.name}
        employeeName={ctx.employee.name}
        startLabel={formatAppointmentDateTime(ctx.appointment.start)}
      />
    ),
  };

  return trySend(emailSender, message);
}
