---
code: MAIL-001
title: Investor mail
domain: mail
prd_refs: [MAIL-001, DATA-R04, SEC-R05, SEC-R04]
depends_on: [ADMIN-001, CMS-004, CRED-001]
depended_by: [MAIL-002]
layers_touched: [service, api, frontend, ui]
cross_cutting_rules: [DATA-R04, DATA-R02, SEC-R04, SEC-R05, I18N-R01, A11Y-R01]
status: pending-decision
decision_required: Which service carries mail to investors
decision_owner: user
---

# `MAIL-001` — Investor mail

## 1. Purpose and PRD refs

An admin sends a message to selected investors. Realizes `MAIL-001`.

**This is the only feature in the product that leaves the system irrecoverably.**
Everything else can be withdrawn, corrected or re-published; a message in
somebody's inbox cannot. So the design is shaped around one property: a send is
an act a person takes deliberately, having seen exactly what will go and exactly
who will get it.

The carrier is unanswered at [`MAIL-DEC-01`](../../decisions-log.md#MAIL-DEC-01).
Everything below is built against a port; only the adapter behind it waits.

## 2. Layer walkthrough

**Down.** A `Mailer` port with one method. One adapter behind it, chosen by the
decision. A `mail_log` row written **before** the attempt and updated with the
outcome (`MAIL-002`).

**Up.** A composer, a recipient list the admin selects into, a preview of the
actual message, and a send control that names the count and requires the count
to be typed.

## 3. Contracts

### The port

    interface Mailer {
      send(to: Address, subject: string, text: string, html: string): Promise<Receipt>
    }

One method, plain text and HTML together, and a receipt carrying the carrier's
own id so `MAIL-002` can reconcile. No templating in the port: the message is
rendered before it reaches it, so a preview and a send are the same bytes.

Absent credential: the port is unavailable and says why (`CRED-001`). The
composer still works, the recipient list still resolves, and the send control is
disabled with the reason on it — an admin who cannot see who they would have
mailed cannot prepare the mail while waiting for a decision.

### Recipients

Selected explicitly from the account list. Filters help — role, state, granted a
particular deck — but the filter produces a **list of names the admin then
confirms**, never a criterion the send re-evaluates at send time. A criterion
evaluated later sends to whoever matches then, which is not who the admin looked
at.

Suspended accounts are excluded and shown as excluded. Unsubscribed accounts are
excluded and shown as excluded, with the reason (`MAIL-002`).

### The message

Subject and body, written in the composer, in one language. **Investor mail is
not translated**: it is a message from a person to named people, and a machine
draft of a personal note is worse than the note in English. That is a deliberate
departure from `I18N-R02`, which governs the product's own strings and not
something an admin writes to somebody they know.

Plain text and HTML are generated from the same source, and the plain-text half
is not an afterthought — it is what a corporate mail client shows.

### Sending

    POST /admin/mail/send   { recipients[], subject, body }

1. Re-resolve every recipient and refuse if any has become suspended or
   unsubscribed since selection.
2. Show the final count and require it to be **typed** (`ADMIN-002`). Typing
   "17" is a different act from clicking a button, and the difference is the
   point.
3. Write a `mail_log` row per recipient, `queued`.
4. Send one at a time, updating each row with its receipt or its error.
5. Audit once as `mail.send` with the subject and the count — never with the
   addresses (`DATA-R02`).

**No batching and no background job.** The admin waits, and watches the count.
A send that happens after the person leaves the page is a send nobody can stop
halfway, and halfway is exactly where somebody realises the subject line is
wrong.

### Failure

A recipient that fails leaves its row `failed` with the carrier's error, and the
send continues. At the end the admin sees which failed and can retry those alone
— a retry that re-sends to everyone is how people receive a message twice.

## 4. Integration

**`CRED-001`** decides whether the port has an adapter. **`ADMIN-001`** supplies
the recipients and their states. **`MAIL-002`** owns the log and the unsubscribe
list this reads. **`AUTH-003`**'s invitation mail uses the same port and is
transactional, so `MAIL-002`'s unsubscribe must never suppress it.

## 5. Cross-cutting compliance

- **`DATA-R04`** — sent only for the consented purpose, recorded, with an
  unsubscribe path in every non-transactional message.
- **`DATA-R02`** — addresses never reach the audit trail or a log line.
- **`SEC-R04`** — a send is a privileged write.
- **`SEC-R05`** — no credential in the tree; absence disables the send and
  leaves the system up.
- **`A11Y-R01`** — the composer and the confirmation are keyboard-operable.

## 6. Open questions and trade-offs

- **The carrier is unchosen.** [`MAIL-DEC-01`](../../decisions-log.md#MAIL-DEC-01).
  The safe default while it waits is that nothing can be sent, and the mechanism
  is built to the port so answering it is an adapter rather than a feature.
- **Sending in the foreground does not scale.** With fifty recipients it is
  fine; at five hundred it is a timeout. The trade is deliberate at this size,
  and the signal to change it is a recipient list that does not fit on a screen.
- **No open or click tracking.** A pixel in a message to a named investor is
  surveillance of a person the company is asking for money. Whether they opened
  it is not worth what it costs to know.

## 7. Task list

- `MAIL-001/T1` — The `Mailer` port, and the composer that renders the exact bytes the send will use
- `MAIL-001/T2` — Recipients are a confirmed list of names, never a criterion re-evaluated at send time
- `MAIL-001/T3` — Suspended and unsubscribed accounts are excluded and shown as excluded, with the reason
- `MAIL-001/T4` — The send requires the recipient count to be typed, and re-resolves every recipient first
- `MAIL-001/T5` — One row per recipient written before the attempt; a failure leaves the row and the send continues
- `MAIL-001/T6` — Retry sends only to the ones that failed
- `MAIL-001/T7` — With no credential the composer works, the list resolves, and the send control is disabled with the reason
