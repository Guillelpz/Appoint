import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Cliente de Supabase para Server Components y Server Actions: lee/escribe
// la sesión a través de las cookies de la petición actual. En Server
// Components (no en Server Actions ni en Route Handlers) Next.js no permite
// escribir cookies; el try/catch silencioso es intencional ahí — el
// middleware (src/middleware.ts) es quien refresca la sesión en cada
// petición, así que un Server Component que no pueda escribir cookies
// simplemente no lo hace, sin romper el render.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Ver comentario de arriba: esperado en Server Components.
        }
      },
    },
  });
}
