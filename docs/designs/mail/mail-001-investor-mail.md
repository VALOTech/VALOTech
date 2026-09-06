---
code: MAIL-001
title: Investor mail
domain: mail
prd_refs: [MAIL-001, DATA-R04, SEC-R05, SEC-R04]
depends_on: [ADMIN-001, CMS-004, CRED-001]
depended_by: [MAIL-002]
layers_touched: [service, api, frontend, ui]
cross_cutting_rules: [DATA-R04, DATA-R02, SEC-R04, SEC-R05, I18N-R01, A11Y-R01]
status: design-ready
---

# `MAIL-001` — Investor mail

## 1. Purpose and PRD refs

An admin sends a message to selected investors. Realizes `MAIL-001`.

**This is the only feature in the product that leaves the system irrecoverably.**
Everything else can be withdrawn, corrected or re-published; a message in
somebody's inbox cannot. So the design is shaped around one property: a send is
an act a person takes deliberately, having seen exactly what will go and exactly
who will get it.

The carrier is **SMTP against the company's own mailbox**
([`MAIL-DEC-01`](../../decisions-log.md#MAIL-DEC-01)). No third party holds an
investor's address and no processor agreement is needed; what is given up is the
bounce signal, and that consequence is carried explicitly in `MAIL-002` rather
than left to be discovered by a message nobody received.

## 2. Layer walkthrough

**Down.** A `Mailer` port with one method, and one SMTP adapter behind it. The
port stays because the adapter is the part most likely to change — `MAIL-DEC-01`
names the signal that would change it — and because a port is what lets the send
path be tested without a mail server. A `mail_log` row is written **before** the
attempt and updated with the outcome (`MAIL-002`).

**Up.** A composer, a recipient list the admin selects into, a preview of the
actual message, and a send control that names the count and requires the count
to be typed.

## 3. Contracts

### The port

    interface Mailer {
      send(to: Address, subject: string, text: string, html: string): Promise<Receipt>
    }

One method, plain text and HTML together, and a receipt. Over SMTP the receipt
carries the **queue id the server returned on `250`** and nothing else; there is
no delivery confirmation and no later callback, so `MAIL-002` records that the
message was accepted for delivery and never that it arrived. Saying it that way
in the log is the difference between a record and a claim.

No templating in the port: the message is rendered before it reaches it, so a
preview and a send are the same bytes.

    SMTP_URL=smtps://user:pass@mail.example.com:465
    MAIL_FROM="VALO Tech <investors@valotech.org>"

Implicit TLS on 465, or STARTTLS on 587 with certificate verification on. A
connection that cannot be secured **fails the send** rather than falling back to
plaintext: an investor's address and the subject line would otherwise cross the
network in the clear, and a silent downgrade is the way that happens.

Absent credential: the port is unavailable and says why (`CRED-001`). The
composer still works, the recipient list still resolves, and the send control is
disabled with the reason on it — an admin who cannot see who they would have
mailed cannot prepare the mail while the credential is being arranged.

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

A recipient that fails leaves its row `failed` with the server's reply text, and
the send continues. At the end the admin sees which failed and can retry those
alone — a retry that re-sends to everyone is how people receive a message twice.

**A `250` is not delivery.** It means the company's own mail server accepted the
message; what happens after that is invisible to this system. The admin's view
says *accepted* rather than *sent*, because the word people read as a guarantee
is the one this carrier cannot give.

One connection is opened per send and reused for every recipient, closed at the
end. Opening one per message is how a mailbox provider decides this is a script
and starts refusing.

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

- **SMTP gives no bounce signal, and that is the real cost of the choice.**
  A dead address is indistinguishable from a delivered one, so
  `MAIL-002` cannot suspend sending to it and the company's sending reputation
  is protected by nothing but the recipient list being short and hand-picked.
  The signal to revisit `MAIL-DEC-01` is a send to more than a few dozen people,
  or the first time somebody reports never receiving an invitation.
- **Sending in the foreground does not scale.** With fifty recipients it is
  fine; at five hundred it is a timeout, and a mailbox provider will rate-limit
  it long before that. The trade is deliberate at this size, and the signal to
  change it is a recipient list that does not fit on a screen.
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
- `MAIL-001/T8` — One SMTP connection per send, TLS required, and a connection that cannot be secured fails rather than falling back
