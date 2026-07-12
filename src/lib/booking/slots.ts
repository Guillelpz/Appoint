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

export async function getAvailableSlots(
  prisma: PrismaClient,
  params: GetAvailableSlotsParams
): Promise<AvailableSlot[]> {
  const { businessId, serviceId, employeeId } = params;
  const now = params.now ?? new Date();

  if (!employeeId) {
    throw new Error('employeeId es obligatorio en esta versión de getAvailableSlots');
  }

  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
  const workingHours = await prisma.workingHours.findMany({ where: { employeeId } });

  const rangeStartUtc = localMinutesToUtc(params.dateFrom, 0);
  const rangeEndUtc = localMinutesToUtc(addDaysToLocalDateString(params.dateTo, 1), 0);

  const [timeOffs, activeAppointments] = await Promise.all([
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

  const slotDurationMinutes = service.durationMinutes + service.bufferAfterMinutes;
  const granularity = business.slotGranularityMinutes;

  const slots: AvailableSlot[] = [];
  const localDates = enumerateLocalDates(params.dateFrom, params.dateTo);

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
