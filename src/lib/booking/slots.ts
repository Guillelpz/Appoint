import type { PrismaClient } from '@prisma/client';
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

async function getSlotsForEmployee(
  prisma: PrismaClient,
  params: {
    employeeId: string;
    slotDurationMinutes: number;
    granularity: number;
    dateFrom: string;
    dateTo: string;
    now: Date;
  }
): Promise<AvailableSlot[]> {
  const { employeeId, slotDurationMinutes, granularity, dateFrom, dateTo, now } = params;

  const rangeStartUtc = localMinutesToUtc(dateFrom, 0);
  const rangeEndUtc = localMinutesToUtc(addDaysToLocalDateString(dateTo, 1), 0);

  const [workingHours, timeOffs, activeAppointments] = await Promise.all([
    prisma.workingHours.findMany({ where: { employeeId } }),
    prisma.timeOff.findMany({
      where: { employeeId, start: { lt: rangeEndUtc }, end: { gt: rangeStartUtc } },
    }),
    prisma.appointment.findMany({
      where: {
        employeeId,
        start: { lt: rangeEndUtc },
        end: { gt: rangeStartUtc },
        ...activeAppointmentWhere(now),
      },
    }),
  ]);

  const localDates = enumerateLocalDates(dateFrom, dateTo);
  const slots: AvailableSlot[] = [];

  for (const localDate of localDates) {
    const weekday = localDateWeekday(localDate);
    const dayBlocks = workingHours.filter((wh) => wh.weekday === weekday);

    for (const block of dayBlocks) {
      let cursor = block.startMinute;
      while (cursor + slotDurationMinutes <= block.endMinute) {
        const start = localMinutesToUtc(localDate, cursor);
        const end = localMinutesToUtc(localDate, cursor + slotDurationMinutes);

        const blockedByTimeOff = timeOffs.some((t) => rangesOverlap(start, end, t.start, t.end));
        const blockedByAppointment = activeAppointments.some((a) => rangesOverlap(start, end, a.start, a.end));

        if (!blockedByTimeOff && !blockedByAppointment) {
          slots.push({ start, end, employeeId });
        }

        cursor += granularity;
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
  const business = await prisma.business.findUnique({ where: { id: params.businessId } });
  if (!business) {
    return [];
  }
  const service = await prisma.service.findUnique({ where: { id: params.serviceId } });
  if (!service || service.businessId !== params.businessId) {
    return [];
  }

  let employeeIds: string[];
  if (params.employeeId) {
    const [serviceEmployee, employee] = await Promise.all([
      prisma.serviceEmployee.findUnique({
        where: { serviceId_employeeId: { serviceId: params.serviceId, employeeId: params.employeeId } },
      }),
      prisma.employee.findUnique({ where: { id: params.employeeId } }),
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

  const slotsPerEmployee = await Promise.all(
    employeeIds.map((employeeId) =>
      getSlotsForEmployee(prisma, {
        employeeId,
        slotDurationMinutes,
        granularity,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        now,
      })
    )
  );

  const allSlots = slotsPerEmployee.flat();

  const filtered = allSlots.filter(
    (slot) => slot.start >= earliestAllowedStart && slot.start <= latestAllowedStart
  );

  filtered.sort((a, b) => a.start.getTime() - b.start.getTime());

  return filtered;
}
