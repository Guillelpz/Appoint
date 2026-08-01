import type { Business, Employee, PrismaClient, Service, ServiceEmployee } from '@prisma/client';
import { addDaysToLocalDateString, localMinutesToUtc } from './timezone';
import { rangesOverlap } from './overlap';
import { activeAppointmentWhere } from './active-appointments';

export interface GetAvailableSlotsParams {
  businessId: string;
  serviceId: string;
  employeeId?: string;
  dateFrom: string;
  dateTo: string;
  now?: Date;
  /**
   * Entidades ya resueltas por quien llama (p. ej. slots-service.ts,
   * create-appointment.ts, manual-appointment-service.ts ya han hecho estas
   * mismas consultas antes de llegar aquí). Son puramente una optimización:
   * si no se pasan, getAvailableSlots hace las mismas consultas que antes.
   * `null` significa "ya se resolvió y no existe" (evita re-consultar);
   * `undefined`/ausente significa "no resuelto todavía, consúltalo tú".
   */
  business?: Business;
  service?: Service;
  serviceEmployee?: ServiceEmployee | null;
  employee?: Employee | null;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
  employeeId: string;
}

function enumerateLocalDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addDaysToLocalDateString(current, 1);
  }
  return dates;
}

function localDateWeekday(localDateStr: string): number {
  const [year, month, day] = localDateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// Agrupa una lista de filas con employeeId en un Map employeeId -> filas,
// para poder repartir en memoria el resultado de una única consulta
// `employeeId: { in: employeeIds } }` entre los empleados que la pidieron
// (ver getSlotsForEmployees).
function groupByEmployeeId<T extends { employeeId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.employeeId);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(row.employeeId, [row]);
    }
  }
  return grouped;
}

// Antes hacía estas 3 consultas POR EMPLEADO (llamada en bucle desde
// getAvailableSlots): con N empleados cualificados para un servicio, 3N
// consultas solo para calcular huecos. Ahora se consulta una vez para todos
// los employeeIds con `in`, y el resultado se reparte en memoria por
// empleado — de 3N consultas a 3, sea cual sea N.
async function getSlotsForEmployees(
  prisma: PrismaClient,
  params: {
    employeeIds: string[];
    slotDurationMinutes: number;
    granularity: number;
    dateFrom: string;
    dateTo: string;
    now: Date;
  }
): Promise<AvailableSlot[]> {
  const { employeeIds, slotDurationMinutes, granularity, dateFrom, dateTo, now } = params;

  if (employeeIds.length === 0) {
    return [];
  }

  const rangeStartUtc = localMinutesToUtc(dateFrom, 0);
  const rangeEndUtc = localMinutesToUtc(addDaysToLocalDateString(dateTo, 1), 0);

  const [workingHours, timeOffs, activeAppointments] = await Promise.all([
    prisma.workingHours.findMany({ where: { employeeId: { in: employeeIds } } }),
    prisma.timeOff.findMany({
      where: { employeeId: { in: employeeIds }, start: { lt: rangeEndUtc }, end: { gt: rangeStartUtc } },
    }),
    prisma.appointment.findMany({
      where: {
        employeeId: { in: employeeIds },
        start: { lt: rangeEndUtc },
        end: { gt: rangeStartUtc },
        ...activeAppointmentWhere(now),
      },
    }),
  ]);

  const workingHoursByEmployee = groupByEmployeeId(workingHours);
  const timeOffsByEmployee = groupByEmployeeId(timeOffs);
  const activeAppointmentsByEmployee = groupByEmployeeId(activeAppointments);

  const localDates = enumerateLocalDates(dateFrom, dateTo);
  const slots: AvailableSlot[] = [];

  for (const employeeId of employeeIds) {
    const employeeWorkingHours = workingHoursByEmployee.get(employeeId) ?? [];
    const employeeTimeOffs = timeOffsByEmployee.get(employeeId) ?? [];
    const employeeActiveAppointments = activeAppointmentsByEmployee.get(employeeId) ?? [];

    for (const localDate of localDates) {
      const weekday = localDateWeekday(localDate);
      const dayBlocks = employeeWorkingHours.filter((wh) => wh.weekday === weekday);

      for (const block of dayBlocks) {
        let cursor = block.startMinute;
        while (cursor + slotDurationMinutes <= block.endMinute) {
          const start = localMinutesToUtc(localDate, cursor);
          const end = localMinutesToUtc(localDate, cursor + slotDurationMinutes);

          const blockedByTimeOff = employeeTimeOffs.some((t) => rangesOverlap(start, end, t.start, t.end));
          const blockedByAppointment = employeeActiveAppointments.some((a) =>
            rangesOverlap(start, end, a.start, a.end)
          );

          if (!blockedByTimeOff && !blockedByAppointment) {
            slots.push({ start, end, employeeId });
          }

          cursor += granularity;
        }
      }
    }
  }

  return slots;
}

export async function getAvailableSlots(
  prisma: PrismaClient,
  params: GetAvailableSlotsParams
): Promise<AvailableSlot[]> {
  const now = params.now ?? new Date();
  const business = params.business ?? (await prisma.business.findUnique({ where: { id: params.businessId } }));
  if (!business) {
    return [];
  }
  const service = params.service ?? (await prisma.service.findUnique({ where: { id: params.serviceId } }));
  if (!service || service.businessId !== params.businessId || !service.active) {
    return [];
  }

  let employeeIds: string[];
  if (params.employeeId) {
    const employeeId = params.employeeId;
    const [serviceEmployee, employee] =
      params.serviceEmployee !== undefined && params.employee !== undefined
        ? [params.serviceEmployee, params.employee]
        : await Promise.all([
            prisma.serviceEmployee.findUnique({
              where: { serviceId_employeeId: { serviceId: params.serviceId, employeeId } },
            }),
            prisma.employee.findUnique({ where: { id: employeeId } }),
          ]);
    if (!serviceEmployee || !employee || !employee.active || employee.businessId !== params.businessId) {
      return [];
    }
    employeeIds = [params.employeeId];
  } else {
    const serviceEmployees = await prisma.serviceEmployee.findMany({
      where: { serviceId: params.serviceId, employee: { active: true } },
      select: { employeeId: true },
    });
    employeeIds = serviceEmployees.map((se) => se.employeeId);
  }

  const slotDurationMinutes = service.durationMinutes + service.bufferAfterMinutes;
  const granularity = business.slotGranularityMinutes;

  const earliestAllowedStart = new Date(now.getTime() + business.minAdvanceNoticeMinutes * 60 * 1000);
  const latestAllowedStart = new Date(now.getTime() + business.maxBookingWindowDays * 24 * 60 * 60 * 1000);

  const allSlots = await getSlotsForEmployees(prisma, {
    employeeIds,
    slotDurationMinutes,
    granularity,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    now,
  });

  const filtered = allSlots.filter(
    (slot) => slot.start >= earliestAllowedStart && slot.start <= latestAllowedStart
  );

  filtered.sort((a, b) => a.start.getTime() - b.start.getTime());

  return filtered;
}
