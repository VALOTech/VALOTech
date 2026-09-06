---
code: AUTH-001
title: Sign-in
domain: auth
prd_refs: [AUTH-001, SEC-R01, SEC-R03, SEC-R05]
depends_on: [DATA-001]
depended_by: [AUTH-002, AUTH-003]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [SEC-R03, SEC-R05, DATA-R02, I18N-R01, A11Y-R01, A11Y-R02]
status: design-ready
---

# `AUTH-001` — Sign-in

## 1. Purpose and PRD refs

The one door into the investor room. An address and a password against an
account an admin created; no self-registration, because every account here
exists because someone decided it should. Realizes `AUTH-001` and is what
`AUTH-002` issues a session from.

The static site's `investor1` / `123456789` is a demonstration of the design and
is replaced entirely. Nothing about it survives except the dialog's shape, which
readers have already seen.

## 2. Layer walkthrough

**Down.** A reader opens the dialog from the header, types an address and a
password, and submits. The route handler reads the account, verifies the hash,
and either hands off to `AUTH-002` to issue a session or returns the single
failure. Both paths write an attempt to the rate-limit store first, so a refusal
costs the attacker the same as a success.

**Up.** The response is either a redirect to the room or the same page with one
message. The message is identical for an unknown address and a wrong password,
and identical again for a suspended account — three states, one sentence, because
any distinction is a membership oracle (`SEC-R03`).

## 3. Contracts

### Routes

| Method | Path | Body | Responses |
|---|---|---|---|
| `POST` | `/api/auth/sign-in` | `{ email, password }` | `204` with the session cookie set · `401` with `{ error: "invalid" }` · `429` with `Retry-After` |
| `GET` | `/sign-in` | — | the form, server-rendered, in the reader's locale |

`401` carries no detail and no timing signal: the handler verifies a hash even
when the account does not exist, against a fixed dummy hash, so the two paths
cost the same milliseconds.

### Password hashing

Argon2id, memory 19 MiB, iterations 2, parallelism 1 — the OWASP Password Storage
Cheat Sheet's first recommended configuration. The parameters are stored beside
the hash so a future increase can rehash on next sign-in rather than locking
everyone out.

### Rate limit

Per account and per address, `AUTH_MAX_ATTEMPTS` in `AUTH_WINDOW_SECONDS`
(defaults 5 in 900). Both counters, because limiting only the address lets one
attacker spread across a botnet and limiting only the account lets one attacker
walk the whole list. A limited request returns `429` before it touches the
database.

### Environment

`AUTH_MAX_ATTEMPTS`, `AUTH_WINDOW_SECONDS`. Both optional, both in
`env.example`.

## 4. Integration

**`DATA-001`** provides `accounts` and its `state` column; a `suspended` account
fails exactly as a wrong password does. **`AUTH-002`** takes over the moment the
password verifies, and is the only thing that may issue a session. **`AUTH-003`**
writes `password_hash` for the first time when an invitation is accepted, using
the same hashing function — one implementation, so a parameter change cannot
apply to one path and not the other.

## 5. Cross-cutting compliance

- **`SEC-R03`** — one message for every failure, one cost for every path, two
  counters.
- **`SEC-R05`** — no credential in the repository; the hash parameters are
  configuration, not secrets.
- **`DATA-R02`** — a failed sign-in logs the outcome and the account id, never
  the address and never the password. An address in a log is personal data in a
  log.
- **`I18N-R01`** — every string on the form has a key; twenty locales.
- **`A11Y-R01`, `A11Y-R02`** — the dialog traps focus, returns it to the trigger
  on close, and every field has a label rather than a placeholder standing in for
  one.

## 6. Open questions and trade-offs

- **A second factor.** Not in scope, and the reason is honest rather than
  principled: there are a handful of accounts and no money moves here. It becomes
  worth its friction when the room holds something an attacker wants more than a
  fundraise deck. Filed here rather than in the register because nothing is
  waiting on it.
- **Magic links instead of passwords.** They would remove the hash, the reset
  flow and this whole rate-limit design, and would put the security of the room
  on the investor's mailbox — which for an institutional address is often shared.
  Rejected for that reason, not for effort.

## 7. Task list

- `AUTH-001/T1` — Password hashing at the current cost, verified against a known vector
- `AUTH-001/T2` — Sign-in route: identical failure for an unknown account and a wrong password
- `AUTH-001/T3` — Rate limit per account and per address, with the limit stated in config
- `AUTH-001/T4` — The sign-in form, in twenty languages, keyboard-reachable, with an accessible name on every field
- `AUTH-001/T5` — Regression test: a wrong password and an unknown account are indistinguishable in status, body and timing
