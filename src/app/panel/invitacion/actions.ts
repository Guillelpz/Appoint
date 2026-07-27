'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

export interface AcceptInvitationResult {
  ok: false;
  message: string;
}

const MIN_PASSWORD_LENGTH = 8;

// Mecánica del flujo de invitación (ver también src/lib/admin/owner-inviter.ts
// para por qué no se usa `action_link`):
// Esta Server Action verifica el `token_hash` con
// `supabase.auth.verifyOtp({ token_hash, type: 'invite' })`. TIENE que
// ejecutarse en una Server Action (o Route Handler), NUNCA en un Server
// Component: createSupabaseServerClient() (src/lib/supabase/server.ts)
// envuelve la escritura de cookies en un try/catch silencioso porque
// Next.js prohíbe escribir cookies desde un Server Component — si
// verifyOtp se llamara desde page.tsx, la sesión se establecería en
// memoria para ese único render pero el navegador nunca recibiría la
// cookie, y la siguiente petición (este mismo Server Action) no vería
// ninguna sesión.
//
// IMPORTANTE (seguridad): verifyOtp se llama SIEMPRE, incluso si ya hay una
// sesión activa (p. ej. una pestaña de /panel abierta, o cualquiera con un
// token_hash inválido/manipulado). No existe atajo que se salte la
// verificación cuando `getUser()` ya devuelve un usuario: sin esto,
// cualquiera con una sesión de /panel vigente podría visitar
// /panel/invitacion con un token_hash arbitrario y cambiar su propia
// contraseña sin volver a autenticarse — convirtiendo esta página en un
// endpoint de cambio de contraseña sin verificación real. Si `token_hash`
// es inválido o ha caducado, verifyOtp devuelve error y no se llega a
// updateUser.
export async function acceptOwnerInvitationAction(input: {
  tokenHash: string;
  password: string;
  confirmPassword: string;
}): Promise<AcceptInvitationResult> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (input.password !== input.confirmPassword) {
    return { ok: false, message: 'Las contraseñas no coinciden.' };
  }

  const supabase = await createSupabaseServerClient();

  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: input.tokenHash, type: 'invite' });
  if (verifyError || !verifyData.user) {
    return {
      ok: false,
      message: 'El enlace de invitación no es válido o ha caducado. Pide al super-admin que te envíe uno nuevo.',
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: input.password });
  if (updateError) {
    return { ok: false, message: 'No se pudo establecer la contraseña. Inténtalo de nuevo.' };
  }

  // Señal propia en Postgres (Membership.invitationCompletedAt, ver
  // prisma/schema.prisma y owner-inviter.ts) para que /admin/negocios sepa
  // que ya no hace falta poder reenviar la invitación. `userId` viene de
  // `verifyData.user.id` (derivado del servidor tras verifyOtp arriba),
  // nunca de un input del cliente. Va DESPUÉS de updateUser (el dueño ya
  // tiene contraseña utilizable pase lo que pase aquí) y ANTES del
  // `redirect` de abajo — el `redirect()` de Next.js lanza una excepción
  // especial (NEXT_REDIRECT) para cortar el render; si este marcado se
  // hiciera DENTRO del try/catch que envuelve ese redirect, el catch se
  // tragaría esa excepción y el redirect nunca llegaría al cliente. Por eso
  // el redirect vive fuera de este bloque. Best-effort: si el marcado
  // falla, no bloquea al dueño (ya tiene contraseña y sesión funcionando),
  // solo deja el botón "Reenviar invitación" visible de más en /admin hasta
  // que se reintente.
  try {
    await prisma.membership.updateMany({
      where: { userId: verifyData.user.id, role: 'OWNER' },
      data: { invitationCompletedAt: new Date() },
    });
  } catch (error) {
    console.error('[panel] no se pudo marcar la invitación como completada', { userId: verifyData.user.id, error });
  }

  redirect('/panel');
}
