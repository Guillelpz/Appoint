import type { PrismaClient, TimeOff } from '@prisma/client';

export type TimeOffMutationResult = { ok: true; timeOff: TimeOff } | { ok: false; reason: 'INVALID_INPUT' | 'NOT_FOUND' };
export type TimeOffDeleteResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' };

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
 */
export async function createTimeOffForEmployee(
  prisma: PrismaClient,
  businessId: string,
  employeeId: string,
  input: { start: Date; end: Date; reason: string | null }
): Promise<TimeOffMutationResult> {
  if (Number.isNaN(input.start.getTime()) || Number.isNaN(input.end.getTime()) || input.start >= input.end) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.businessId !== businessId) {
    return { ok: false, reason: 'NOT_FOUND' };
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
