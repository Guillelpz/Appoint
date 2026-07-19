'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePanelSession } from '@/lib/panel/session';
import { addCustomerToBlacklist, removeCustomerFromBlacklist } from '@/lib/panel/customers-service';

// Mismo patrón que `../equipo/[id]/actions.ts` (redirectToEmployeeNotice):
// los formularios de bloqueo/desbloqueo son nativos sin estado en cliente
// (`<form action={fn}>`), así que ante un fallo se redirige con `?aviso=`
// en vez de descartar el resultado `{ok:false}` del servicio de dominio.
// NOT_FOUND es una carrera perdida (el cliente se borró o cambió de negocio
// mientras tanto); NO_CONTACT_INFO es un caso de validación propio: no se
// puede bloquear a un cliente sin teléfono ni email porque no hay con qué
// emparejar el anti-fraude.
function redirectToCustomerNotice(customerId: string, aviso: string): never {
  redirect(`/panel/clientes/${customerId}?aviso=${aviso}`);
}

export async function addToBlacklistAction(customerId: string, formData: FormData): Promise<void> {
  const { businessId } = await requirePanelSession();
  const reason = String(formData.get('reason') ?? '') || null;
  const result = await addCustomerToBlacklist(prisma, businessId, customerId, reason);
  revalidatePath(`/panel/clientes/${customerId}`);
  revalidatePath('/panel/clientes');
  if (!result.ok) {
    redirectToCustomerNotice(customerId, result.reason === 'NOT_FOUND' ? 'accion-no-aplicada' : 'sin-contacto');
  }
}

export async function removeFromBlacklistAction(customerId: string): Promise<void> {
  const { businessId } = await requirePanelSession();
  const result = await removeCustomerFromBlacklist(prisma, businessId, customerId);
  revalidatePath(`/panel/clientes/${customerId}`);
  revalidatePath('/panel/clientes');
  if (!result.ok) {
    redirectToCustomerNotice(customerId, 'accion-no-aplicada');
  }
}
