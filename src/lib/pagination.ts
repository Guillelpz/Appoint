export const PAGE_SIZE = 20;

// Tope absoluto de página. No es el número real de páginas: pedir una página
// fuera de rango sigue devolviendo una lista vacía (comportamiento aceptado y
// testeado). Es una cota de seguridad, porque `Number.isFinite` no basta: un
// `?page=1e19` es perfectamente finito, sobrevive al saneado y llega a Prisma
// como `skip: 2e20`, que desborda el entero de 64 bits de Postgres y revienta
// la petición con una excepción no capturada (no hay `error.tsx` en las zonas
// protegidas). Un millón de páginas × PAGE_SIZE sigue siendo un `skip`
// trivialmente seguro y está muy por encima de cualquier uso real.
const MAX_PAGE = 1_000_000;

export interface PaginatedResult<T> {
  items: T[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

function sanitizePage(page: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.min(Math.max(1, Math.floor(page) || 1), MAX_PAGE);
}

/**
 * Convierte el `?page=` crudo de la URL en un número de página utilizable.
 * Cualquier valor ausente, no numérico, negativo, cero o absurdamente grande
 * cae a la página 1 o al tope. Vive aquí (y no duplicado en cada `page.tsx`)
 * porque el valor alimenta a la vez la consulta a Prisma y los enlaces
 * "Anterior"/"Siguiente": si las dos fórmulas divergen, la UI muestra un
 * número de página distinto del que realmente se consultó.
 */
export function parsePageParam(raw: string | undefined): number {
  return sanitizePage(Number(raw));
}

export function paginationMeta(page: number, totalCount: number): { safePage: number; hasNextPage: boolean; hasPreviousPage: boolean } {
  const safePage = sanitizePage(page);
  return {
    safePage,
    hasPreviousPage: safePage > 1,
    hasNextPage: safePage * PAGE_SIZE < totalCount,
  };
}
