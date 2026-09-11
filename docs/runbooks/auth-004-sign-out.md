# Runbook — `AUTH-004` sign-out

> Every command below was executed on 2026-09-07 against the development
> PostgreSQL 17.11 and a Next 16.3.4 server built with `next build` and served
> with `next start`, and its output is the output recorded here. The
> deploy-level commands — restart, redeploy — await `OPS-001` and are written as
> `<OPS-001>` where the concrete command does not exist yet.
>
> **What reaches a person today:** the two endpoints, the header, and the session
> list at `/account/sessions` (`AUTH-004/T2`), which lists this account's live
> sessions, marks this device, and carries the control that ends them all. The
> endpoints are mounted and live: anything holding a session cookie can end its
> own session or every session the account holds.

## What this feature is

Ending a session on the server. `POST /api/auth/sign-out` deletes the `sessions`
row the cookie names and then expires the cookie, in that order — a cookie
cleared first leaves a live session with nobody holding the reference.
`POST /api/account/sessions/all` resolves the cookie to an account — without
sliding the session, since it is about to delete it — and deletes every session
it holds, which is the lever for somebody who thinks their password is known. `proxy.ts` marks any response to a request carrying a session
cookie `Cache-Control: no-store`, so the back button after a sign-out cannot
re-display a rendered gated page.

The thing that goes wrong most often is a sign-out that appears to work and did
not: the browser drops the cookie, the row survives, and a copy of that cookie
still authenticates. It is invisible from the response — a sign-out that deleted
nothing returns the same `303` as one that deleted everything — so it is
diagnosed from the `sessions` table and never from the answer.

## How to tell it is broken

| Signal | Meaning |
|---|---|
| a person signs out and a copy of their cookie still works | the delete is not running or is not matching. Check the row (D1): if it survives a sign-out, the deletion is the fault, not the cookie |
| every sign-out answers `500` | the database is unreachable. This is deliberate — a failed delete raises rather than reporting a sign-out that did not happen — and the sign-in path will be failing too |
| a sign-out answers `405` | it arrived as `GET`. Only `POST` is exported, which is what stops an embedded image or a link checker signing somebody out |
| `sessions/all` answers `303` and ends nothing | the cookie did not resolve: expired, already deleted, or the account is not `active`. Resolution is the authorisation, so a cookie that no longer authenticates ends nothing (D1) |
| a gated page comes back on the back button after a sign-out | the response was stored. Check the header (D2): a signed-in request must answer `no-store` |
| every signed-in page reloads its bundle on each navigation | the proxy matcher stopped exempting `_next/static`. Assets must stay `immutable` (D5) |
| a bulk invalidation leaves no audit row | expected today. The `session.invalidate_all` insert is `SEC-002/T3` and is unbuilt; the call site carries the `Deferred:` marker that names it |

Healthy: a `POST` to either endpoint answers `303` with `location: /` and
`set-cookie: …; Max-Age=0`, the account's row count falls, and a signed-in
request for any page answers `no-store`.

## Immediate mitigation

- **A stolen or shared cookie, and the person cannot reach a sign-out** — end
  every session that account holds. The gate refuses on the next request; there
  is no cache in front of it. This is the same delete `sessions/all` performs.

      psql "$DATABASE_URL" -c "delete from sessions where account_id = (select id from accounts where email = 'reader@example.test')"
      DELETE 2

- **Sign-out is failing and sessions must end anyway** — the delete above is the
  whole of what the endpoint does. Nothing else is required to make a session
  stop working.

- **Responses are being stored when they should not be** — there is no flag to
  turn off, because the failure direction is the dangerous one. Confirm with D2,
  then redeploy the prior image (`<OPS-001>`); the sign-out endpoints set
  `no-store` on their own responses and are unaffected by the proxy either way.

## Diagnosis

Cheapest first.

1. **Did the row actually go?** Run this before and after a sign-out. The count
   falling by one is the whole answer; `live` is `t` for a session the gate
   still accepts.

       psql "$DATABASE_URL" -c "select a.email, s.last_seen_at, s.expires_at, s.expires_at > now() as live from sessions s join accounts a on a.id = s.account_id where a.email = 'reader@example.test' order by s.last_seen_at desc"

               email        |         last_seen_at          |          expires_at           | live
       ---------------------+-------------------------------+-------------------------------+------
        reader@example.test | 2026-09-07 09:44:07.784361+00 | 2026-09-07 10:44:07.784361+00 | t
        reader@example.test | 2026-09-07 09:44:07.784361+00 | 2026-09-07 10:44:07.784361+00 | t
       (2 rows)

2. **Is a signed-in response unstorable?** The cookie name is `valotech` in
   development and `__Host-valotech` everywhere else; send the one this
   deployment uses.

       curl -s -o /dev/null -D - "$APP_ORIGIN/" -H "Cookie: valotech=<any-value>" | grep -i '^cache-control'
       cache-control: no-store

   The value need not be a real session — the proxy asks whether a cookie was
   presented, not whether it resolves. If this answers anything else, the proxy
   is not running for that path.

3. **Is an anonymous response still cacheable?** It should be: marking the
   public gateway unstorable for everybody would be a different defect.

       curl -s -o /dev/null -D - "$APP_ORIGIN/" | grep -i '^cache-control'
       Cache-Control: s-maxage=31536000

4. **Are the endpoints mounted, and is `GET` refused?**

       curl -s -o /dev/null -w '%{http_code}\n' -X POST "$APP_ORIGIN/api/auth/sign-out"
       303
       curl -s -o /dev/null -w '%{http_code}\n' "$APP_ORIGIN/api/auth/sign-out"
       405

5. **Are immutable assets still storable for a signed-in reader?** A `no-store`
   here is a performance regression, not a leak, and it means the matcher's
   exemption broke.

       curl -s -o /dev/null -D - "$APP_ORIGIN/_next/static/chunks/<hash>.js" -H "Cookie: valotech=<any-value>" | grep -i '^cache-control'
       Cache-Control: public, max-age=31536000, immutable

**The back button, in a browser.** The header is the mechanism, measured above;
the behaviour it buys — pressing Back after a sign-out and getting the sign-in
path rather than a rendered gated page — is exercised on the admin console
(`/admin`), which the gate refuses to an unauthenticated reader exactly as it
will the investor room, so it did not wait for `INV-002`. Driven on Chromium
(`AUTH-004/T4`, 2026-09-11): a signed-in request for the console answered
`no-store`, a sign-out landed on the public root, and the Back button re-fetched
the console and was redirected to the sign-in path rather than restoring it from
history. Safari's back-forward cache treats `no-store` differently and is worth
a WebKit spot-check when one is to hand; it is the same header on the same
response either way.

## Rollback

Sign-out is code and holds no migration of its own — `sessions` and `accounts`
precede it — so there is nothing to unwind in the data. If a deploy broke it,
redeploy the prior image (`<OPS-001>`). Nobody is signed out by the rollback:
sessions are rows, not process memory, and a deleted row does not come back.

Rolling back past this feature restores the state it was built to end — a
session that can only be ended by waiting for `expires_at`, which is
`SESSION_TTL_SECONDS` (default 43200, twelve hours). The manual delete under
**Immediate mitigation** works in that state too and is the fallback.

## What this feature depends on

`DATA-001`'s `sessions` table, `AUTH-002`'s cookie and gate
(`docs/runbooks/auth-002-session-and-role-gate.md`) — `sessions/all` resolves
through `accountForToken`, the gate's non-sliding sibling, so anything that stops
the gate resolving stops the bulk invalidation too, and it fails closed by ending
nothing rather than by extending the session it could not delete. `SEC-002/T3` owes
the `session.invalidate_all` audit row.

## Verified

2026-09-07, against PostgreSQL 17.11 and a `next build` artifact served by
`next start`, by the `AUTH-004` build: every command above was executed and its
output is the output recorded here. The back-button behaviour named in
**Diagnosis** was then driven on Chromium against the admin console on
2026-09-11 (`AUTH-004/T4`); a WebKit spot-check is the one variation not yet run,
and it says so where it is written.
