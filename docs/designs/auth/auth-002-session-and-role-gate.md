---
code: AUTH-002
title: Session and role gate
domain: auth
prd_refs: [AUTH-002, SEC-R01, SEC-R02, DATA-R05]
depends_on: [AUTH-001, DATA-001]
depended_by: [ADMIN-002, AUTH-004, CMS-001, CMS-006, INV-001, INV-002, SEC-001, SITE-005]
layers_touched: [data, domain, service, api, frontend]
cross_cutting_rules: [SEC-R01, SEC-R02, DATA-R05, DATA-R02]
status: design-ready
---

# `AUTH-002` — Session and role gate

## 1. Purpose and PRD refs

What a signed-in reader carries, and what it entitles them to. This is the
feature that turns the gateway's CSS demonstration into a control: after it,
gated material is chosen by the server and never reaches an unauthorised reader
at all. Realizes `AUTH-002`, `SEC-R01` and `SEC-R02`, and every read in the
investor room passes through it.

It is the most load-bearing feature in the repository. Everything after it reads
through the gate this builds, so a shortcut here is a shortcut in every feature
that follows.

## 2. Layer walkthrough

**Down.** `AUTH-001` verifies a password and calls `issue(accountId)`. That
writes a `sessions` row, sets a cookie holding a random token, and stores only
the token's hash — a database dump is then not a set of live sessions. Every
subsequent request presents the cookie; middleware resolves it to an account and
a role once, and puts them on the request.

**Up.** A page or route asks for the reader it needs — `requireInvestor()`,
`requireAdmin()` — and gets an account or a redirect. A repository function takes
that role as an argument and filters in SQL. Nothing renders a value it then
hides: the row was never fetched.

## 3. Contracts

### Cookie

| Property | Value | Why |
|---|---|---|
| name | `__Host-valotech` in staging and production, `valotech` in development | the `__Host-` prefix forbids `Domain` and requires `Secure`, so a subdomain cannot set it; development is plain HTTP and cannot use it |
| value | 32 random bytes, base64url | the `sessions.id` is never in the cookie |
| `HttpOnly` | yes | script cannot read it, so an XSS is not automatically a session theft |
| `SameSite` | `Lax` | a cross-site POST carries no session; a normal navigation does |
| `Secure` | outside development | |
| `Max-Age` | `SESSION_TTL_SECONDS`, default 43200 | |

### Rotation and invalidation

- **On sign-in** a new session row is written and any cookie already presented is
  discarded, so a fixed session cannot be planted before the reader signs in.
- **On a privilege change** — role changed, password changed, account suspended —
  every session for that account is deleted. The change is not complete until
  they are.
- **On sign-out** the row is deleted server-side and the cookie is cleared. The
  order matters: clear-then-delete leaves a window where a copied cookie still
  works.

### The gate

    requireInvestor(request) -> Account | Redirect
    requireAdmin(request)    -> Account | Redirect

and every repository read takes an `Actor`:

    listPosts(actor)                 // filters on audience by actor.role
    readDeck(actor, deckId)          // joins deck_grants; an ungranted deck is not found
    readDeckVersion(actor, deckId)   // only the published current version, unless admin

**There is no read function without an actor.** That is the whole of `DATA-R05`
in this codebase: the rule is a signature rather than a habit, so forgetting it
does not compile.

### What "not found" means

An investor asking for a deck they were not granted gets the same `404` as one
asking for a deck that does not exist. A `403` would confirm the deck exists,
which is the same oracle `SEC-R03` closes on the sign-in form.

## 4. Integration

**`AUTH-001`** is the only caller of `issue()`. **`DATA-001`** holds `sessions`,
and its `on delete cascade` is what makes erasing an account end its sessions.
**`INV-002`** — serving the gated chapters — is the first consumer and cannot
start before `AUTH-002/T3`. **`ADMIN-001`** calls the privilege-change
invalidation whenever it suspends or re-roles an account.

## 5. Cross-cutting compliance

- **`SEC-R01`** — the gate is the server. After this feature the CSS class on the
  static page is a fallback for a page that no longer needs one.
- **`SEC-R02`** — httpOnly, SameSite=Lax, Secure outside development, rotated on
  privilege change, invalidated server-side.
- **`DATA-R05`** — enforced by the actor parameter, checked at the query.
- **`DATA-R02`** — a session log line carries an account id and never an address.

## 6. Open questions and trade-offs

- **Sliding expiry.** `last_seen_at` is written on each request, which is a write
  per request for a room with a handful of readers — acceptable here and not in a
  larger product. If it ever matters, the write becomes periodic rather than the
  expiry becoming absolute: an investor timed out mid-read is worse than a row
  written too often.
- **A library or a hundred lines.** Auth.js brings providers and adapters this
  product will never use, and its session model would still need the role-taking
  repository above it. The decision is not settled here because it is
  implementation, not behaviour, and `INFRA-DEC-01` already names Auth.js as the
  expected shape; if the build finds it a poor fit, that is a note on this design
  and a register entry, not a silent substitution.

## 7. Task list

- `AUTH-002/T1` — Session cookie: httpOnly, SameSite=Lax, Secure, rotated on sign-in
- `AUTH-002/T2` — Server-side invalidation, so a stolen cookie dies on sign-out
- `AUTH-002/T3` — Role gate at the query, not the template; a helper that cannot be forgotten
- `AUTH-002/T4` — Isolation test: an investor request for another investor's deck returns nothing, not a redirect
