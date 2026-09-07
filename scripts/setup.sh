#!/usr/bin/env bash
# First run from a fresh clone (INFRA-001/T5).
#
# The steps that take a checkout with no .env, no node_modules and no database
# to a stack that is up and a schema that is applied. Each step is idempotent,
# so running it again on a half-set-up clone finishes the job rather than
# starting a second one: it never overwrites an existing .env and never resets a
# running database. The two required secrets are the owner's to set and are not
# invented here (CRED-001) — the application refuses to start until SESSION_SECRET
# is, and this script says so rather than papering over it.
set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf 'setup: %s\n' "$1"; }

# 1. .env — from the catalogue if absent, never over an existing one. This is
#    where the owner's secrets go; env.example carries a working local
#    DATABASE_URL and an empty SESSION_SECRET, clearly marked.
if [ -f .env ]; then
  say ".env is already present, left as is"
else
  cp env.example .env
  say "created .env from env.example"
fi

# 2. Application dependencies. npm install is idempotent against package-lock.
say "installing apps/web dependencies"
( cd apps/web && npm install )

# 3. The local stack. `up -d` is a no-op if it is already running.
say "starting PostgreSQL on 5434"
docker compose up -d

# 4. Wait for the database to accept connections, then apply the schema. A
#    migration against a database that is not yet ready fails in a way that reads
#    like a wrong password, so the wait is what keeps the first run honest.
say "waiting for PostgreSQL to report healthy"
ready=""
for _ in $(seq 1 30); do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' valotech-postgres 2>/dev/null || echo starting)" = "healthy" ]; then
    ready="yes"
    break
  fi
  sleep 2
done
if [ -z "$ready" ]; then
  say "PostgreSQL did not become healthy; check 'docker compose logs postgres'"
  exit 1
fi

say "applying migrations"
# The migrate command reads DATABASE_URL from the environment; source .env for
# this step so a fresh clone needs nothing exported by hand. env.example's
# comments are '#' lines and its values carry no spaces, so it sources cleanly.
set -a
# shellcheck disable=SC1091
. ./.env
set +a
( cd apps/web && npm run migrate:up )

cat <<'DONE'

setup: the stack is up and the schema is applied.
  next:
    1. set SESSION_SECRET in .env — open credentials/credential-input.html to
       generate one; the application refuses to start without it (CRED-001).
    2. cd apps/web && npm run dev   (the application on http://localhost:3100)
  make doctor   says where the work stands
  make check    runs every gate this repository has
  make install-hooks   arms the pre-push guard for this clone
DONE
