import type { PrismaClient, TimeOff } from '@prisma/client';

export type TimeOffMutationResult =
  | { ok: true; timeOff: TimeOff }
  | { ok: false; reason: 'INVALID_INPUT' | 'NOT_FOUND' | 'START_IN_PAST' | 'DURATION_TOO_LONG' | 'TOO_FAR_IN_FUTURE' | 'OVERLAPPING' };
export type TimeOffDeleteResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' };

const MAX_TIME_OFF_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_ADVANCE_YEARS = 2;

function addYearsUtc(date: Date, years: number): Date {
  const result = new Date(date.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

export async function listTimeOffForEmployee(prisma: PrismaClient, businessId: string, employeeId: string): Promise<TimeOff[]> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.businessId !== businessId) {
    return [];
  }
  return prisma.timeOff.findMany({ where: { employeeId }, orderBy: { start: 'asc' } });
}

/**
 * `input.start`/`input.end` deben ser instantes UTC ya resueltos por quien
 * llama (usando `parseLocalWallTimeToUtc`/`localMinutesToUtc` de
 * `src/lib/booking/timezone.ts`), nunca `new Date('YYYY-MM-DDTHH:mm')` sobre
 * hora local de Europe/Madrid. Estas filas se consumen tal cual en el motor
 * de huecos (`slots.ts`): una Date sin convertir corrompe la disponibilidad
 * en silencio.
 *
 * `input.now` es inyectable para tests (mismo patrón que `now` en
 * `createAppointment`); en producción se omite y se usa `new Date()`.
 */
export async function createTimeOffForEmployee(
  prisma: PrismaClient,
  businessId: string,
  employeeId: string,
  input: { start: Date; end: Date; reason: string | null; now?: Date }
): Promise<TimeOffMutationResult> {
  const now = input.now ?? new Date();

  if (Number.isNaN(input.start.getTime()) || Number.isNaN(input.end.getTime()) || input.start >= input.end) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  if (input.start < now) {
    return { ok: false, reason: 'START_IN_PAST' };
  }
  if (input.end.getTime() - input.start.getTime() > MAX_TIME_OFF_DURATION_MS) {
    return { ok: false, reason: 'DURATION_TOO_LONG' };
  }
  if (input.start > addYearsUtc(now, MAX_ADVANCE_YEARS)) {
    return { ok: false, reason: 'TOO_FAR_IN_FUTURE' };
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.businessId !== businessId) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const overlapping = await prisma.timeOff.findFirst({
    where: { employeeId, start: { lt: input.end }, end: { gt: input.start } },
  });
  if (overlapping) {
    return { ok: false, reason: 'OVERLAPPING' };
  }

  const timeOff = await prisma.timeOff.create({
    data: { employeeId, start: input.start, end: input.end, reason: input.reason?.trim() || null },
  });
  return { ok: true, timeOff };
}

export async function deleteTimeOffForBusiness(
  prisma: PrismaClient,
  businessId: string,
  timeOffId: string
): Promise<TimeOffDeleteResult> {
  const timeOff = await prisma.timeOff.findUnique({ where: { id: timeOffId }, include: { employee: true } });
  if (!timeOff || timeOff.employee.businessId !== businessId) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  await prisma.timeOff.delete({ where: { id: timeOffId } });
  return { ok: true };
}
