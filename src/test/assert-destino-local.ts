// Guardia compartida por los dos global-setup de test (Vitest y Playwright):
// ambas suites son destructivas y solo pueden correr contra el stack local.
//
// Caso real (2026-07-31): con el .env configurado para producción durante la
// Fase A del despliegue, una ejecución de la suite e2e sembró las cuentas demo
// —cuyas contraseñas están en .env.example, versionado— en el proyecto Supabase
// real. Vive aquí, y no dentro de un global-setup concreto, porque el mismo
// accidente es posible por las dos vías: `pnpm test` trunca todas las tablas
// antes de CADA test (src/test/setup.ts) y `pnpm exec playwright test` además
// da de alta usuarios en Supabase Auth.
//
// Los destinos se comprueban por separado porque son independientes: la base de
// datos sale de TEST_DATABASE_URL, pero la Admin API de Auth usa
// NEXT_PUBLIC_SUPABASE_URL (src/lib/supabase/admin.ts), y es fácil que uno
// apunte a local y el otro a producción mientras se trabaja en el despliegue.
const HOSTS_LOCALES = new Set(['127.0.0.1', 'localhost', '::1']);

export function assertDestinoLocal(nombre: string, valor: string): void {
  let host: string;
  try {
    // URL() no entiende el esquema postgres://, pero sí la misma cadena con
    // http://: lo único que necesitamos de ella es el host.
    host = new URL(valor.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
  } catch {
    // Fail-closed: si no sabemos a dónde apunta, no truncamos nada. Dejar
    // pasar un valor ilegible sería justo el fallo que esta guardia existe
    // para impedir.
    throw new Error(
      `${nombre} no se ha podido interpretar como una URL, así que no se puede comprobar que apunte al stack ` +
        'local. Los tests son destructivos: revisa tu .env (los valores de desarrollo están en .env.example) ' +
        'y comprueba que la contraseña no lleve caracteres sin escapar.',
    );
  }

  // URL() devuelve los hosts IPv6 entre corchetes ("[::1]"): se los quitamos
  // para poder compararlos con la forma en que se escriben en el .env.
  const hostNormalizado = host.replace(/^\[|\]$/g, '');

  if (!HOSTS_LOCALES.has(hostNormalizado)) {
    throw new Error(
      `${nombre} apunta a "${hostNormalizado}", que no es el stack local. Los tests truncan todas las tablas ` +
        '(y los e2e además crean usuarios de Auth): ejecutarlos contra un entorno real destruiría datos. ' +
        'Revisa tu .env (los valores de desarrollo están en .env.example) y vuelve a intentarlo.',
    );
  }
}
