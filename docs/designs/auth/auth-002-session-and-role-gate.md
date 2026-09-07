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
subsequent request presents the cookie, and the gate resolves it to an account
and a role where a reader is needed. Resolving slides the session, so it is a
write per resolve rather than per request: a surface resolves once, at the top,
and passes the actor to its reads.

**Up.** A page or route asks for the reader it needs — `requireInvestor()`,
`requireAdmin()` — and gets an actor or the response to return in its place. A
repository function takes that actor as an argument and filters in SQL. Nothing
renders a value it then hides: the row was never fetched.

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

- **On sign-in** a new session row is written and the `Set-Cookie` replaces any
  cookie already presented, so a value planted in the reader's browser before
  they sign in never becomes their authenticated session. The planted row, if
  there was one, is left server-side — signing in defeats fixation, it does not
  revoke a stolen cookie; that is `AUTH-004`'s sign-out or a privilege change.
- **On a privilege change** — role changed, password changed, account suspended —
  every session for that account is deleted. The change is not complete until
  they are.
- **On sign-out** the row is deleted server-side and the cookie is cleared. The
  order matters: clear-then-delete leaves a window where a copied cookie still
  works.

### The gate

    requireInvestor(request) -> Actor | Response
    requireAdmin(request)    -> Actor | Response

`requireInvestor` admits an admin as well as an investor — an admin may read
what an investor may — while `requireAdmin` admits only an admin. An `Actor` is
the account's id and its role: everything a read filters on, and nothing a
caller can start rendering. What comes back in its place is the
response the caller returns — `303 See Other` to the sign-in form when there is
no reader, so a refused `POST` does not reach the form still carrying the body
it was refused for, and `404` when the reader is signed in and not entitled to
that surface. Both carry `no-store`, because the answer belongs to whoever
asked rather than to the path they asked for.

Resolving a session slides it: `last_seen_at` and `expires_at` move in the same
statement that admits the session, so the predicate that refuses an expired or
suspended session is the predicate that withholds the slide, and no ordering
mistake can extend a session that had already ended.

A route handler holds a request and returns that response as it stands. A page
holds headers rather than a request, hands those to the same helper, and turns
a response it gets back into a redirect or a not-found. One resolution path
serves both: a helper only one surface can call is a helper the other
reimplements, and a second cookie parser on this path is a second place for it
to be wrong.

Every repository read takes an `Actor`:

    listPosts(actor)                 // filters on audience by actor.role
    readDeck(actor, deckId)          // joins deck_grants; an ungranted deck is not found
    readDeckVersion(actor, deckId)   // only the published current version, unless admin

**There is no read function without an actor.** That is the whole of `DATA-R05`
in this codebase: the rule is a signature rather than a habit. The `Actor`
parameter is what carries it, and it becomes mechanical -- a read that omits it
does not compile -- with the first reads and the gate that holds them to it
(`AUTH-002/T4`); until those exist the type is the discipline and the enforcement
is owed.

### What "not found" means

An investor asking for a deck they were not granted gets the same `404` as one
asking for a deck that does not exist, and an investor who guesses an admin path
gets the answer a path that is not there gives. A `403` would confirm the deck
exists, and so would a redirect, which is not what an unknown path answers —
the same oracle `SEC-R03` closes on the sign-in form.

For that to hold the not-found a caller returns must be **the framework's own**,
which an unmounted path also returns: a page maps the gate's `404` onto
`notFound()` and the two are then a byte apart from nothing. The bare `Response`
the gate hands back carries an empty body, which an unmounted route does not, so
a route handler that returns it as it stands is distinguishable from an
un-mounted one and re-opens the oracle — an admin surface is a page for this
reason, and a caller reads the answer's kind rather than rendering on it, so a
`Response` is never mistaken for an actor.

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
  and a register entry, not a silent substitution. The build found the session
  model a poor fit and chose the hand-rolled store; the reasoning is
  `AUTH-DEC-01`.

## 7. Task list

- `AUTH-002/T1` — Session cookie: httpOnly, SameSite=Lax, Secure, rotated on sign-in
- `AUTH-002/T2` — Server-side invalidation, so a stolen cookie dies on sign-out
- `AUTH-002/T3` — Role gate at the query, not the template; a helper that cannot be forgotten
- `AUTH-002/T4` — Isolation test: an investor request for another investor's deck returns nothing, not a redirect
