'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePanelSession } from '@/lib/panel/session';
import { createEmployeeForBusiness, updateEmployeeForBusiness, type EmployeeInput } from '@/lib/panel/employees-service';

export interface EmployeeActionResult {
  ok: boolean;
  message?: string;
}

// Mismo motivo que SERVICE_ERROR_MESSAGES en `../servicios/actions.ts`: el
// servicio de dominio no distingue qué campo concreto falló, así que el
// mensaje es genérico mencionando los casos más comunes de validación
// (isValidEmployeeInput en employees-service.ts).
const EMPLOYEE_ERROR_MESSAGES: Record<'INVALID_INPUT' | 'NOT_FOUND', string> = {
  INVALID_INPUT: 'Revisa los datos: nombre obligatorio y color válido.',
  NOT_FOUND: 'Ese empleado ya no existe o no pertenece a tu negocio.',
};

// Recibe el objeto ya tipado (no FormData) porque lo llama directamente un
// componente cliente con estado controlado (CreateEmployeeForm), igual que
// createServiceAction en `../servicios/actions.ts`: un `<form
// action={fn}>` apuntando a una Server Action reinicia los campos no
// controlados del formulario en cuanto la acción termina —también cuando
// falla—, así que ese patrón perdería lo que el usuario había escrito justo
// en el caso (INVALID_INPUT) donde más falta hace conservarlo.
export async function createEmployeeAction(input: EmployeeInput): Promise<EmployeeActionResult> {
  const { businessId } = await requirePanelSession();
  const result = await createEmployeeForBusiness(prisma, businessId, input);
  revalidatePath('/panel/equipo');
  if (!result.ok) {
    return { ok: false, message: EMPLOYEE_ERROR_MESSAGES[result.reason] };
  }
  return { ok: true };
}

export async function updateEmployeeAction(employeeId: string, input: EmployeeInput): Promise<EmployeeActionResult> {
  const { businessId } = await requirePanelSession();
  const result = await updateEmployeeForBusiness(prisma, businessId, employeeId, input);
  revalidatePath('/panel/equipo');
  revalidatePath(`/panel/equipo/${employeeId}`);
  if (!result.ok) {
    return { ok: false, message: EMPLOYEE_ERROR_MESSAGES[result.reason] };
  }
  return { ok: true };
}
