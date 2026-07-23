'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePanelSession } from '@/lib/panel/session';
import { replaceWeeklyWorkingHours, type WorkingHoursBlockInput } from '@/lib/panel/working-hours-service';
import { createTimeOffForEmployee, deleteTimeOffForBusiness } from '@/lib/panel/time-off-service';
import { parseLocalWallTimeToUtc } from '@/lib/booking/timezone';

export interface WorkingHoursActionResult {
  ok: boolean;
  message?: string;
}

// Mismo motivo que EMPLOYEE_ERROR_MESSAGES en `../actions.ts`: el servicio de
// dominio no distingue el detalle exacto del fallo dentro de cada `reason`
// (franja mal formada vs. solapada), así que el mensaje cubre ambos casos.
const WORKING_HOURS_ERROR_MESSAGES: Record<'INVALID_INPUT' | 'NOT_FOUND', string> = {
  INVALID_INPUT: 'Revisa las franjas: horas válidas y sin solapes en el mismo día.',
  NOT_FOUND: 'Ese empleado ya no existe o no pertenece a tu negocio.',
};

const TIME_OFF_ERROR_AVISOS: Record<
  'INVALID_INPUT' | 'NOT_FOUND' | 'START_IN_PAST' | 'DURATION_TOO_LONG' | 'TOO_FAR_IN_FUTURE' | 'OVERLAPPING',
  string
> = {
  INVALID_INPUT: 'ausencia-invalida',
  NOT_FOUND: 'accion-no-aplicada',
  START_IN_PAST: 'ausencia-en-el-pasado',
  DURATION_TOO_LONG: 'ausencia-demasiado-larga',
  TOO_FAR_IN_FUTURE: 'ausencia-demasiado-lejana',
  OVERLAPPING: 'ausencia-solapada',
};

export async function replaceWorkingHoursAction(
  employeeId: string,
  blocks: WorkingHoursBlockInput[]
): Promise<WorkingHoursActionResult> {
  const { businessId } = await requirePanelSession();
  const result = await replaceWeeklyWorkingHours(prisma, businessId, employeeId, blocks);
  revalidatePath(`/panel/equipo/${employeeId}`);
  if (!result.ok) {
    return { ok: false, message: WORKING_HOURS_ERROR_MESSAGES[result.reason] };
  }
  return { ok: true };
}

// Los formularios de horario usan estado controlado en cliente
// (WorkingHoursEditor) y por eso devuelven `{ ok, message }` en vez de
// redirigir: hay franjas que el usuario acaba de editar y perderlas en un
// fallo de validación sería mala UX. El alta/baja de ausencias de abajo, en
// cambio, son formularios nativos sin estado en React (`<form
// action={fn}>`), así que siguen el patrón `?aviso=` de
// `../../actions.ts` (redirectToStaleActionNotice): NOT_FOUND es una carrera
// perdida (el empleado se borró mientras tanto) sin datos que conservar, y
// para el alta con INVALID_INPUT (p. ej. fin antes que inicio) tampoco hay
// estado de React que perder porque el propio `redirect` recarga la página;
// aun así se distingue con un código de aviso propio para dar un mensaje
// específico en vez de "acción no aplicada".
function redirectToEmployeeNotice(employeeId: string, aviso: string): never {
  redirect(`/panel/equipo/${employeeId}?aviso=${aviso}`);
}

export async function createTimeOffAction(employeeId: string, formData: FormData): Promise<void> {
  const { businessId } = await requirePanelSession();
  const start = parseLocalWallTimeToUtc(String(formData.get('start')));
  const end = parseLocalWallTimeToUtc(String(formData.get('end')));
  const reason = String(formData.get('reason') ?? '') || null;
  const result = await createTimeOffForEmployee(prisma, businessId, employeeId, { start, end, reason });
  revalidatePath(`/panel/equipo/${employeeId}`);
  if (!result.ok) {
    redirectToEmployeeNotice(employeeId, TIME_OFF_ERROR_AVISOS[result.reason]);
  }
}

export async function deleteTimeOffAction(employeeId: string, timeOffId: string): Promise<void> {
  const { businessId } = await requirePanelSession();
  const result = await deleteTimeOffForBusiness(prisma, businessId, timeOffId);
  revalidatePath(`/panel/equipo/${employeeId}`);
  if (!result.ok) {
    redirectToEmployeeNotice(employeeId, 'accion-no-aplicada');
  }
}
