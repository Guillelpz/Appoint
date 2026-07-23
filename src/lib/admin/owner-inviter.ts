import { getSupabaseAdminAuthClient } from '@/lib/supabase/admin';

export interface OwnerInvitationLink {
  userId: string;
  hashedToken: string;
}

export interface OwnerInvitationStatus {
  email: string;
  completed: boolean;
}

// Alcance de plataforma (no tenant-scoped): genera el enlace de invitación
// real de Supabase Auth para el dueño de un negocio nuevo, usado solo desde
// /admin. Se inyecta como interfaz (mismo patrón que EmailSender en
// src/lib/email/types.ts) para poder testear createPlatformBusiness
// (Tarea 12) con un FakeOwnerInviter sin llamar a la Admin API real — igual
// que el resto del proyecto evita golpear Supabase Auth desde Vitest (ver
// src/lib/seed/demo-owner.ts: ensureDemoOwnerAuthUser no tiene test directo,
// solo seedDemoOwnerMembership y getDemoOwnerCredentials).
//
// getInvitationStatus/markInvitationCompleted usan una señal PROPIA
// (app_metadata.invitationCompletedAt) en vez de los campos nativos de
// Supabase (last_sign_in_at/confirmed_at): verifyOtp de tipo invite ya
// autentica al usuario y puede tocar esos campos ANTES de que updateUser
// fije la contraseña — que es justo el caso límite que esta señal permite
// recuperar desde /admin (ver docs/superpowers/CONTINUAR.md, "No existe
// acción de reenviar invitación").
export interface OwnerInviter {
  generateInviteLink(email: string): Promise<OwnerInvitationLink>;
  getInvitationStatus(userId: string): Promise<OwnerInvitationStatus | null>;
  markInvitationCompleted(userId: string): Promise<void>;
}

// IMPORTANTE — por qué no se usa `action_link`: `generateLink({type:'invite'})`
// también devuelve `properties.action_link`, una URL a
// `{SUPABASE_URL}/auth/v1/verify?type=invite&token=...&redirect_to=...` que,
// al visitarse, hace un 302 a `redirect_to` añadiendo la sesión como
// FRAGMENTO de URL (`#access_token=...&refresh_token=...&type=invite`) —
// grant implícito. El cliente de navegador de este proyecto
// (createBrowserClient de @supabase/ssr, src/lib/supabase/browser.ts) fija
// `flowType: 'pkce'` de forma fija (no configurable desde aquí), y
// `_getSessionFromURL` de @supabase/auth-js lanza
// `AuthPKCEGrantCodeExchangeError('Not a valid PKCE flow url.')` en cuanto
// detecta un callback implícito con flowType pkce — el enlace nativo de
// Supabase quedaría roto en este proyecto tal cual. En vez de depender de
// eso, no se pasa `options.redirectTo` (innecesario además: evita cualquier
// fricción con la lista de redirects permitidos de supabase/config.toml,
// que no incluye APP_BASE_URL) y se usa directamente
// `properties.hashed_token`: nuestra propia página /panel/invitacion
// construye la URL (`${APP_BASE_URL}/panel/invitacion?token_hash=...`, ver
// Tarea 15) y la verifica en un Server Action con
// `supabase.auth.verifyOtp({ token_hash, type: 'invite' })` (Tarea 13), que
// no pasa por ningún flujo de redirect ni por el chequeo de flowType.
export class SupabaseOwnerInviter implements OwnerInviter {
  async generateInviteLink(email: string): Promise<OwnerInvitationLink> {
    const admin = getSupabaseAdminAuthClient();
    const { data, error } = await admin.generateLink({ type: 'invite', email });
    if (error || !data.user) {
      throw new Error(`No se pudo generar el enlace de invitación para ${email}: ${error?.message ?? 'usuario no devuelto'}`);
    }
    return { userId: data.user.id, hashedToken: data.properties.hashed_token };
  }

  async getInvitationStatus(userId: string): Promise<OwnerInvitationStatus | null> {
    const admin = getSupabaseAdminAuthClient();
    const { data, error } = await admin.getUserById(userId);
    if (error || !data.user) {
      return null;
    }
    return {
      email: data.user.email ?? '',
      completed: Boolean(data.user.app_metadata?.invitationCompletedAt),
    };
  }

  async markInvitationCompleted(userId: string): Promise<void> {
    const admin = getSupabaseAdminAuthClient();
    const { error } = await admin.updateUserById(userId, {
      app_metadata: { invitationCompletedAt: new Date().toISOString() },
    });
    if (error) {
      throw new Error(`No se pudo marcar la invitación como completada para el usuario ${userId}: ${error.message}`);
    }
  }
}

export function getOwnerInviter(): OwnerInviter {
  return new SupabaseOwnerInviter();
}
