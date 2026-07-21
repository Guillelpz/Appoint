'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdminSession } from '@/lib/admin/session';
import { createPlatformBusiness, setPlatformBusinessActive, type NewBusinessInput } from '@/lib/admin/platform-business-service';
import { getOwnerInviter } from '@/lib/admin/owner-inviter';
import { sendOwnerInvitationEmail } from '@/lib/email/owner-invitation';
import { getEmailSender } from '@/lib/email/get-email-sender';
import { getAppBaseUrl } from '@/lib/email/urls';

export interface CreateBusinessActionResult {
  ok: boolean;
  message?: string;
}

// El servicio de dominio no distingue qué campo concreto falló en
// INVALID_INPUT (mismo criterio que services-service.ts/SERVICE_ERROR_MESSAGES
// en el panel), así que el mensaje menciona los casos más comunes.
const CREATE_BUSINESS_ERROR_MESSAGES: Record<'INVALID_INPUT' | 'SLUG_TAKEN' | 'OWNER_INVITE_FAILED', string> = {
  INVALID_INPUT:
    'Revisa los datos: nombre, slug (minúsculas y guiones, no una ruta reservada), el email del dueño (obligatorio) y el de contacto (si lo indicas) válidos.',
  SLUG_TAKEN: 'Ese slug ya está en uso por otro negocio.',
  OWNER_INVITE_FAILED: 'No se pudo invitar al dueño por email. Revisa que el email sea correcto e inténtalo de nuevo.',
};

// El formulario de alta llama a esta acción directamente (no como
// `<form action={fn}>`) desde un componente cliente con estado controlado,
// mismo motivo que createServiceAction/CreateServiceForm en el panel: evita
// que React reinicie los campos del formulario en cuanto la acción termina,
// incluso cuando falla.
export async function createBusinessAction(input: NewBusinessInput): Promise<CreateBusinessActionResult> {
  await requireAdminSession();
  const result = await createPlatformBusiness(prisma, getOwnerInviter(), input);
  revalidatePath('/admin/negocios');
  if (!result.ok) {
    return { ok: false, message: CREATE_BUSINESS_ERROR_MESSAGES[result.reason] };
  }

  // El envío del email va DESPUÉS de que el alta del negocio (operación de
  // negocio) haya tenido éxito, y nunca puede tirar abajo la respuesta:
  // sendOwnerInvitationEmail nunca lanza (trySend interno).
  await sendOwnerInvitationEmail(getEmailSender(), {
    business: { name: result.business.name, accentColor: result.business.accentColor, logoUrl: result.business.logoUrl },
    ownerEmail: input.ownerEmail.trim(),
    invitationUrl: `${getAppBaseUrl()}/panel/invitacion?token_hash=${result.invitationTokenHash}`,
  });

  return { ok: true };
}

// Botón suelto sin campos que perder: sigue el patrón `?aviso=` de
// setServiceActiveAction (Fase 5) en vez de devolver estado al cliente.
export async function setBusinessActiveAction(businessId: string, active: boolean): Promise<void> {
  await requireAdminSession();
  const result = await setPlatformBusinessActive(prisma, businessId, active);
  revalidatePath('/admin/negocios');
  if (!result.ok) {
    redirect('/admin/negocios?aviso=accion-no-aplicada');
  }
}
