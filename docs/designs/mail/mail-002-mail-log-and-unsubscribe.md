---
code: MAIL-002
title: Mail log and unsubscribe
domain: mail
prd_refs: [MAIL-002, DATA-R04, DATA-R03, SEC-R04]
depends_on: [MAIL-001]
depended_by: []
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [DATA-R04, DATA-R02, DATA-R03, SEC-R04, A11Y-R01, I18N-R01]
status: pending-decision
decision_required: Which service carries mail to investors
decision_owner: user
---

# `MAIL-002` — Mail log and unsubscribe

## 1. Purpose and PRD refs

What was sent, to whom, when — and a way to stop receiving it that works.
Realizes `MAIL-002` and carries `DATA-R04`.

Both halves are legal obligations before they are features. A record of what was
sent is what answers a data-subject request; a working unsubscribe is what
`DATA-R04`, Singapore's DNC provisions and every equivalent regime require. A
send system without them is a send system that should not be used.

Blocked on the same decision as `MAIL-001`
([`MAIL-DEC-01`](../../decisions-log.md#MAIL-DEC-01)), because the log's shape
depends on what the carrier reports back, and whether the carrier keeps its own
suppression list decides whether this is one list or two.

## 2. Layer walkthrough

**Down.** `mail_log` rows, written before the attempt and updated after.
`unsubscribes` keyed by account, with a timestamp and the token that did it.

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
| `state` | `queued`, `sent`, `failed`, `bounced` |
| `carrier_id`, `error` | The receipt, or why not |

Written **before** the attempt, so a crash between write and send leaves a record
of an attempt rather than no record at all. The body is not stored: the subject,
the recipient and the time answer every question the log is asked, and storing
the body would put a message about a person in a table with a long retention.

### Bounces

If the carrier reports them, a webhook updates the row and marks the account. A
hard bounce twice in a row suspends sending to that address and tells an admin —
continuing to mail an address that does not exist is how a sending domain's
reputation is lost, which then costs the deliverability the whole feature is for.

Whether there is a webhook at all depends on the carrier, which is the decision.

### Unsubscribe

    GET /unsubscribe/<token>     confirms, one click, no sign-in
    POST /account/mail           the preference, from inside the room

Every **bulk** message carries the link, and the token identifies the account
without authenticating it — an unsubscribe that requires signing in is an
unsubscribe most people cannot complete, and the regime does not care why it
failed. The token is single-purpose and does nothing but this.

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
- **`SEC-R04`** — an unsubscribe is a privileged write and is audited.
- **`A11Y-R01`**, **`I18N-R01`** — the unsubscribe page is a page: reachable,
  operable, and in the reader's language.

## 6. Open questions and trade-offs

- **One suppression list or two.** If the carrier keeps its own, the two can
  disagree, and the failure is that somebody who unsubscribed hears from us
  again. The position when the decision lands: **this list is authoritative and
  is checked before every send**, whatever the carrier also does.
- **Not storing the body.** It means "what exactly did we send them" is
  answerable only by subject and date. The alternative is a table of messages
  about named people with a two-year life, and the question is rare enough that
  the trade is worth it.
- **Two years.** A guess, sized to the fundraise cycle rather than to a statute.
  It is stated so it can be argued with rather than left implicit.

## 7. Task list

- `MAIL-002/T1` — Rows written before the attempt, keyed by account and never by address
- `MAIL-002/T2` — An unsubscribe that works in one click without signing in, and a preference inside the room
- `MAIL-002/T3` — Transactional mail is never suppressed, enforced by the `kind` set at send time
- `MAIL-002/T4` — Bounce handling where the carrier reports it, suspending a twice-hard-bounced address
- `MAIL-002/T5` — Two-year retention, and immediate removal with the account
- `MAIL-002/T6` — The admin log, filtered by recipient and date, showing state and error
