import type { PrismaClient } from '@prisma/client';
import { getAvailableSlots } from './slots';
import { activeAppointmentWhere } from './active-appointments';
import { getLocalDateString, localMinutesToUtc, addDaysToLocalDateString } from './timezone';

export interface AssignAnyAvailableEmployeeParams {
  businessId: string;
  serviceId: string;
  start: Date;
  now?: Date;
}

export async function assignAnyAvailableEmployee(
  prisma: PrismaClient,
  params: AssignAnyAvailableEmployeeParams
): Promise<string | null> {
  const now = params.now ?? new Date();
  const localDate = getLocalDateString(params.start);

  const slots = await getAvailableSlots(prisma, {
    businessId: params.businessId,
    serviceId: params.serviceId,
    dateFrom: localDate,
    dateTo: localDate,
    now,
  });

  const availableEmployeeIds = Array.from(
    new Set(
      slots
        .filter((slot) => slot.start.getTime() === params.start.getTime())
        .map((slot) => slot.employeeId)
    )
  );

  if (availableEmployeeIds.length === 0) {
    return null;
  }

  const dayStart = localMinutesToUtc(localDate, 0);
  const dayEnd = localMinutesToUtc(addDaysToLocalDateString(localDate, 1), 0);

  const loads = await Promise.all(
    availableEmployeeIds.map(async (employeeId) => {
      const count = await prisma.appointment.count({
        where: {
          employeeId,
          start: { gte: dayStart, lt: dayEnd },
          ...activeAppointmentWhere(now),
        },
      });
      return { employeeId, count };
    })
  );

  loads.sort((a, b) => a.count - b.count || a.employeeId.localeCompare(b.employeeId));

  return loads[0].employeeId;
}
