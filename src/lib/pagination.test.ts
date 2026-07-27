import { describe, it, expect } from 'vitest';
import { PAGE_SIZE, paginationMeta, parsePageParam } from './pagination';

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

  // Un número finito pero enorme pasa Number.isFinite sin problema y llegaría
  // a Prisma como un `skip` que desborda el entero de 64 bits de Postgres,
  // reventando la petición con una excepción no capturada. El tope lo impide
  // sin cambiar el comportamiento de "página fuera de rango: lista vacía".
  it('acota una página finita pero absurdamente grande para que el skip nunca desborde', () => {
    const result = paginationMeta(1e19, PAGE_SIZE * 2);
    expect(Number.isSafeInteger(result.safePage * PAGE_SIZE)).toBe(true);
    expect(result.hasNextPage).toBe(false);
  });
});

describe('parsePageParam', () => {
  it('devuelve la página 1 si el parámetro no viene en la URL', () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it('devuelve la página 1 con una cadena vacía o no numérica', () => {
    expect(parsePageParam('')).toBe(1);
    expect(parsePageParam('abc')).toBe(1);
  });

  it('lee una página válida', () => {
    expect(parsePageParam('3')).toBe(3);
  });

  it('sanea cero, negativos y decimales', () => {
    expect(parsePageParam('0')).toBe(1);
    expect(parsePageParam('-5')).toBe(1);
    expect(parsePageParam('2.7')).toBe(2);
  });

  it('sanea notación exponencial que desbordaría el skip de Prisma', () => {
    expect(Number.isSafeInteger(parsePageParam('1e999') * PAGE_SIZE)).toBe(true);
    expect(Number.isSafeInteger(parsePageParam('1e19') * PAGE_SIZE)).toBe(true);
  });

  it('coincide con el saneado interno de paginationMeta para el mismo valor', () => {
    for (const raw of ['1', '7', '0', '-2', 'abc', '1e19', '2.7']) {
      expect(parsePageParam(raw)).toBe(paginationMeta(Number(raw), 0).safePage);
    }
  });
});
