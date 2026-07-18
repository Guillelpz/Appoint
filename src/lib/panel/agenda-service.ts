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

/**
 * Consulta la agenda (empleados + citas) de un negocio para un rango de tiempo.
 *
 * IMPORTANTE — contrato de zona horaria: `dateFromUtc` y `dateToUtc` DEBEN ser los
 * límites de un día (o rango de días) local en Europe/Madrid, ya convertidos a UTC
 * con los helpers de `src/lib/booking/timezone.ts` (`localMinutesToUtc` con minutos
 * 0 para el inicio, `addDaysToLocalDateString` para calcular el día siguiente/rango
 * de semana). Nunca construir estos límites con medianoche UTC directa ni con
 * `new Date('YYYY-MM-DDTHH:mm')` (esa cadena se interpreta en la zona del proceso,
 * no en Europe/Madrid): un llamador que se salte el helper mostrará el día local
 * incorrecto de forma silenciosa (sin error, solo citas desplazadas ~1-2h según DST).
 *
 * `appointments` incluye deliberadamente TODOS los estados (también CANCELLED y
 * NO_SHOW): el panel necesita poder mostrarlas en la agenda (p. ej. tachadas), no
 * solo las activas.
 */
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
      // "Pendiente de aprobación del negocio" solo aplica a citas PENDING cuyo email
      // ya fue verificado por el cliente (el paso 2 del diseño de doble verificación,
      // ver avisos de Fase 5 en CONTINUAR.md). Una PENDING sin emailVerifiedAt aún
      // espera el clic de confirmación del cliente (o está abandonada/expirada y
      // ya excluida por activeAppointmentWhere en otros flujos) — no es accionable
      // por el negocio todavía, así que no lleva el badge, aunque sigue apareciendo
      // en la lista.
      manualApprovalPending: a.status === 'PENDING' && business.manualApproval && a.emailVerifiedAt !== null,
    })),
  };
}
