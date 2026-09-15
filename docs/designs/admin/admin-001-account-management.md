---
code: ADMIN-001
title: Account management
domain: admin
prd_refs: [ADMIN-001, DATA-R01, DATA-R03, SEC-R04]
depends_on: [ADMIN-002, AUTH-003, AUTH-004, SEC-002]
depended_by: [DATA-002, DECK-004, INV-001, MAIL-001]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [DATA-R01, DATA-R02, DATA-R03, SEC-R02, SEC-R04, A11Y-R01, A11Y-R02]
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
| Identity | Name, address, role, state, created, last sign-in, investor type |
| Access | Every deck granted, with pin and last opened (`DECK-004`) |
| Sessions | Live sessions, and a control to end them all (`AUTH-004`) |
| Actions | Resend invitation, reset password, suspend, reinstate, correct the name or the address, say whether they have invested, delete |

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

Deleting the last admin who can sign in is refused, and so is an admin deleting
their own account from the console. Both are the kind of thing that is obvious
until somebody is cleaning up at the end of a long day, and they are not the same
rule. The first is about the hall: it has no admin left to reinstate anybody, so
it is recoverable only from the database, and it binds every path that erases
anything. The second is about privilege passing a second pair of eyes
(`ADMIN-DEC-01`), which is why it belongs to this door and not to the one the
account holder uses below.

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

### Whether they have invested

The hall serves two people whose reasons for being there are opposite, and
`accounts.investor_type` is where it learns which this one is
([`INV-DEC-02`](../../decisions-log.md#INV-DEC-02)). An admin says so from this
page, because the company is the only party that knows and there is nowhere else
to record it.

    POST /admin/accounts/<id>/investor-type   { investorType }

Its own route, for the reason correcting and deleting each have one: this carries
a value beyond its own name. The value is `current`, `prospect`, or `null`, and
`null` is sent as a value rather than by leaving the field out — a body that omits
it is a `400`, because "set this to nobody has said" and "I am asking for nothing"
are opposite requests and a caller that meant one must never silently get the
other.

**Null is a state and not a gap.** It is what the record says about a person the
company has not described, it is what an account created before the column
existed keeps, and it is distinct from `prospect` — the guess that costs most is
showing the persuasion order to somebody who has already paid. So the column
carries no default, the control offers the unsaid state first, and an admin who
classified the wrong account can put it back.

**It orders the hall's landing and gates nothing.** What this person may read is
their grants and each document's audience through `CMS-006`, which this act does
not touch and this column cannot reach: the predicate those compose is handed an
`Actor`, which is an id and a role, so a rule that read the type would have to
widen the auth boundary first. A person set to the wrong type sees an oddly
ordered page and never a document that is not theirs. Both the surface and the
sentence under the control say so, because a control an admin mistakes for an
access control is the one way this page can mislead.

**The trail holds the act and neither value.** `account.investor_type_change`
names no recordable field, so the row is the actor, the subject and the act.
Which field moved is already the action's name, and the value on either side
would keep a judgement about a named person in a table retained seven years past
their erasure to record the act of forming it once — the reasoning that keeps a
correction's two values out of it (`SEC-DEC-01`, `DATA-R02`). Setting the value
the row already holds writes nothing and records nothing: restating a judgement
is not a second act of forming one.

**No session ends**, for the correction's reason and more plainly: nothing about
what this person may read has moved, so no live session's claims are stale
(`SEC-R02`).

It is personal data about a named person, so it is named in the privacy notice's
table of what is held (`LEGAL-SG-001` §3), carried in the record of processing on
the same legitimate-interests basis as the two behavioural rows beside it, and
returned by the data-portability export — a request for what is held that omitted
it would be answered incompletely (`LEGAL-GLOBAL-001/T2`).

### The reader's own door

Correcting a record and erasing it are rights the data-protection regimes give
the person, and two of the acts above are also reached by the person they are
about, from `/hall/account`
([`ADMIN-DEC-06`](../../decisions-log.md#ADMIN-DEC-06)). A third act lives only
there: changing the password, which is nobody's business but the account
holder's and which the console deliberately cannot do — an admin who could set a
password could sign in as that person.

    POST /api/account/identity   { name, email }
    POST /api/account/password   { currentPassword, newPassword }
    POST /api/account/delete     { confirmName }

**The acts are the ones above and not copies of them.** `correctIdentity` and the
erasure serve both doors, because the refusals are the whole content of those
acts and a second function writing the same column would be a second answer to
each of them. What differs is the door, and it differs in four ways.

**The session is the identity check.** The runbook has an admin establish who
they are speaking to before touching a record, and an address is not proof of
that on its own; a signed-in reader has already presented a session this system
issued. Both paths stand, because somebody whose address is wrong cannot sign in
to fix it, and that is the request the console path is for.

**The stranding refusal travels and the self refusal does not.** The last admin
who can sign in is refused here as there, because the hall it would strand is the
same hall. An admin may not erase their own account *from the console* — that
rule exists so a privileged act passes a second pair of eyes, and a person
erasing their own record is not reaching past what they may do. Carrying it here
would refuse exactly the case this door exists to serve.

**A taken address is refused without being named as taken.** The console answers
`409 email_taken`, which tells an admin nothing they could not read off the
account list. An investor has no such list, so the same answer here would make
the form a test for whether a named person holds an account in this hall, and
that a named person is reading a fundraise is precisely what this system holds in
confidence. The reader is told the address cannot be used and who to ask, and the
attempt is counted against a limit so addresses cannot be tried in bulk.

**Changing the password demands the current one, and ends every other session.**
A session that can set the password it was opened with outlives every remedy,
which is what makes the demand a step-up rather than a formality. A password
change is a privilege change (`AUTH-002`), so the change and the deletion of
every session are one transaction, and the response carries a fresh session —
the reader stays signed in where they are standing, and every other device is
turned out. The trail records the invalidation as `session.invalidate_all`,
which is the act the sign-out-everywhere control writes for the same effect on
the same table; the vocabulary carries no act for a password change and minting
one is a migration (`DATA-R07`).

**What is not here is the download.** `LEGAL-GLOBAL-001` §3 refuses a
self-service export because a link to a person's whole record is a credential
sitting in an inbox, and `ADMIN-DEC-06` left that refusal standing. A
data-portability request is answered by an admin.

## 4. Integration

**`ADMIN-002`** is the console and the destructive-action component, whose
typed-name predicate the reader's own erasure gates on too, so the two
confirmations cannot drift into disagreeing about what counts as the name.
**`AUTH-001`** owns the hashing and the policy the reader's new password passes.
**`AUTH-003`** creates the invitation, and a corrected address destroys the
outstanding one whichever door corrected it. **`AUTH-004`** ends the sessions, and
its account page is where the reader's own three controls sit. **`INV-001`** is
the hall that page belongs to. **`DECK-004`** supplies the per-account access
list. **`SEC-002`** records every action. **`DATA-002`** is the erasure design
this implements both halves of.

## 5. Cross-cutting compliance

- **`DATA-R01`** — a name, an address, a role, a state, when they last signed
  in — the one behavioural column, and §6 says why — and whether the company has
  said this person invested or is deciding, which the notice declares. Nothing
  else.
- **`DATA-R02`** — no personal data in the audit or in a log.
- **`DATA-R03`** — deletion is a delete, the confirmation says what survives, and
  the person whose record it is can ask for it themselves.
- **`SEC-R04`** — create, suspend, role change, correct, set the investor type,
  delete, and every grant change. A reader acting on their own account is not a
  privileged write and is audited only where the act is one the trail already
  names: their correction and their erasure are recorded with them as both actor
  and subject, and their password change is recorded as the bulk session
  invalidation it performs.
- **`SEC-R02`** — a password change is a privilege change, so every session the
  account holds is deleted in the transaction that writes the hash and a fresh
  one is issued on the response.
- **`A11Y-R01`**, **`A11Y-R02`** — the lists and the confirmations are
  operable and named.

## 6. Open questions and trade-offs

- **No bulk actions.** Not on suspend, not on delete. Six to fifty accounts, and
  every action here is either reversible-per-person or irreversible; a bulk
  irreversible action is one mis-selection from an emptied hall.
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
  for: two admins, both named in the trail, is the containment this hall has, and
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
- `ADMIN-001/T11` — Whether a person has invested or is deciding, carried on the account and set from their page
- `ADMIN-001/T12` — The reader's own name, address, password and erasure, from the hall
- `ADMIN-001/T13` — The control that moves a person between roles, which is how a prospect becomes an investor
