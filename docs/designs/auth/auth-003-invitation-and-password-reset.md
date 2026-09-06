---
code: AUTH-003
title: Invitation and password reset
domain: auth
prd_refs: [AUTH-003, SEC-R03, SEC-R05, DATA-R01, DATA-R04]
depends_on: [AUTH-001, CRED-001]
depended_by: [ADMIN-001]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [SEC-R03, SEC-R05, DATA-R01, DATA-R02, I18N-R01, A11Y-R01, A11Y-R02]
status: design-ready
---

# `AUTH-003` — Invitation and password reset

## 1. Purpose and PRD refs

How an account comes to have a password. There is no self-registration: an admin
invites a named person, and that person sets their own password from a link that
works once. The same machinery resets a forgotten one. Realizes `AUTH-003`.

Two flows, one mechanism, deliberately. They differ only in who starts them and
what the account's state was, and building them twice would give two token
lifetimes, two consumption rules and two chances to get single-use wrong.

## 2. Layer walkthrough

**Down.** An `invitations` row holds a hash of a token, an expiry, and a
`consumed_at` that is null until it is used. The token itself is generated,
shown once in the mail, and never stored — so a database read gives an attacker
nothing to present.

**Up.** The invitee opens a link, sees who invited them and to what, chooses a
password against a stated policy, and lands signed in. A link that has expired or
been used says so plainly and offers the one next step: ask for another.

## 3. Contracts

### Routes

| Route | Method | Who | What |
|---|---|---|---|
| `/admin/accounts/invite` | POST | admin | Creates an `invited` account and an invitation, sends the mail |
| `/invite/<token>` | GET | anyone | Shows the set-password form, or the expired page |
| `/invite/<token>` | POST | anyone | Consumes the token, sets the password, signs the person in |
| `/forgot` | GET, POST | anyone | Requests a reset |
| `/reset/<token>` | GET, POST | anyone | Same form, same consumption path |

### The token

- 32 bytes from a cryptographic source, base64url — not a uuid, which is a
  identifier rather than a secret.
- Stored as a SHA-256 hash. The lookup hashes the presented value and compares;
  there is no way to read a usable token out of the database.
- **Invitation expiry: 7 days. Reset expiry: 1 hour.** They differ because the
  risks differ: an invitation is expected to sit in an inbox over a weekend, and
  a reset is requested by somebody who is at their keyboard right now.
- Single-use, and single-use under concurrency:

      UPDATE invitations SET consumed_at = now()
       WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING account_id

  The consumption **is** the check. A read-then-write would let two simultaneous
  posts both pass the read, and the second one would set a password the first
  person did not choose.

- Issuing a new invitation or reset for an account **invalidates every
  outstanding one** for that account, in the same transaction.

### What the response reveals

`/forgot` answers identically for an address that exists and one that does not:
the same page, the same wording, the same timing envelope (`SEC-R03`). The mail
is the only difference and it goes to an inbox the requester may not control.
This is the enumeration surface people forget, because the sign-in form gets the
attention and the reset form is where the address list gets confirmed.

### The password

At least 12 characters, checked against a list of the most common passwords, and
nothing else. No composition rules — they produce `Password1!` and a written note
— and no maximum below 200 characters. Hashed with Argon2id at parameters stated
in one constant, so raising them later is one edit and a rehash-on-next-sign-in.

### When mail cannot be sent

`CRED-001` says a missing mail credential disables its feature and leaves the
system up. Here that means: the account and the invitation are still created, and
**the admin is shown the link on screen** to deliver by whatever means they have.
The feature that degrades is delivery, not invitation — an admin who cannot add
an investor because a credential is missing is a system that stopped, which is
what `SEC-R05` forbids.

### Mail content

One template, in the invitee's locale if known and English otherwise, naming the
inviter, the company, what the link does and when it stops working. No tracking
pixel, no click wrapper (`DATA-R04`). It is transactional, so it carries no
unsubscribe — and `MAIL-002`'s unsubscribe must never suppress it, which is the
one place those two features can contradict each other.

## 4. Integration

**`AUTH-001`** owns the password hash and the sign-in that follows consumption.
**`CRED-001`** decides whether mail can be sent at all. **`ADMIN-001`** is the
surface an admin invites from and where the on-screen link appears.
**`MAIL-DEC-01`** decides the carrier; until it is answered the send path is
built against a port with no adapter behind it, and the on-screen link is the
whole delivery mechanism.

## 5. Cross-cutting compliance

- **`SEC-R03`** — reset and invitation answer identically whatever the address.
- **`SEC-R05`** — no credential in the tree; absence degrades delivery only.
- **`DATA-R01`** — an invitation stores an account id and a hash. Nothing else.
- **`DATA-R04`** — this mail is transactional and consented by the act of being
  invited; it is recorded like every other send.
- **`I18N-R01`**, **`A11Y-R01`**, **`A11Y-R02`** — the form is a form: labelled,
  keyboard-reachable, translated.

## 6. Open questions and trade-offs

- **The link signs the person in.** The alternative is to set the password and
  then ask them to sign in with it, which proves they retained it. Rejected
  because it adds a step at the exact moment the person has just proved control
  of the mailbox and chosen the credential — the strongest evidence the flow will
  ever have.
- **No second factor.** The room holds company reporting, not money, and every
  account is a named person the admin knows. A second factor is the right answer
  once the room holds anything an attacker can convert; file it then.

## 7. Task list

- `AUTH-003/T1` — Token generation, hashing, and storage that never holds a usable token
- `AUTH-003/T2` — Single-use consumption in one atomic statement, with expiry in the same predicate
- `AUTH-003/T3` — The mail that carries the link, in the invitee's locale
- `AUTH-003/T4` — The set-password form, its policy, and the sign-in that follows
- `AUTH-003/T5` — Reset answers identically for an address that exists and one that does not
- `AUTH-003/T6` — A new invitation invalidates every outstanding one for that account
- `AUTH-003/T7` — With no mail credential, the invitation is still created and its link is shown to the admin
