import type { PrismaClient } from '@prisma/client';
import { getEmailSender } from '@/lib/email/get-email-sender';
import type { EmailSender } from '@/lib/email/types';
import { sendAppointmentApprovedEmail, sendAppointmentRejectedEmail } from '@/lib/email/appointment-notifications';

export type ApprovalFailureReason = 'NOT_FOUND';
export type ApprovalResult = { ok: true } | { ok: false; reason: ApprovalFailureReason };

export interface ApprovePendingAppointmentInput {
  businessId: string;
  appointmentId: string;
  emailSender?: EmailSender;
}

// Claim atómico: solo transiciona si la cita sigue businessId+PENDING en el
// mismo UPDATE (evita doble aprobación en doble click y evita tocar citas de
// otro negocio). manualApproval permite aprobar tanto si el cliente ya
// verificó su email como si no (decisión de producto: el negocio puede
// confirmar manualmente siempre), así que emailVerifiedAt no forma parte del
// where.
export async function approvePendingAppointment(
  prisma: PrismaClient,
  input: ApprovePendingAppointmentInput
): Promise<ApprovalResult> {
  const claim = await prisma.appointment.updateMany({
    where: { id: input.appointmentId, businessId: input.businessId, status: 'PENDING' },
    data: { status: 'CONFIRMED' },
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
    await sendAppointmentApprovedEmail(emailSender, {
      appointment: withRelations,
      service: withRelations.service,
      employee: withRelations.employee,
      business: withRelations.business,
    });
  }

  return { ok: true };
}

export interface RejectPendingAppointmentInput {
  businessId: string;
  appointmentId: string;
  emailSender?: EmailSender;
}

export async function rejectPendingAppointment(
  prisma: PrismaClient,
  input: RejectPendingAppointmentInput
): Promise<ApprovalResult> {
  const claim = await prisma.appointment.updateMany({
    where: { id: input.appointmentId, businessId: input.businessId, status: 'PENDING' },
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
    await sendAppointmentRejectedEmail(emailSender, {
      appointment: withRelations,
      service: withRelations.service,
      employee: withRelations.employee,
      business: withRelations.business,
    });
  }

  return { ok: true };
}
