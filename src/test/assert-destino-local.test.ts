import { describe, it, expect } from 'vitest';
import { assertDestinoLocal } from './assert-destino-local';

describe('assertDestinoLocal', () => {
  it('acepta las tres formas de referirse al stack local', () => {
    expect(() =>
      assertDestinoLocal('TEST_DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/appoint_test')
    ).not.toThrow();
    expect(() => assertDestinoLocal('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')).not.toThrow();
    // IPv6: new URL() devuelve el hostname entre corchetes ("[::1]"), así que
    // compararlo con "::1" a secas dejaría esta forma fuera.
    expect(() =>
      assertDestinoLocal('TEST_DATABASE_URL', 'postgresql://postgres:postgres@[::1]:54322/appoint_test')
    ).not.toThrow();
  });

  it('rechaza un destino remoto nombrando la variable y el host', () => {
    expect(() =>
      assertDestinoLocal('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefgh.supabase.co')
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL.*abcdefgh\.supabase\.co/);
  });

  it('rechaza un host que solo *contiene* localhost, sin serlo', () => {
    expect(() => assertDestinoLocal('TEST_DATABASE_URL', 'postgresql://u:p@localhost.evil.com:5432/db')).toThrow();
  });

  it('rechaza —en vez de dejar pasar— un valor que no se puede parsear', () => {
    // Un fallo de URL() no puede saldarse con "no sé, adelante": si no sabemos
    // a dónde apunta, no podemos truncar nada. El mensaje tiene que decir qué
    // variable revisar, no el TypeError críptico de la plataforma.
    expect(() => assertDestinoLocal('TEST_DATABASE_URL', 'no-es-una-url')).toThrowError(
      /TEST_DATABASE_URL.*no se ha podido interpretar/
    );
  });
});
