#!/bin/bash
# Prepara las sesiones de Claude Code en la nube para que `pnpm test` funcione.
# En la nube no arranca `supabase start` (la red bloquea sus imágenes Docker),
# así que Vitest usa el Postgres 16 del propio contenedor en el puerto 5432.
# Playwright (e2e) necesita Supabase Auth: se ejecuta en GitHub Actions (ci.yml).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Postgres del sistema + BD de tests (idempotente).
if ! pg_isready -q -h 127.0.0.1 -p 5432; then
  service postgresql start >/dev/null
  for _ in $(seq 1 20); do pg_isready -q -h 127.0.0.1 -p 5432 && break; sleep 1; done
fi
su postgres -c "psql -q -c \"ALTER USER postgres PASSWORD 'postgres';\"" >/dev/null
if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='appoint_test'\"" | grep -q 1; then
  su postgres -c "createdb appoint_test"
fi

# .env local: valores de .env.example, con TEST_DATABASE_URL al Postgres del
# contenedor. Nunca se sobrescribe un .env existente.
if [ ! -f .env ]; then
  sed 's#127.0.0.1:54322/appoint_test#127.0.0.1:5432/appoint_test#' .env.example > .env
fi

# Dependencias: solo si cambian el lockfile, package.json o este script.
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  pnpm install --frozen-lockfile
  # pnpm 10 no ejecuta scripts de build de dependencias: el cliente de Prisma
  # hay que generarlo a mano.
  pnpm exec prisma generate
  sha256sum .claude/hooks/session-start.sh package.json pnpm-lock.yaml prisma/schema.prisma > "$hashes" || rm -f "$hashes"
fi
