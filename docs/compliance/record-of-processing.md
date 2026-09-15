# Record of processing

> **Not for `main`.** This document lives on `development` only (`.claude/CLAUDE.md` §1.1).

One page, because there is one processing activity: giving a named person access
to company reporting. Everything below describes what this system actually does,
and is written from the designs rather than from a statute, because the text of
the law is not yet in this tree (`docs/operator-checklist.md#COMPLIANCE-SOURCES`)
and a claim about the law that cites nothing is the expensive kind of wrong.

## Who holds it

VALO TECH PTE. LTD., Singapore, is the controller. There is no processor other
than the hosting and mail carriers named below, and no joint controller.

**No individual is yet named as the contact.** `LEGAL-SG-001/T4` carries the
control and `docs/operator-checklist.md#DPO-CONTACT` carries the act; until the
owner names a person, the notice publishes no name and this record claims none.

## What is held, why, and on what basis

| Data | Purpose | Basis |
|---|---|---|
| Name, e-mail address | To give a named person access to company reporting | Consent, given by accepting an invitation the person asked for or agreed to receive |
| Role, state | To decide what they may read | Same |
| Last sign-in, session records | To let the person and an admin see and end sessions, and to let an admin find an account nobody is using any more | Legitimate interests — security of the account, and closing accounts that are unused |
| What they opened, and when | To show them what is unread; for a deck, to record which version they were shown | Legitimate interests, stated in the notice |
| Whether they have invested or are deciding | To order the hall's landing so what they came for is first | Legitimate interests, stated in the notice |

The people are prospects, investors and admins — the three roles this product
has (`.claude/CLAUDE.md` §7.3). A prospect is somebody who asked for access from
the gateway and confirmed their own address (`AUTH-005`); the same rows are held
about them as about an investor, gathered on the same basis, and the role decides
what they may read rather than what is kept. No other category of person has an
account, and none is profiled. The last three rows are disclosed in the notice rather than assumed.
Two are behavioural, and what a person opened is theirs alone: not aggregated,
not reported to an admin as analytics, and not kept after the account goes
(`LEGAL-SG-001` §3). The third is an opinion an admin records rather than a
behaviour observed (`INV-DEC-02`); it is empty until somebody states it, it
decides the order of the hall's landing and never what the person may read, and
it leaves with the account like everything else on the row.

A person may object to the read-tracking. Honouring the objection keeps the
account working, stops the records being written, and deletes the ones already
there (`LEGAL-GLOBAL-001/T3`).

## Who it reaches

The hosting provider, and the mail carrier. `INFRA-DEC-03` put the application on
AWS and `INFRA-DEC-05` chose its shape; `MAIL-DEC-01` carries investor mail by
SMTP against the company's own mailbox, so a message's recipient address reaches
that carrier and nothing else does. Nothing is sold, nothing is shared for
advertising, and no analytics service receives anything.

## Where it rests

**Undecided, and nothing has moved.** `OPS-DEC-03` is open: no region is chosen,
so whether the data leaves Singapore is not yet answered and no transfer
mechanism is named. Nothing is deployed — the data sits on a development machine
— so this record states the question rather than an arrangement, and the notice
makes no claim about where anything rests. The assessment is `LEGAL-SG-001/T7`
and it is written once the region is known.

## How long it is kept

Everything tied to a person is deleted when the account is, driven by the
manifest rather than by a list somebody maintains (`DATA-002/T1`, `DATA-002/T2`).
Two things outlive the account because they are not about reading it:

| What | How long | Why |
|---|---|---|
| `audit` | 7 years | The longest applicable Singapore record-keeping obligation; it holds ids and acts, never the values a correction moved |
| `mail_log` | 2 years | Long enough to answer a question about a past campaign |

The sweep that enforces both exists and is run with `make retention`
(`DATA-002/T4`). **What does not exist yet is the schedule that runs it**, which
arrives with the deployment (`OPS-001`), so until then a window is enforced when
somebody runs it rather than continuously.

## How it is protected

Sessions are httpOnly, `SameSite=Lax`, rotated on sign-in and on any change of
privilege, and ended server-side on sign-out (`SEC-R02`). Passwords are stored
only as an Argon2id hash (`apps/web/src/auth/password.ts`). The audit is append-only two independent ways — a
database trigger, and an application role holding no `UPDATE` or `DELETE` on it
(`SEC-002`) — of which the trigger ships in the migration and the revoke is made
where the database is deployed (`docs/operator-checklist.md#AUDIT-GRANT`).
Personal data never appears in a log (`DATA-R02`).

## What is not claimed

No EU representative is appointed, no data-protection officer is registered with
a supervisory authority, and no transfer impact assessment is written. Those
become necessary at thresholds this product is nowhere near, and claiming them
would be worse than naming their absence. **The position is stated so it can be
revisited**, and the signal is the first EU-resident investor being given an
account.
