import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Refresca la sesión de Supabase (renueva el access token si ha caducado) en
// cada petición a /panel/* y redirige a /panel/login si no hay sesión.
// Es la primera barrera; requirePanelSession() (Tarea 4) es la segunda,
// dentro del layout protegido — Supabase recomienda esta doble comprobación
// porque una cookie de sesión presente pero inválida solo se detecta al
// llamar a supabase.auth.getUser() (valida contra el servidor), no solo por
// su presencia.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === '/panel/login';
  if (!isLoginPage && !user) {
    const loginUrl = new URL('/panel/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/panel/:path*'],
};
