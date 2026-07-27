import { getSupabaseAdminAuthClient } from '@/lib/supabase/admin';

export interface OwnerInvitationLink {
  userId: string;
  hashedToken: string;
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
// Este tipo NO tiene "getInvitationStatus" ni "markInvitationCompleted". El
// estado "¿el dueño ya completó su alta?" vivía antes en Supabase Auth (una
// señal propia en app_metadata.invitationCompletedAt) y se movió a Postgres
// (Membership.invitationCompletedAt, ver prisma/schema.prisma y
// getOwnerInvitationCompletionMap en platform-business-service.ts) por dos
// motivos reales encontrados en revisión: (1) retrocompatibilidad — una
// señal que solo escribe el código nuevo deja a TODOS los dueños dados de
// alta antes marcados como "sin completar" para siempre (incluido el dueño
// demo del seed, creado con createUser({email_confirm:true}) sin pasar por
// /panel/invitacion); una migración con backfill puede arreglar datos
// existentes en nuestra propia BD, pero no puede retro-escribir
// app_metadata en Supabase Auth sin otra llamada de red por usuario; y (2)
// rendimiento/disponibilidad — resolver el estado de N negocios en
// /admin/negocios exigía N llamadas a la Admin API (getUserById) en cada
// carga de la página, degradando una gestión crítica (incluida la de
// suspender un negocio) si Supabase Auth va lento. Postgres ya es la fuente
// de verdad del resto del multi-tenancy del proyecto, así que es la
// elección natural para un dato casi inmutable como este.
//
// Lo que SÍ sigue viviendo aquí es `getOwnerEmail`: el email del dueño solo
// existe en Supabase Auth (Membership no lo guarda), y hace falta para
// reenviar la invitación (generateInviteLink recibe un email, no un
// userId). Se usa con una única llamada, solo en el reenvío — nunca en el
// render de la lista, que es justo lo que el punto (2) de arriba evita.
export interface OwnerInviter {
  generateInviteLink(email: string): Promise<OwnerInvitationLink>;
  getOwnerEmail(userId: string): Promise<string | null>;
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

  async getOwnerEmail(userId: string): Promise<string | null> {
    const admin = getSupabaseAdminAuthClient();
    const { data, error } = await admin.getUserById(userId);
    if (error || !data.user) {
      return null;
    }
    return data.user.email ?? null;
  }
}

export function getOwnerInviter(): OwnerInviter {
  return new SupabaseOwnerInviter();
}
