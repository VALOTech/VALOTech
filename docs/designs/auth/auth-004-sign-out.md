---
code: AUTH-004
title: Sign-out
domain: auth
prd_refs: [AUTH-004, SEC-R02, SEC-R04]
depends_on: [AUTH-002]
depended_by: [ADMIN-001]
layers_touched: [domain, service, api, frontend, ui]
cross_cutting_rules: [SEC-R02, SEC-R04, I18N-R01, A11Y-R01, A11Y-R02]
status: design-ready
---

# `AUTH-004` — Sign-out

## 1. Purpose and PRD refs

Ending a session, on the server. Realizes `AUTH-004` and carries the second half
of `SEC-R02`.

It is a small feature and it is placed before the room rather than after it, for
one reason: **a session that cannot be ended server-side is a defect that grows
with every account created.** Clearing a cookie asks the browser to forget a
credential that still works, and the shared laptop, the borrowed phone and the
stolen backup are all cases where the browser is not the party you are asking.

## 2. Layer walkthrough

**Down.** A `DELETE` on the `sessions` row named by the cookie, then a `Set-Cookie`
that expires it. In that order — a cookie cleared before the row is deleted
leaves a live session with nobody holding the reference, and a crash between the
two steps then leaves it live forever.

**Up.** The control is reachable from every signed-in surface, in one action,
and its accessible name says what it does. Afterwards the person lands on the
public gateway, signed out, with nothing from the room in the back-forward cache.

## 3. Contracts

### Routes

| Route | Method | What |
|---|---|---|
| `/signout` | POST | Deletes this session, expires the cookie, redirects to `/` |
| `/account/sessions` | GET | Lists this account's live sessions: when each began, when last seen, and which is this one |
| `/account/sessions/all` | POST | Deletes every session for this account, including this one |

**POST, never GET.** A `GET /signout` is signed out by any page that can embed an
image, and it is signed out by a link checker.

### Ending everything

`sessions/all` exists because the case it serves is the one that matters: a
person who thinks their password is known ends every session and then changes it.
Offering only "sign out here" tells them the problem is solved when it is not.

An admin suspending or deleting an account invalidates that account's sessions in
the same transaction (`ADMIN-001`), and writes `session.invalidate_all`
(`SEC-R04`). Revocation that takes effect at the next natural expiry is not
revocation.

### Idempotence

Signing out twice, or with a cookie whose row is already gone, succeeds and
redirects. There is no error state for "already signed out" — the caller's intent
is satisfied, and an error here would only be a way for a stale tab to show
alarming text to somebody who did the right thing.

### After

- `Cache-Control: no-store` on every authenticated response, so the back button
  after a sign-out shows the sign-in page rather than a rendered room from the
  history cache. This is the part that is usually missed, and it is verified in
  a browser by pressing the back button, not by reading the header.
- The redirect target is the public gateway. Never a page the person can no
  longer see, which would greet a sign-out with an access refusal.

## 4. Integration

**`AUTH-002`** owns the cookie and the session row; this design is the only
thing that deletes one on the person's own behalf. **`ADMIN-001`** deletes them
on somebody else's behalf, through the same function. **`SEC-002`** records
`session.invalidate_all`, and deliberately does not record an ordinary sign-out:
an audit trail that logs every routine action is one nobody reads.

## 5. Cross-cutting compliance

- **`SEC-R02`** — invalidated server-side, not cleared client-side.
- **`SEC-R04`** — a bulk invalidation is a privileged write and is audited.
- **`A11Y-R01`**, **`A11Y-R02`** — reachable by keyboard from every signed-in
  surface, with an accessible name that says what it does.
- **`I18N-R01`** — the control and the session list are translated.

## 6. Open questions and trade-offs

- **No idle timeout.** A session expires at its `expires_at` and not for being
  unused. An idle timeout would sign an admin out mid-sentence while they wrote
  a report, and the material behind this gate is company reporting rather than
  money. The session list gives the person the same control explicitly.
- **The session list shows an address and a user agent, or it does not.** Both
  are personal data under `DATA-R01`, and both are what makes "is that me?"
  answerable. Shown coarsely — a city and a browser name, not an address and a
  full string — and held only for the session's own lifetime.

## 7. Task list

- `AUTH-004/T1` — POST sign-out deletes the session row, then expires the cookie
- `AUTH-004/T2` — The session list shows this account's live sessions and marks the current one
- `AUTH-004/T3` — Ending every session, including this one, in one action
- `AUTH-004/T4` — Every authenticated response is `no-store`, verified by pressing the back button
- `AUTH-004/T5` — Signing out twice succeeds; there is no already-signed-out error
