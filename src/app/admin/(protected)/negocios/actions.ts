'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdminSession } from '@/lib/admin/session';
import {
  createPlatformBusiness,
  setPlatformBusinessActive,
  resendOwnerInvitation,
  type NewBusinessInput,
  type ResendOwnerInvitationResult,
} from '@/lib/admin/platform-business-service';
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

// Mapea cada motivo de fallo de resendOwnerInvitation a un aviso propio y
// honesto: NOT_FOUND y OWNER_INVITE_FAILED no tienen nada que ver con que
// el negocio haya cambiado mientras tanto (ese es el caso de
// "accion-no-aplicada"), así que no se reutiliza ese mensaje para ellos —
// justo el escenario (Supabase rechaza el reenvío) que esta funcionalidad
// existe para resolver merece un mensaje que lo diga.
const RESEND_INVITATION_AVISO: Record<Exclude<ResendOwnerInvitationResult, { ok: true }>['reason'], string> = {
  ALREADY_COMPLETED: 'invitacion-ya-completada',
  BUSINESS_INACTIVE: 'negocio-suspendido',
  NOT_FOUND: 'invitacion-fallida',
  OWNER_INVITE_FAILED: 'invitacion-fallida',
};

// Reenvía la invitación (nuevo hashed_token + email) al dueño de un negocio
// que todavía no ha completado su alta (ver resendOwnerInvitation). Igual
// que setBusinessActiveAction, es un botón suelto sin campos que perder:
// sigue el patrón `?aviso=`.
export async function resendOwnerInvitationAction(businessId: string): Promise<void> {
  await requireAdminSession();
  const result = await resendOwnerInvitation(prisma, getOwnerInviter(), businessId);
  if (!result.ok) {
    redirect(`/admin/negocios?aviso=${RESEND_INVITATION_AVISO[result.reason]}`);
  }

  await sendOwnerInvitationEmail(getEmailSender(), {
    business: { name: result.business.name, accentColor: result.business.accentColor, logoUrl: result.business.logoUrl },
    ownerEmail: result.ownerEmail,
    invitationUrl: `${getAppBaseUrl()}/panel/invitacion?token_hash=${result.invitationTokenHash}`,
  });

  redirect('/admin/negocios?aviso=invitacion-reenviada');
}
