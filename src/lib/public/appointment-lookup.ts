import type { PrismaClient } from '@prisma/client';

export interface PublicAppointmentSummary {
  id: string;
  status: string;
  start: Date;
  end: Date;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  customerName: string;
  serviceName: string;
  employeeName: string;
  businessName: string;
  businessSlug: string;
  cancelToken: string;
  confirmToken: string;
}

interface RawAppointment {
  id: string;
  status: string;
  start: Date;
  end: Date;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  customerName: string;
  cancelToken: string;
  confirmToken: string;
  service: { name: string };
  employee: { name: string };
  business: { name: string; slug: string };
}

function toSummary(appointment: RawAppointment): PublicAppointmentSummary {
  return {
    id: appointment.id,
    status: appointment.status,
    start: appointment.start,
    end: appointment.end,
    createdAt: appointment.createdAt,
    emailVerifiedAt: appointment.emailVerifiedAt,
    customerName: appointment.customerName,
    serviceName: appointment.service.name,
    employeeName: appointment.employee.name,
    businessName: appointment.business.name,
    businessSlug: appointment.business.slug,
    cancelToken: appointment.cancelToken,
    confirmToken: appointment.confirmToken,
  };
}

export async function getAppointmentByConfirmToken(
  prisma: PrismaClient,
  token: string
): Promise<PublicAppointmentSummary | null> {
  const appointment = await prisma.appointment.findUnique({
    where: { confirmToken: token },
    include: { service: true, employee: true, business: true },
  });
  return appointment ? toSummary(appointment) : null;
}

export async function getAppointmentByCancelToken(
  prisma: PrismaClient,
  token: string
): Promise<PublicAppointmentSummary | null> {
  const appointment = await prisma.appointment.findUnique({
    where: { cancelToken: token },
    include: { service: true, employee: true, business: true },
  });
  return appointment ? toSummary(appointment) : null;
}
