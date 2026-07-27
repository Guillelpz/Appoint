import { describe, it, expect } from 'vitest';
import { PAGE_SIZE, paginationMeta } from './pagination';

describe('paginationMeta', () => {
  it('calcula la página 1 cuando hay más resultados de los que caben en una página', () => {
    const result = paginationMeta(1, PAGE_SIZE + 5);
    expect(result).toEqual({ safePage: 1, hasPreviousPage: false, hasNextPage: true });
  });

  it('calcula una página intermedia', () => {
    const result = paginationMeta(2, PAGE_SIZE * 3);
    expect(result).toEqual({ safePage: 2, hasPreviousPage: true, hasNextPage: true });
  });

  it('trata la página 0 como página 1', () => {
    const result = paginationMeta(0, PAGE_SIZE * 2);
    expect(result.safePage).toBe(1);
    expect(result.hasPreviousPage).toBe(false);
  });

  it('trata un número negativo como página 1', () => {
    const result = paginationMeta(-3, PAGE_SIZE * 2);
    expect(result.safePage).toBe(1);
  });

  it('trata NaN como página 1', () => {
    const result = paginationMeta(NaN, PAGE_SIZE * 2);
    expect(result.safePage).toBe(1);
  });

  it('trata Infinity como página 1 (evita un skip: Infinity inválido para Prisma)', () => {
    const result = paginationMeta(Infinity, PAGE_SIZE * 2);
    expect(result.safePage).toBe(1);
  });

  it('trata -Infinity como página 1', () => {
    const result = paginationMeta(-Infinity, PAGE_SIZE * 2);
    expect(result.safePage).toBe(1);
  });

  it('redondea hacia abajo una página decimal', () => {
    const result = paginationMeta(2.7, PAGE_SIZE * 3);
    expect(result.safePage).toBe(2);
  });

  it('no rompe con totalCount cero', () => {
    const result = paginationMeta(1, 0);
    expect(result).toEqual({ safePage: 1, hasPreviousPage: false, hasNextPage: false });
  });

  it('hasNextPage pasa de true a false justo al llegar al borde con PAGE_SIZE elementos exactos', () => {
    const conUnoMas = paginationMeta(1, PAGE_SIZE + 1);
    expect(conUnoMas.hasNextPage).toBe(true);

    const exacto = paginationMeta(1, PAGE_SIZE);
    expect(exacto.hasNextPage).toBe(false);
  });
});
