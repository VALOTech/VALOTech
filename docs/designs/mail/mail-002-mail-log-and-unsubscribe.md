---
code: MAIL-002
title: Mail log and unsubscribe
domain: mail
prd_refs: [MAIL-002, DATA-R04, DATA-R03, SEC-R04]
depends_on: [MAIL-001]
depended_by: []
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [DATA-R04, DATA-R02, DATA-R03, SEC-R04, A11Y-R01, I18N-R01]
status: in-progress
inert_until:
  reason: Both halves are built and both answer today for the parts that do not
    need a message to have left. An investor signed in to the hall sees their own
    investor-mail preference and can stop it; an admin sees the log, filtered by
    recipient and by day, and can stop investor mail to one person with the
    reason. **What is inert is everything the message carries.** No investor
    receives anything while the process holds no mailbox (MAIL-001's own
    inert_until says so from the sending side), so no unsubscribe link exists in
    any inbox, the one-click page nothing has been sent to is reachable and
    unreached, and the log is an empty table. The rows this feature is read for —
    what went to whom, and a person stopping it from the message in front of
    them — begin to exist with the first send.
  unblocks_when: credential — SMTP_URL and MAIL_FROM, at
    docs/operator-checklist.md#SMTP-MAILBOX
---

# `MAIL-002` — Mail log and unsubscribe

## 1. Purpose and PRD refs

What was sent, to whom, when — and a way to stop receiving it that works.
Realizes `MAIL-002` and carries `DATA-R04`.

Both halves are legal obligations before they are features. A record of what was
sent is what answers a data-subject request; a working unsubscribe is what
`DATA-R04`, Singapore's DNC provisions and every equivalent regime require. A
send system without them is a send system that should not be used.

The carrier is SMTP against the company's own mailbox
([`MAIL-DEC-01`](../../decisions-log.md#MAIL-DEC-01)), and that decides two
things here. The carrier keeps **no** suppression list, so this one is
authoritative and is the only one — the disagreement between two lists that
lets an unsubscribed person hear from us again cannot occur. And SMTP reports
nothing after hand-off, so the log records acceptance and never delivery.

## 2. Layer walkthrough

**Down.** `mail_log` rows, written before the attempt and updated after.
`unsubscribes` keyed by account, with a timestamp, the source that set it, and
— for a one-click link — the token that did it; a manual admin stop-sending
carries its reason instead.

**Up.** An admin sees the log filtered by recipient and by date. An investor sees
their own preference on their account page, and a one-click link in every
non-transactional message.

## 3. Contracts

### The log row

| Column | Notes |
|---|---|
| `id`, `at` | |
| `account_id` | The recipient, by id. **Not the address** — the address is on the account and is deleted with it (`DATA-R03`) |
| `subject` | What was sent |
| `kind` | `transactional` or `bulk` — this is what the unsubscribe filters on |
| `state` | `queued`, `accepted`, `failed` — and **not** `delivered`, because SMTP cannot tell us |
| `queue_id`, `error` | The id the server returned on `250`, or its reply text |

Written **before** the attempt, so a crash between write and send leaves a record
of an attempt rather than no record at all. A row still `queued` after a send has
ended is exactly that — an attempt whose outcome SMTP never reported — and is
read like an `accepted` one: its delivery is unknown, so it is never re-sent
automatically (a blind re-send is the double-send [`MAIL-DEC-02`](../../decisions-log.md#MAIL-DEC-02)
exists to prevent), and a bounce for it, if any, arrives in the `MAIL_FROM`
mailbox like every other. The body is not stored: the subject, the recipient and
the time answer every question the log is asked, and storing the body would put a
message about a person in a table with a long retention.

### Bounces, and why there are none here

**SMTP gives no bounce signal.** The server answers once, at hand-off, and a
message that bounces afterwards produces a delivery-status notification to the
`MAIL_FROM` mailbox — a human-readable e-mail in an inbox this system does not
read. So there is no automatic suspension of a dead address, and the log cannot
mark one.

What is built instead is honest rather than absent: the send view names the
`MAIL_FROM` mailbox as **the place bounces arrive** and says that nothing reads
it, and the admin screen for an account carries a manual `stop sending` control
with its reason. An admin who finds a bounce notice in that mailbox sets it, and
the suppression list then holds. That is a person doing what a webhook would, and
the design says so rather than implying the system noticed.

The signal that this has become too expensive is the first send where somebody
reports never receiving an invitation, which is also the signal named on
`MAIL-DEC-01`.

### Unsubscribe

    GET  /unsubscribe/<token>    the confirmation: what stops, what does not, one button
    POST /api/unsubscribe        what that button posts, and the only thing that writes
    POST /api/account/mail       the preference, from inside the hall

Every **bulk** message carries the link, and the token identifies the account
without authenticating it — an unsubscribe that requires signing in is an
unsubscribe most people cannot complete, and the regime does not care why it
failed. The token is single-purpose and does nothing but this.

**The link is opened by a `GET` and acted on by a `POST`**, because a link in a
message is fetched by things that are not the reader: mail scanners, corporate
link-protection rewriters, and clients that prefetch what they render. A `GET`
that wrote the row would unsubscribe those people without a press, and nothing
in the row would tell such a row from a real one. What the reader does is
unchanged — they open the link and press once
([`MAIL-DEC-05`](../../decisions-log.md#MAIL-DEC-05)). No `List-Unsubscribe`
header accompanies the link: the `Mailer` port carries a recipient, a subject
and two bodies and no headers at all, so the RFC 8058 one-click path would be
that port widened, which is `MAIL-001`'s contract rather than this one's.

**The token is derived, not stored.** It has to be computable at send time for
an account that has never unsubscribed and holds no row anywhere, so it is the
account's id beside an HMAC of that id under `SESSION_SECRET` — the construction
the session cookie's signature uses ([`AUTH-DEC-02`](../../decisions-log.md#AUTH-DEC-02)),
with a purpose label inside the hash so that a value minted for one signer does
not verify at the other. Rotating that secret invalidates every link already in
an inbox, which is the price of deriving rather than storing; the page reads a
dead link as one to sign in past rather than as a forgery, and the preference
inside the hall writes the same row.

**`source` says who decided, and the row proves or explains itself
accordingly.** `link` is the person's own act, by the link in a message or by
the preference on their account page — the token identifies them either way,
presented in the link when they are not signed in and derived from the account
when they are, and the row keeps its SHA-256 rather than the token itself, the
way every token in this system is kept. `admin` is a staff member acting for
somebody else, and carries the reason instead of a token. Whoever set it, the
person can start investor mail again from their own page: it is their inbox, and
a setting nobody can undo becomes wrong the first time an address starts working
again. Nothing in the console starts it again, because the trail has no act that
names it ([`MAIL-DEC-06`](../../decisions-log.md#MAIL-DEC-06)).

**Transactional mail is never suppressed.** An invitation, a password reset and a
mail-send failure notice reach an unsubscribed account, because they are
responses to something the person or an admin did. The `kind` column is what
enforces the split, and it is set at the send rather than inferred.

The unsubscribe page says what it stopped and what it did not, in those terms, so
somebody who unsubscribes and then receives a password reset is not surprised.

### Retention

Log rows are kept **two years** and then deleted. Long enough to answer a
question about a past campaign, short enough that the table is not a record of
who was contacted about a fundraise five years ago. Deleting an account removes
its rows immediately (`DATA-R03`) — the audit trail keeps the fact that a send
happened, with a count and no addresses.

## 4. Integration

**`MAIL-001`** writes the rows and reads the suppression list before it sends.
**`AUTH-003`**'s invitation is `transactional` and must never be suppressed.
**`ADMIN-001`** shows a person's mail history on their page and deletes it with
them. **`SEC-002`** records the send as a fact; this is the detail.

## 5. Cross-cutting compliance

- **`DATA-R04`** — recorded, consented, with a working unsubscribe.
- **`DATA-R02`** — the log holds an account id, never an address.
- **`DATA-R03`** — rows go with the account, and expire at two years anyway.
- **`SEC-R04`** — an unsubscribe is audited from every door, in the transaction
  that writes the row. Starting again is not, and cannot be: the trail's action
  vocabulary is closed and enforced by the database, and its one
  mail-preference act is the stop. That is why only the person themselves may
  start it again — their own preference over their own inbox is not a privileged
  write, and an admin's would be ([`MAIL-DEC-06`](../../decisions-log.md#MAIL-DEC-06)).
- **`A11Y-R01`**, **`I18N-R01`** — the unsubscribe page is a page: reachable,
  operable, and in the reader's language.

## 6. Open questions and trade-offs

- **One suppression list, and it is this one.** SMTP keeps none, so the failure
  where two lists disagree cannot happen. The list is checked before every send,
  by account id, inside the same query that resolves recipients.
- **Not storing the body.** It means "what exactly did we send them" is
  answerable only by subject and date. The alternative is a table of messages
  about named people with a two-year life, and the question is rare enough that
  the trade is worth it.
- **Two years.** A guess, sized to the fundraise cycle rather than to a statute.
  It is stated so it can be argued with rather than left implicit.
- **Nobody in the console can start investor mail again.** The trail has no act
  that names it, and minting one edits a `CHECK` a shipped migration installed —
  the question [`DATA-DEC-01`](../../decisions-log.md#DATA-DEC-01) is already
  holding. So a stop-sending an admin sets by mistake is undone by the person it
  was set on and by nobody else, which is the fail-closed side of the choice and
  is decided at [`MAIL-DEC-06`](../../decisions-log.md#MAIL-DEC-06).

## 7. Task list

- `MAIL-002/T1` — Rows written before the attempt, keyed by account and never by address
- `MAIL-002/T2` — An unsubscribe that works in one click without signing in, and a preference inside the hall
- `MAIL-002/T3` — Transactional mail is never suppressed, enforced by the `kind` set at send time
- `MAIL-002/T4` — A manual `stop sending` control with its reason, and the send view naming the mailbox bounces arrive in
- `MAIL-002/T5` — Two-year retention, and immediate removal with the account
- `MAIL-002/T6` — The admin log, filtered by recipient and date, showing state and error
