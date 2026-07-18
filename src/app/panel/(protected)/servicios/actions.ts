'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePanelSession } from '@/lib/panel/session';
import { createServiceForBusiness, updateServiceForBusiness, setServiceActive, type ServiceInput } from '@/lib/panel/services-service';

export interface ServiceActionResult {
  ok: boolean;
  message?: string;
}

// Mismo motivo que INVALID_INPUT en el alta manual de citas
// (`../actions.ts` → MANUAL_APPOINTMENT_ERROR_MESSAGES): el servicio de
// dominio no distingue qué campo concreto falló, así que el mensaje es
// genérico mencionando los casos más comunes de validación
// (isValidServiceInput en services-service.ts).
const SERVICE_ERROR_MESSAGES: Record<'INVALID_INPUT' | 'NOT_FOUND', string> = {
  INVALID_INPUT: 'Revisa los datos: nombre obligatorio, duración y precio válidos.',
  NOT_FOUND: 'Ese servicio ya no existe o no pertenece a tu negocio.',
};

// Los formularios de alta/edición llaman a estas dos acciones directamente
// (no como `<form action={fn}>`) desde un componente cliente con estado
// controlado, igual que `createManualAppointmentAction` en
// `../actions.ts`/`ManualAppointmentForm.tsx`. Es deliberado: un `<form
// action={fn}>` apuntando a una Server Action hace que React reinicie los
// campos no controlados del formulario en cuanto la acción termina —
// también cuando falla —, así que con ese patrón el usuario perdía lo que
// había escrito justo en el caso (INVALID_INPUT) donde más falta hace
// conservarlo. Recibir el objeto ya tipado (en vez de FormData) evita
// duplicar el parseo/validación de campos en el cliente.
export async function createServiceAction(input: ServiceInput): Promise<ServiceActionResult> {
  const { businessId } = await requirePanelSession();
  const result = await createServiceForBusiness(prisma, businessId, input);
  revalidatePath('/panel/servicios');
  if (!result.ok) {
    return { ok: false, message: SERVICE_ERROR_MESSAGES[result.reason] };
  }
  return { ok: true };
}

export async function updateServiceAction(serviceId: string, input: ServiceInput): Promise<ServiceActionResult> {
  const { businessId } = await requirePanelSession();
  const result = await updateServiceForBusiness(prisma, businessId, serviceId, input);
  revalidatePath('/panel/servicios');
  if (!result.ok) {
    return { ok: false, message: SERVICE_ERROR_MESSAGES[result.reason] };
  }
  return { ok: true };
}

// Activar/desactivar es un botón suelto (sin campos que perder), así que
// sigue el patrón `?aviso=` de la agenda (`../actions.ts` →
// redirectToStaleActionNotice) en vez de devolver estado al cliente: el
// único fallo posible es NOT_FOUND (carrera perdida, p. ej. otra pestaña ya
// borró/movió el servicio), no hay datos de formulario que preservar. Este
// sigue siendo un `<form action={fn}>` normal — el reset automático de
// React no afecta porque no hay campos de texto en ese formulario.
export async function setServiceActiveAction(serviceId: string, active: boolean): Promise<void> {
  const { businessId } = await requirePanelSession();
  const result = await setServiceActive(prisma, businessId, serviceId, active);
  revalidatePath('/panel/servicios');
  if (!result.ok) {
    redirect('/panel/servicios?aviso=accion-no-aplicada');
  }
}
