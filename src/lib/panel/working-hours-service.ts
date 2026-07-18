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

// Comprueba que, dentro de cada día de la semana, los tramos no se solapen.
// Dos tramos contiguos (fin de uno = inicio del siguiente) sí están permitidos.
function hasOverlappingBlocks(blocks: WorkingHoursBlockInput[]): boolean {
  const byWeekday = new Map<number, WorkingHoursBlockInput[]>();
  for (const block of blocks) {
    const existing = byWeekday.get(block.weekday);
    if (existing) {
      existing.push(block);
    } else {
      byWeekday.set(block.weekday, [block]);
    }
  }

  for (const dayBlocks of byWeekday.values()) {
    const sorted = [...dayBlocks].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startMinute < sorted[i - 1].endMinute) {
        return true;
      }
    }
  }

  return false;
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

  // No se permiten franjas solapadas dentro del mismo día: el motor de
  // cálculo de huecos las consume tal cual y produciría slots duplicados
  // o inconsistentes.
  if (hasOverlappingBlocks(blocks)) {
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
