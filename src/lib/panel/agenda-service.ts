import type { PrismaClient, AppointmentStatus, AppointmentSource } from '@prisma/client';

export interface AgendaAppointment {
  id: string;
  status: AppointmentStatus;
  start: Date;
  end: Date;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceName: string;
  employeeId: string;
  employeeName: string;
  source: AppointmentSource;
  manualApprovalPending: boolean;
}

export interface AgendaEmployee {
  id: string;
  name: string;
  color: string;
}

export interface AgendaData {
  employees: AgendaEmployee[];
  appointments: AgendaAppointment[];
}

export async function getAgendaForBusiness(
  prisma: PrismaClient,
  params: { businessId: string; dateFromUtc: Date; dateToUtc: Date }
): Promise<AgendaData> {
  const [business, employees, appointments] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: params.businessId }, select: { manualApproval: true } }),
    prisma.employee.findMany({ where: { businessId: params.businessId, active: true }, orderBy: { name: 'asc' } }),
    prisma.appointment.findMany({
      where: {
        businessId: params.businessId,
        start: { gte: params.dateFromUtc, lt: params.dateToUtc },
      },
      include: { service: true, employee: true },
      orderBy: { start: 'asc' },
    }),
  ]);

  return {
    employees: employees.map((e) => ({ id: e.id, name: e.name, color: e.color })),
    appointments: appointments.map((a) => ({
      id: a.id,
      status: a.status,
      start: a.start,
      end: a.end,
      customerName: a.customerName,
      customerPhone: a.customerPhone,
      customerEmail: a.customerEmail,
      serviceName: a.service.name,
      employeeId: a.employeeId,
      employeeName: a.employee.name,
      source: a.source,
      manualApprovalPending: a.status === 'PENDING' && business.manualApproval,
    })),
  };
}
