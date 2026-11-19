import { describe, it, expect } from 'vitest';
import { assertSeedDestinoLocal } from './assert-seed-local';

const LOCAL = {
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
};

describe('assertSeedDestinoLocal', () => {
  it('deja pasar el stack local (valores de .env.example)', () => {
    expect(() => assertSeedDestinoLocal(LOCAL)).not.toThrow();
  });

  it('aborta si la base de datos es remota, nombrando la variable y explicando que es el seed', () => {
    expect(() =>
      assertSeedDestinoLocal({ ...LOCAL, DATABASE_URL: 'postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres' })
    ).toThrowError(/DATABASE_URL.*pooler\.supabase\.com.*seed/);
  });

  it('aborta si Auth es remoto aunque la base de datos sea local (las cuentas demo van a Auth)', () => {
    expect(() =>
      assertSeedDestinoLocal({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefgh.supabase.co' })
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL.*abcdefgh\.supabase\.co.*seed/);
  });

  it('el mensaje no habla de "tests" cuando quien aborta es el seed', () => {
    expect(() =>
      assertSeedDestinoLocal({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefgh.supabase.co' })
    ).not.toThrowError(/tests/i);
  });

  it('aborta (fail-closed) si falta alguna de las dos variables', () => {
    expect(() => assertSeedDestinoLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL.NEXT_PUBLIC_SUPABASE_URL })).toThrowError(
      /DATABASE_URL/
    );
    expect(() => assertSeedDestinoLocal({ DATABASE_URL: LOCAL.DATABASE_URL })).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
