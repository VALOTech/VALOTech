---
code: ADMIN-001
title: Account management
domain: admin
prd_refs: [ADMIN-001, DATA-R01, DATA-R03, SEC-R04]
depends_on: [ADMIN-002, AUTH-003, AUTH-004, SEC-002]
depended_by: [DATA-002, DECK-004, MAIL-001]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [DATA-R01, DATA-R02, DATA-R03, SEC-R04, A11Y-R01, A11Y-R02]
status: design-ready
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

Name, address, role, state, when they last signed in. Sortable by last sign-in,
because that column is what makes a stale account visible — an investor who has
not signed in for a year is either a person who lost interest or an account
nobody remembered to close.

### The person

| Section | What it answers |
|---|---|
| Identity | Name, address, role, state, created, last sign-in |
| Access | Every deck granted, with pin and last opened (`DECK-004`) |
| Sessions | Live sessions, and a control to end them all (`AUTH-004`) |
| Actions | Resend invitation, reset password, suspend, delete |

### The four states

| State | Can sign in | Set by |
|---|---|---|
| `invited` | no | Creation |
| `active` | yes | Accepting an invitation |
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
audit trail, which holds ids and actions and no personal data (`SEC-002`) — and
content the person authored, whose `author_id` becomes null, because a published
report is the company's document and cascading it would delete an investor's
archive to satisfy a staff erasure.

Before it happens the confirmation **lists what will be removed and what will
remain**, by count and by kind, and requires the person's name to be typed
(`ADMIN-002`). An admin deleting an account should not be surprised afterwards
by either half.

Deleting the last admin is refused. Deleting yourself is refused. Both are the
kind of thing that is obvious until somebody is cleaning up at the end of a long
day.

### Creating

Creates an `invited` account and an invitation (`AUTH-003`), which is the only
way an account comes to exist — there is no self-registration and no password
set by an admin on somebody else's behalf. An admin who could set a password
could sign in as that person, and the audit trail would say the person did it.

Role is chosen at creation and can be changed. **Changing a role rotates the
session** (`SEC-R02`) and is audited as `account.role_change`, because a
privilege change that leaves the old session's claims in place is a privilege
change that has not happened yet.

### What is not stored

No notes field. No "how we know them", no "which fund", no phone number. Each of
those is a thing somebody would write about a person into a system with no
retention policy for prose (`DATA-R01`). The relationship lives wherever the
company keeps relationships; this system knows who may read what.

## 4. Integration

**`ADMIN-002`** is the console and the destructive-action component.
**`AUTH-003`** creates the invitation. **`AUTH-004`** ends the sessions.
**`DECK-004`** supplies the per-account access list. **`SEC-002`** records every
action. **`DATA-002`** is the erasure design this implements the admin half of.

## 5. Cross-cutting compliance

- **`DATA-R01`** — a name, an address, a role, a state. Nothing else.
- **`DATA-R02`** — no personal data in the audit or in a log.
- **`DATA-R03`** — deletion is a delete, and the confirmation says what
  survives.
- **`SEC-R04`** — create, suspend, role change, delete, and every grant change.
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

## 7. Task list

- `ADMIN-001/T1` — The list, sortable by last sign-in, with role and state
- `ADMIN-001/T2` — The person page: identity, access, sessions, actions
- `ADMIN-001/T3` — Suspending ends every live session in the same transaction
- `ADMIN-001/T4` — Deletion is a real delete; the confirmation lists what goes and what remains, and takes the typed name
- `ADMIN-001/T5` — Deleting the last admin, or yourself, is refused
- `ADMIN-001/T6` — Creation issues an invitation; no admin ever sets another person's password
- `ADMIN-001/T7` — A role change rotates the session and is audited
