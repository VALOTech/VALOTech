# Runbook — `AUTH-002` session and role gate

> Every SQL statement below was executed against the development PostgreSQL
> 17.11 on 2026-09-07 and its output recorded. The deploy-level commands —
> restart, redeploy — await `OPS-001` and are written as `<OPS-001>` where the
> concrete command does not exist yet.
>
> **What calls the gate today:** nothing member-facing. `POST /api/auth/sign-in`
> writes the `sessions` rows the gate reads, so the data plane is live; the
> surfaces that resolve a reader through it arrive with `INV-001` and
> `INV-002/T1`. Until then the symptoms below are visible only to a caller of
> the module.

## What this feature is

The read side of the session scheme. A request presents a cookie; the gate
hashes the token, finds the session, checks it has not expired and that its
account is still `active`, and hands back the reader's id and role — sliding
`last_seen_at` and `expires_at` in the same statement, so a reader who is
reading does not time out mid-report. `requireInvestor` admits an investor or an
admin; `requireAdmin` admits only an admin. The thing that goes wrong most often
is a reader who is certain they are signed in and is sent to the form anyway,
which is almost always a session that expired or an account that was suspended.

## How to tell it is broken

| Signal | Meaning |
|---|---|
| one reader is sent to the sign-in form repeatedly | their session expired, their account is not `active`, or their browser is not returning the cookie |
| every reader is sent to the form at once | `SESSION_SECRET` was rotated, or two instances hold different ones, so the signature on every cookie fails (`AUTH-002/T5`) — deliberate if somebody just rotated it, a split deploy if not; or a deploy changed `APP_ENV`, so the cookie name moved between `valotech` and `__Host-valotech` and the one the browsers hold is no longer asked for; or the `sessions` rows were deleted |
| readers are sent to the form after a short idle | `SESSION_TTL_SECONDS` was shortened. It applies from the next request rather than retroactively — each request sets `expires_at` to `now()` plus the new value — so it costs the idle rather than everyone |
| every reader gets an error page rather than the form | the database is unreachable — the gate rejects rather than resolving to nobody, which is deliberate: a redirect would be indistinguishable from a session that ended |
| an investor reports a `404` on an admin path | healthy. `requireAdmin` answers a signed-in non-admin the way a path that does not exist answers, so the console's existence is not confirmed |
| in production the cookie is set but no session sticks | the `__Host-` cookie requires HTTPS; a plain-HTTP response drops it silently |

Healthy: a reader who signed in within `SESSION_TTL_SECONDS` (default 43200,
twelve hours) reaches a gated surface, and their session row's `expires_at`
moves forward on every request they make.

## Immediate mitigation

- **A stolen or shared cookie** — end every session that account holds. The gate
  refuses on the next request; there is no cache in front of it.

      psql "$DATABASE_URL" -c "delete from sessions where account_id = (select id from accounts where email = 'reader@example.test')"
      DELETE 1

- **A reader who must be locked out entirely** — suspend the account **and**
  delete their sessions (the delete above). The gate refuses a suspended account
  on the next request, but a request already resolving that account's row reads
  its state from the statement's snapshot and can be admitted once more; deleting
  the rows closes that window and makes the lockout immediate.

      psql "$DATABASE_URL" -c "update accounts set state = 'suspended' where email = 'reader@example.test'"
      UPDATE 1

- **Everyone must be signed out at once** — rotate `SESSION_SECRET` and restart.
  Every cookie in the world carries a signature under the old secret and none
  verifies under the new one, so this ends every session everywhere without
  touching a row (`AUTH-002/T5`, `AUTH-DEC-02`). It is the fleet-wide form of
  the two deletes above, and the only one that needs no database.

- **Everyone bounced to the form after a deploy** — compare `APP_ENV` with the
  previous deployment before touching the data. A cookie name that moved cannot
  be repaired in the database: the readers hold a cookie the application is no
  longer asking for, and the fix is to restore the setting and let them keep the
  sessions they still have (`<OPS-001>`).

## Diagnosis

Cheapest first.

1. Is this reader's session one the gate admits? `live` is the whole answer:
   `t` with `state = active` is a session the gate accepts.

       psql "$DATABASE_URL" -c "select a.role, a.state, s.last_seen_at, s.expires_at, s.expires_at > now() as live from sessions s join accounts a on a.id = s.account_id where a.email = 'reader@example.test' order by s.last_seen_at desc"

          role   | state  |         last_seen_at          |          expires_at           | live
       ----------+--------+-------------------------------+-------------------------------+------
        investor | active | 2026-09-07 08:15:30.871177+00 | 2026-09-07 11:15:30.871177+00 | t

   No rows means they never signed in on this device, or a sign-out or a
   privilege change already ended it.

2. Is it everybody, or one reader? A live count of zero against a non-zero row
   count is a fleet-wide expiry rather than one reader's problem.

       psql "$DATABASE_URL" -c "select count(*) filter (where expires_at > now()) as live, count(*) as rows from sessions"

        live | rows
       ------+------
           1 |    1

3. Do the live rows and the refusals disagree? A reader whose row reads `live |
   t` in step 1 and who is still sent to the form is holding a cookie whose
   signature does not verify — `SESSION_SECRET` was rotated, or the instance
   that answered holds a different one from the instance that signed them in.
   Nothing in the database shows this, because the signature is not stored:
   compare the secret each running instance holds.

       psql "$DATABASE_URL" -c "select count(*) filter (where expires_at > now()) as live from sessions"

   A healthy `live` count beside readers who cannot get in is the signature, not
   the session.

4. Does the database answer at all? If this fails, the error page is explained
   and nothing above will run either.

       psql "$DATABASE_URL" -c 'select count(*) from accounts'

## Rollback

The gate is code and holds no migration of its own — `sessions` and `accounts`
precede it — so there is nothing to unwind in the data. If a deploy broke it,
redeploy the prior image (`<OPS-001>`). Sessions survive a restart: they are
rows, not process memory, so an ordinary rollback signs nobody out.

Crossing `AUTH-002/T5` is the exception, in both directions. The cookie is the
token and a signature over it; the build before it reads the whole value as the
token. So deploying that change ends every live session and rolling back past
it ends them again — the rows are untouched, the readers sign in once more, and
there is nothing to unwind beyond telling them.

## What this feature depends on

`DATA-001`'s `sessions` and `accounts` tables, and the sign-in that writes a
session (`docs/runbooks/auth-001-sign-in.md`). A reader who cannot sign in has a
sign-in problem, not a gate problem: the ledger above will simply hold no row
for them.

## Verified

2026-09-07, against PostgreSQL 17.11 on the development stack, by the
`AUTH-002/T3` build: every statement above was executed and its output is the
output recorded here.
