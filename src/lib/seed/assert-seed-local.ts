import { assertDestinoLocal } from '@/test/assert-destino-local';

// Guardia antiproducción del seed demo (prisma/seed.ts). El seed no se limita
// a crear "Salón Aura": también da de alta en Supabase Auth un dueño demo y un
// super-admin demo cuyas contraseñas son públicas (están en .env.example,
// versionado, y además son el valor por defecto de getDemo*Credentials aunque
// no se definan las variables DEMO_*).
//
// Caso real (2026-11): `pnpm db:seed` se ejecutó contra producción y dejó esas
// cuentas en el proyecto Supabase real, con acceso a /admin para cualquiera que
// leyera el repo. Por eso el seed comprueba los dos destinos antes de tocar
// nada, igual que las suites de test: la base de datos (DATABASE_URL, Prisma) y
// Auth (NEXT_PUBLIC_SUPABASE_URL, Admin API de src/lib/supabase/admin.ts), que
// son independientes y pueden apuntar cada uno a un sitio.
//
// Recibe el entorno como parámetro (en vez de leer process.env) para poder
// testearla sin tocar variables globales.
const MOTIVO_SEED =
  'El seed demo crea un dueño y un super-admin con contraseñas públicas (.env.example): ' +
  'ejecutarlo contra un entorno real daría acceso a /admin a cualquiera. El seed es solo para desarrollo local.';

const VARIABLES = ['DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const;

export function assertSeedDestinoLocal(env: Partial<Record<string, string | undefined>>): void {
  for (const nombre of VARIABLES) {
    const valor = env[nombre];
    if (!valor) {
      // Fail-closed: sin saber a dónde apunta, no se siembra nada.
      throw new Error(`${nombre} no está definida, así que no se puede comprobar que el seed apunte al stack local.`);
    }
    assertDestinoLocal(nombre, valor, MOTIVO_SEED);
  }
}
