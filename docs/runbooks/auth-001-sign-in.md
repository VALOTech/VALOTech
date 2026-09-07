# Runbook — `AUTH-001` sign-in

> The status codes and the startup behaviour below are what
> `apps/web/src/app/api/auth/sign-in/route.test.ts` and
> `apps/web/src/config/index.test.ts` measure against a real PostgreSQL. The
> deploy-level commands — restart, redeploy — await `OPS-001` and are named as
> `<OPS-001>` where the concrete command does not exist yet.

## What this feature is

`POST /api/auth/sign-in` — the one door into the investor room. It rate-limits by
account and by address, verifies an Argon2id password — paying the same cost when
the account does not exist, so the response time tells an attacker nothing — and
on success writes a session row and returns the cookie. The thing that goes wrong
most often is a legitimate reader locked out by the rate limit.

## How to tell it is broken

| Signal | Meaning |
|---|---|
| a known-good credential returns `401` | the account is not `active`, the password is wrong, or its hash column is empty (an `invited` account never onboarded) |
| a returning reader gets `429` | the rate limit — `AUTH_MAX_ATTEMPTS` (default five) per account and per address within `AUTH_WINDOW_SECONDS` (default fifteen minutes) |
| `500` with an empty body | the database is unreachable; the empty body is deliberate, so read the logs, not the response |
| the process will not start, naming a variable | a required credential is missing (`CRED-001`); it fails at start, not at the first request |
| in production the cookie is set but no session sticks | the `__Host-` cookie requires HTTPS; a plain-HTTP response drops it silently |

Healthy: a correct sign-in returns `204` with one `Set-Cookie`.

## Immediate mitigation

- **A reader, or everyone, locked out (`429`)** — the limiter counts in this
  process's memory (`INFRA-001`: no Redis), so restarting the application process
  clears every counter at once. `<OPS-001>` restart.
- **Will not start** — the startup message names the missing variable; set it
  (`credentials/README.md`) and restart.
- **`500`** — the database is down or `DATABASE_URL` is wrong; sign-in cannot work
  until the database answers.

## Diagnosis

Cheapest first.

1. Probe the door:
   `curl -sS -o /dev/null -w '%{http_code}\n' -X POST <origin>/api/auth/sign-in -H 'Content-Type: application/json' -d '{"email":"you@example.test","password":"..."}'`
   → `204` healthy · `401` credentials · `429` rate limit · `500` database · `403` the request was cross-origin.
2. The database answers: `psql "$DATABASE_URL" -c 'select count(*) from accounts'`.
3. TLS in production: `psql "$DATABASE_URL" -c 'select ssl from pg_stat_ssl where pid = pg_backend_pid()'` returns `t`. The application refuses to start with an unencrypted link outside development (`CRED-001`), so a running production process has already passed this.

## Rollback

Sign-in adds no migration of its own beyond the `accounts` and `sessions` tables,
which precede it, so there is nothing to unwind. If a deploy broke it, redeploy
the prior image (`<OPS-001>`); the in-memory rate limit clears with the restart.
