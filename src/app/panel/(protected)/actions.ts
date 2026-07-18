'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePanelSession } from '@/lib/panel/session';
import { approvePendingAppointment, rejectPendingAppointment } from '@/lib/panel/approval-service';
import { completeAppointmentFromPanel, markNoShowFromPanel } from '@/lib/panel/completion-service';
import { cancelAppointmentFromPanel } from '@/lib/panel/cancellation-service';
import { createManualAppointmentForBusiness } from '@/lib/panel/manual-appointment-service';
import { getAvailableSlots } from '@/lib/booking/slots';

// Las 5 acciones de transición de estado abajo comparten un patrón: si el
// servicio devuelve `{ ok: false, reason: 'NOT_FOUND' }' (carrera perdida —
// doble click, pestaña obsoleta, el cliente ya canceló su propia cita, etc.)
// no queremos fallar en silencio. `revalidatePath` sigue llamándose siempre
// para refrescar el estado real, y solo en el caso de fallo hacemos un
// `redirect` explícito de vuelta a la misma vista (fecha/vista se reciben
// como argumentos "bind-eados" en el formulario, no como datos de sesión)
// añadiendo `?aviso=accion-no-aplicada`, que la página muestra como un
// banner descartable.
function redirectToStaleActionNotice(date: string, view: string): never {
  redirect(`/panel?date=${date}&view=${view}&aviso=accion-no-aplicada`);
}

export async function approveAppointmentAction(appointmentId: string, date: string, view: string): Promise<void> {
  const { businessId } = await requirePanelSession();
  const result = await approvePendingAppointment(prisma, { businessId, appointmentId });
  revalidatePath('/panel');
  if (!result.ok) {
    redirectToStaleActionNotice(date, view);
  }
}

export async function rejectAppointmentAction(appointmentId: string, date: string, view: string): Promise<void> {
  const { businessId } = await requirePanelSession();
  const result = await rejectPendingAppointment(prisma, { businessId, appointmentId });
  revalidatePath('/panel');
  if (!result.ok) {
    redirectToStaleActionNotice(date, view);
  }
}

export async function completeAppointmentAction(appointmentId: string, date: string, view: string): Promise<void> {
  const { businessId } = await requirePanelSession();
  const result = await completeAppointmentFromPanel(prisma, { businessId, appointmentId });
  revalidatePath('/panel');
  if (!result.ok) {
    redirectToStaleActionNotice(date, view);
  }
}

export async function markNoShowAppointmentAction(appointmentId: string, date: string, view: string): Promise<void> {
  const { businessId } = await requirePanelSession();
  const result = await markNoShowFromPanel(prisma, { businessId, appointmentId });
  revalidatePath('/panel');
  if (!result.ok) {
    redirectToStaleActionNotice(date, view);
  }
}

export async function cancelAppointmentFromPanelAction(appointmentId: string, date: string, view: string): Promise<void> {
  const { businessId } = await requirePanelSession();
  const result = await cancelAppointmentFromPanel(prisma, { businessId, appointmentId });
  revalidatePath('/panel');
  if (!result.ok) {
    redirectToStaleActionNotice(date, view);
  }
}

export interface ManualSlotOption {
  start: string;
}

export async function getManualSlotsAction(input: {
  serviceId: string;
  employeeId: string;
  date: string;
}): Promise<ManualSlotOption[]> {
  const { businessId } = await requirePanelSession();
  const slots = await getAvailableSlots(prisma, {
    businessId,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    dateFrom: input.date,
    dateTo: input.date,
  });
  return slots.map((s) => ({ start: s.start.toISOString() }));
}

export interface CreateManualAppointmentActionInput {
  serviceId: string;
  employeeId: string;
  start: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

export interface CreateManualAppointmentActionResult {
  ok: boolean;
  message?: string;
}

const MANUAL_APPOINTMENT_ERROR_MESSAGES = {
  INVALID_INPUT: 'Revisa el nombre del cliente y el formato del teléfono/email.',
  SERVICE_NOT_FOUND: 'El servicio seleccionado ya no está disponible.',
  EMPLOYEE_UNAVAILABLE: 'Ese profesional no puede atender ese servicio a esa hora.',
  SLOT_TAKEN: 'Ese hueco se acaba de ocupar. Elige otra hora.',
  CUSTOMER_CONFLICT: 'El teléfono o email indicado ya pertenece a otro cliente con datos distintos.',
} as const;

export async function createManualAppointmentAction(
  input: CreateManualAppointmentActionInput
): Promise<CreateManualAppointmentActionResult> {
  const { businessId } = await requirePanelSession();
  const result = await createManualAppointmentForBusiness(prisma, {
    businessId,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    start: new Date(input.start),
    customerName: input.customerName,
    customerPhone: input.customerPhone.trim() || null,
    customerEmail: input.customerEmail.trim() || null,
  });

  revalidatePath('/panel');

  if (result.ok) {
    return { ok: true };
  }

  return { ok: false, message: MANUAL_APPOINTMENT_ERROR_MESSAGES[result.reason] };
}
