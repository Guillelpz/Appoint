'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePanelSession } from '@/lib/panel/session';
import { updateBusinessSettings, type BusinessSettingsInput } from '@/lib/panel/settings-service';

export interface SettingsActionResult {
  ok: boolean;
  message?: string;
}

// El servicio de dominio no distingue qué campo concreto falló (igual que
// en servicios/equipo), así que el mensaje es genérico mencionando los
// casos más comunes de validación (updateBusinessSettings en
// settings-service.ts).
const SETTINGS_ERROR_MESSAGES: Record<'INVALID_INPUT', string> = {
  INVALID_INPUT:
    'Revisa los datos: nombre obligatorio, color de acento en formato hexadecimal (#RRGGBB), ventana de reserva (1-365 días), antelación mínima y granularidad de huecos dentro de los valores permitidos.',
};

// SettingsForm llama a esta acción directamente (no como `<form
// action={fn}>`) desde un componente cliente con estado controlado, por el
// mismo motivo que EditServiceForm/EditEmployeeForm: conservar lo que el
// usuario escribió si la validación falla (INVALID_INPUT).
export async function updateSettingsAction(input: BusinessSettingsInput): Promise<SettingsActionResult> {
  const { businessId } = await requirePanelSession();
  const result = await updateBusinessSettings(prisma, businessId, input);
  revalidatePath('/panel/ajustes');
  if (!result.ok) {
    return { ok: false, message: SETTINGS_ERROR_MESSAGES[result.reason] };
  }
  return { ok: true };
}
