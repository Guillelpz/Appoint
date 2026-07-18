import type { PrismaClient, WorkingHours } from '@prisma/client';

export interface WorkingHoursBlockInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export type ReplaceWorkingHoursResult =
  | { ok: true; workingHours: WorkingHours[] }
  | { ok: false; reason: 'INVALID_INPUT' | 'NOT_FOUND' };

function isValidBlock(block: WorkingHoursBlockInput): boolean {
  return (
    Number.isInteger(block.weekday) &&
    block.weekday >= 0 &&
    block.weekday <= 6 &&
    Number.isInteger(block.startMinute) &&
    Number.isInteger(block.endMinute) &&
    block.startMinute >= 0 &&
    block.endMinute <= 1440 &&
    block.startMinute < block.endMinute
  );
}

export async function replaceWeeklyWorkingHours(
  prisma: PrismaClient,
  businessId: string,
  employeeId: string,
  blocks: WorkingHoursBlockInput[]
): Promise<ReplaceWorkingHoursResult> {
  if (!blocks.every(isValidBlock)) {
    return { ok: false, reason: 'INVALID_INPUT' };
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.businessId !== businessId) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  await prisma.$transaction([
    prisma.workingHours.deleteMany({ where: { employeeId } }),
    prisma.workingHours.createMany({
      data: blocks.map((block) => ({ employeeId, weekday: block.weekday, startMinute: block.startMinute, endMinute: block.endMinute })),
    }),
  ]);

  const workingHours = await prisma.workingHours.findMany({
    where: { employeeId },
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
  });
  return { ok: true, workingHours };
}
