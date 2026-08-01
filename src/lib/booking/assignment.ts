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

  // Antes: un count() por empleado disponible (N consultas). Ahora: un único
  // groupBy con `in` que cuenta todos a la vez; los empleados sin ninguna
  // cita ese día no aparecen en el resultado y se tratan como count 0 (mismo
  // comportamiento que antes, donde count() devolvía 0 para ellos).
  const counts = await prisma.appointment.groupBy({
    by: ['employeeId'],
    where: {
      employeeId: { in: availableEmployeeIds },
      start: { gte: dayStart, lt: dayEnd },
      ...activeAppointmentWhere(now),
    },
    _count: { _all: true },
  });

  const countByEmployeeId = new Map(counts.map((c) => [c.employeeId, c._count._all]));

  const loads = availableEmployeeIds.map((employeeId) => ({
    employeeId,
    count: countByEmployeeId.get(employeeId) ?? 0,
  }));

  loads.sort((a, b) => a.count - b.count || a.employeeId.localeCompare(b.employeeId));

  return loads[0].employeeId;
}
