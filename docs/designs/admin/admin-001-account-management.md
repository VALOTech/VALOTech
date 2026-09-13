---
code: ADMIN-001
title: Account management
domain: admin
prd_refs: [ADMIN-001, DATA-R01, DATA-R03, SEC-R04]
depends_on: [ADMIN-002, AUTH-003, AUTH-004, SEC-002]
depended_by: [DATA-002, DECK-004, MAIL-001]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [DATA-R01, DATA-R02, DATA-R03, SEC-R04, A11Y-R01, A11Y-R02]
status: implemented
---

# `ADMIN-001` — Account management

## 1. Purpose and PRD refs

Creating, suspending and deleting the people who can sign in, and seeing what
each of them can reach. Realizes `ADMIN-001`.

Every account here is a **named outside person the company is raising money
from**. That shapes two things this design is careful about: the record holds as
little as possible about them (`DATA-R01`), and deleting it actually deletes it
(`DATA-R03`).

## 2. Layer walkthrough

**Down.** Writes to `accounts`, cascading to sessions, invitations and grants.
Every write audited in its own transaction (`SEC-002`).

**Up.** A list of people, and a page per person that answers one question
completely: what can this person reach, and what would happen if I removed them.

## 3. Contracts

### The list

Name, address, role, state, when they last signed in, served stalest-first by
last sign-in — which [`ADMIN-DEC-02`](../../decisions-log.md#ADMIN-DEC-02) ratified
as the fixed order rather than an interactive control. That column is what makes a
stale account visible — an investor who has not signed in for a year is either a
person who lost interest or an account nobody remembered to close.

### The person

| Section | What it answers |
|---|---|
| Identity | Name, address, role, state, created, last sign-in |
| Access | Every deck granted, with pin and last opened (`DECK-004`) |
| Sessions | Live sessions, and a control to end them all (`AUTH-004`) |
| Actions | Resend invitation, reset password, suspend, reinstate, correct the name or the address, delete |

### The action route

    POST /admin/accounts/<id>/action   { action }

One route for the acts the page performs — `resend-invitation`, `reset-password`,
`suspend`, `reinstate`, `end-sessions` — because each is a name and a call to the
service that owns it, and five routes would be five copies of the gate, the
origin check and the body parse, the fifth written in a hurry. Delete is not
among them: it is `ADMIN-001/T4`, its own surface with a typed confirmation.

The answer is one of three. `changed` — a write happened. `unchanged` — none did,
which covers both an act asking for a state the account already holds and an act a
guard refused (`ADMIN-DEC-01`), because the services answer both with the same
value and a route inventing a reason would be guessing which. `requested` — the
password reset alone, whose flow reports nothing back by design (`SEC-R03`), so
the honest answer is that the request was made and not that a token was written.

The handler asks the gate itself (`requireAdmin`) rather than resting on the
segment layout — a route handler inherits no layout — refuses a cross-site
`Origin` before anything else (the cookie is `SameSite=Lax`, so this is a second
lock), and resolves the subject before dispatching, so an id no account holds is a
`404` and not an `unchanged` that would read like a refusal.

### The four states

| State | Can sign in | Set by |
|---|---|---|
| `invited` | no | Creation |
| `active` | yes | Accepting an invitation, or an admin reinstating a suspended account |
| `suspended` | no | An admin |
| — | — | Deletion removes the row |

**Suspending ends every live session in the same transaction** (`AUTH-004`).
Revocation that waits for the next natural expiry is not revocation, and a
suspended person who stays signed in for the rest of the day is the defect this
prevents.

Suspension is reversible and is the right answer to almost everything. Deletion
is not, and the surface says which is which.

### Deleting

A real delete of the `accounts` row (`DATA-R03`). The cascades remove sessions,
invitations, grants, read states and deck-read records. What survives is the
audit trail, which holds ids and actions and no personal field, because no action's allow-list may name one (`SEC-002/T4`) — and
content the person authored, whose `author_id` becomes null, because a published
report is the company's document and cascading it would delete an investor's
archive to satisfy a staff erasure.

Before it happens the confirmation **lists what will be removed and what will
remain**, by count and by kind, and requires the person's name to be typed
(`ADMIN-002`). An admin deleting an account should not be surprised afterwards
by either half.

The surface is a dedicated route, `POST /admin/accounts/<id>/delete { confirmName }`,
separate from the action route because deletion alone carries a value beyond its
own name. It re-checks that name server-side with the same predicate the panel
gates on — a posted body is whatever the caller sent — and only then calls
`eraseAccount`, which owns the refusals; a name that does not match is a `400`
and nothing is erased.

Deleting the last admin is refused. Deleting yourself is refused. Both are the
kind of thing that is obvious until somebody is cleaning up at the end of a long
day.

### Creating

Creates an `invited` account and an invitation (`AUTH-003`), which is the only
way an account comes to exist — there is no self-registration and no password
set by an admin on somebody else's behalf. An admin who could set a password
could sign in as that person, and the audit trail would say the person did it.

Role is chosen at creation and can be changed. **Changing a role ends every
session** (`SEC-R02` a fortiori — deletion is stronger than a re-issue) and is
audited as `account.role_change`, because a privilege change that leaves the old
session's claims in place is a privilege change that has not happened yet.

### What is not stored

No notes field. No "how we know them", no "which fund", no phone number. Each of
those is a thing somebody would write about a person into a system with no
retention policy for prose (`DATA-R01`). The relationship lives wherever the
company keeps relationships; this system knows who may read what.

### Correcting

The console's answer to the PDPA correction right (`LEGAL-SG-001` §3): a person
says their name is spelled wrong or their address is not theirs, and an admin
fixes the record from their page. Without it the two paths are erasing the
account and inviting it again, which costs the person their read state, and the
owner editing the row in the database, which is outside the product and
therefore outside the audit.

    POST /admin/accounts/<id>/correct   { name?, email? }

Its own route rather than another act on the action route, for the reason
deleting has one: the acts on that route are each a name and a call to the
service that owns them, and a correction carries two values beyond its own name.
A field left out is left alone, so correcting one of the two says nothing about
the other.

**The trail records which fields moved and never what they held.** No action's
allow-list may name `name` or `email` (`SEC-DEC-01`), and this is the one act
whose entire subject is those two fields — and the one where both the old and the
new value belong to the person. So `account.correct` records the moved column
names and nothing else, `before` is empty because there is no prior value the row
may carry, and neither value ever leaves the database: the statements compute the
new value from the old inside SQL.

**Correcting the address destroys an outstanding invitation, in the same
transaction.** A live token sets this account's password, and it was minted for
the address that has just been found wrong, so leaving it valid leaves a working
way in sitting in a mailbox the account holder does not read (`AUTH-003`). It is
the suspension's delete and the same meaning of outstanding — unconsumed, because
a consumed row records that somebody used a token at a stated moment, which stays
true. The answer says whether one went, because the admin has to know to resend
it to the corrected address.

**No session is ended**, unlike a role change's. A session is keyed to the
account, the person behind it is the same person, and what they may read has not
moved, so there is no privilege change for a live session's claims to be stale
about (`SEC-R02`). Where the account is in the wrong hands rather than merely
mis-spelled, the acts wanted are suspension or ending the sessions, both on the
same page; a correction cannot tell those apart and does not pretend to.

**An address another account holds is refused by name**, as a `409` carrying the
same `email_taken` the invite surface answers with, and nothing is written — not
the name either, because the refusal is of the correction and not of half of it.
The refusal is read from a lookup rather than from a driver's error code, and the
lookup can decide because it is taken under the advisory lock every writer of
that address holds: an invitation and a correction racing for one address
serialise rather than meeting at the unique index.

**Asking for what the row already holds writes nothing, records nothing, and is
not an error.** The comparison is the database's — `citext` for the address, so a
correction that only changes its case moves nothing and leaves the invitation
alone. Both values are trimmed and the address is lower-cased before anything is
compared, which is the one spelling every surface that takes an address uses.

A blank name and an address the sign-in door would turn away are refused as a
`400` naming which of the two fields it was, because a form with two inputs that
says only "refused" is a form the admin has to guess at.

## 4. Integration

**`ADMIN-002`** is the console and the destructive-action component.
**`AUTH-003`** creates the invitation. **`AUTH-004`** ends the sessions.
**`DECK-004`** supplies the per-account access list. **`SEC-002`** records every
action. **`DATA-002`** is the erasure design this implements the admin half of.

## 5. Cross-cutting compliance

- **`DATA-R01`** — a name, an address, a role, a state, and when they last
  signed in — the one behavioural column, and §6 says why. Nothing else.
- **`DATA-R02`** — no personal data in the audit or in a log.
- **`DATA-R03`** — deletion is a delete, and the confirmation says what
  survives.
- **`SEC-R04`** — create, suspend, role change, correct, delete, and every grant
  change.
- **`A11Y-R01`**, **`A11Y-R02`** — the lists and the confirmations are
  operable and named.

## 6. Open questions and trade-offs

- **No bulk actions.** Not on suspend, not on delete. Six to fifty accounts, and
  every action here is either reversible-per-person or irreversible; a bulk
  irreversible action is one mis-selection from an emptied room.
- **Last sign-in is stored, and it is behavioural data.** It is kept because
  the stale-account problem has no other signal, it is one timestamp, and it is
  deleted with the account. Stated in the privacy posture rather than left to be
  discovered.
- **No transfer of authored content.** Deleting an admin nulls their
  `author_id` and the document keeps its text. A "transferred to" field would be
  more informative and would be a place to record a person after they were
  erased.
- **Resend and reset are both audited.** A resend hands an admin a fresh link
  that sets a password, which is a capability over somebody else's account and
  belongs in the trail — without a row, a link opened later shows only the
  original `account.create`. A reset is lower weight, because it hands back
  nothing and so misattributes no capability, and it is audited beside the
  resend all the same: the difference costs one more value in a closed
  vocabulary, and an admin who started a reset is an act a reader looks for.
  So two `audit.action` values are folded into the CHECK (the
  `account.reinstate` precedent, `ADMIN-DEC-03`), each written inside the
  transaction of the act it records. The reset keeps its control and the
  sentence it carries, which names exactly what did and did not happen — more
  honest than an absent control that leaves the admin guessing whether the
  console can reset at all. Built by `ADMIN-001/T9`.

- **Correcting an address will be a takeover path once mail is sent.** Today it
  is not: the reset control hands the admin nothing, so moving an account's
  address somewhere the admin reads gains them no way in. When `AUTH-003/T3`
  mails the reset link, an admin who corrects another admin's address to their
  own mailbox and then presses reset has taken that account — two acts, each
  audited against them by name, and no refusal in between. Refusing a correction
  of another admin's address is not the answer on its own, because an admin can
  already resend an invitation to an `invited` account and read the link from the
  screen; what changes at `AUTH-003/T3` is the reach, not the shape. The
  trade-off is stated here rather than pre-empted with a control nobody has asked
  for: two admins, both named in the trail, is the containment this room has, and
  whether a correction that moves an address should take step-up
  authentication is [`ADMIN-DEC-05`](../../decisions-log.md#ADMIN-DEC-05), filed now so
  the question arrives with the send that makes it reachable rather than after it.

## 7. Task list

- `ADMIN-001/T1` — The list, sortable by last sign-in, with role and state
- `ADMIN-001/T2` — The person page: identity, access, sessions, actions
- `ADMIN-001/T3` — Suspending ends every live session in the same transaction
- `ADMIN-001/T4` — Deletion is a real delete; the confirmation lists what goes and what remains, and takes the typed name
- `ADMIN-001/T5` — Deleting the last admin, or yourself, is refused
- `ADMIN-001/T6` — Creation issues an invitation; no admin ever sets another person's password
- `ADMIN-001/T7` — A role change ends every session and is audited
- `ADMIN-001/T8` — Reinstating a suspended account restores it to active and is audited
- `ADMIN-001/T9` — Audit resend-invitation and reset-password: two new audit.action values, and a recordAudit inside each act's transaction
- `ADMIN-001/T10` — Correcting a person's name and address from their page, audited like every other act
