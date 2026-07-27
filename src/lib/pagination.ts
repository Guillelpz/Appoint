export const PAGE_SIZE = 20;

export interface PaginatedResult<T> {
  items: T[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function paginationMeta(page: number, totalCount: number): { safePage: number; hasNextPage: boolean; hasPreviousPage: boolean } {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page) || 1) : 1;
  return {
    safePage,
    hasPreviousPage: safePage > 1,
    hasNextPage: safePage * PAGE_SIZE < totalCount,
  };
}
