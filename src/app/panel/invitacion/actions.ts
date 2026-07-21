'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: input.tokenHash, type: 'invite' });
  if (verifyError) {
    return {
      ok: false,
      message: 'El enlace de invitación no es válido o ha caducado. Pide al super-admin que te envíe uno nuevo.',
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: input.password });
  if (updateError) {
    return { ok: false, message: 'No se pudo establecer la contraseña. Inténtalo de nuevo.' };
  }

  redirect('/panel');
}
