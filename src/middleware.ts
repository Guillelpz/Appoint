import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

interface ProtectedZone {
  prefix: string;
  loginPath: string;
  publicPaths: string[];
}

// Cada zona protegida (panel del negocio, panel de super-admin) comparte la
// misma lógica de refresco de cookies de Supabase; lo único que cambia es el
// prefijo de ruta, a dónde redirigir si no hay sesión, y qué rutas dentro de
// ese prefijo son accesibles SIN sesión previa. Para /panel eso incluye
// /panel/invitacion: el dueño invitado llega ahí sin sesión todavía — la
// establece la propia página con el token de invitación (ver
// src/app/panel/invitacion/actions.ts) — así que no puede exigirse sesión
// previa para visitarla.
const PROTECTED_ZONES: ProtectedZone[] = [
  { prefix: '/panel', loginPath: '/panel/login', publicPaths: ['/panel/login', '/panel/invitacion'] },
  { prefix: '/admin', loginPath: '/admin/login', publicPaths: ['/admin/login'] },
];

// Refresca la sesión de Supabase (renueva el access token si ha caducado) en
// cada petición a /panel/* o /admin/* y redirige a la página de login de esa
// zona si no hay sesión. Es la primera barrera; requirePanelSession()/
// requireAdminSession() son la segunda, dentro de cada layout protegido —
// Supabase recomienda esta doble comprobación porque una cookie de sesión
// presente pero inválida solo se detecta al llamar a supabase.auth.getUser()
// (valida contra el servidor), no solo por su presencia.
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

  const zone = PROTECTED_ZONES.find((z) => request.nextUrl.pathname.startsWith(z.prefix));
  if (zone) {
    const isPublicPath = zone.publicPaths.includes(request.nextUrl.pathname);
    if (!isPublicPath && !user) {
      const loginUrl = new URL(zone.loginPath, request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ['/panel/:path*', '/admin/:path*'],
};
