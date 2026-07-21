import { createClient } from '@supabase/supabase-js';

// Cliente de la Admin API de Supabase Auth (service role): usado para altas
// de usuarios fuera del flujo normal de sign-up (seeds de dev/demo,
// invitación real de dueños desde /admin). Solo se importa desde código que
// corre en el servidor (seeds, Server Actions) — nunca se expone al cliente.
export function getSupabaseAdminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son necesarias para usar la Admin API de Supabase Auth. Revisa .env.'
    );
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin;
}
