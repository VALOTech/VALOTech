# Runbook — `LEGAL-SG-001` answering a data-protection request

> This is a procedure, not a deploy. Most of it is a person reading a screen and
> writing a reply, so there is little here to execute — but the console paths
> below were each opened and the controls on them read, and where a path does not
> exist this says so rather than describing one that ought to.

## What this is

Somebody named in `accounts` asks what is held about them, asks for it corrected,
withdraws their consent, or asks to be erased. `LEGAL-SG-001` §3 sets the posture;
this is how the four are actually answered with the console that exists today.

**Thirty days, for all four.** The PDPA sets that standard for an access request
and this product uses it for every right, so there is one number to remember
rather than four. The clock starts when the request arrives at the contact
address, not when somebody notices it.

## Confirm who is asking, first

Every one of these acts on a named person's data, and three of them destroy
something. The request arrives by e-mail, and an e-mail address is not proof of
anything on its own.

- The request must come **from the address on the account**. If it does not, reply
  to the address on the account — never to the one that wrote in — and ask them to
  confirm from it.
- If the address itself is what is disputed (a correction request, or a person who
  has lost the mailbox), do not act on mail alone. That case needs the owner.

A request that cannot be tied to the account is answered by saying so, inside the
thirty days, rather than by guessing.

## Access — what is held about me

Read it from the console and write it out; there is no self-service export and
none is planned (`DATA-002` §3).

1. **`/admin/accounts`** — find the person, open their page.
2. **`/admin/accounts/<id>`** carries the identity and the access facts: name,
   address, role, state, when they were created and when they last signed in, and
   their live sessions.
3. **Everything else held about them** is the manifest in
   [`DATA-002`](../designs/data/data-002-erasure-and-retention.md) §3 — that table
   is the authority, not this list, because a gate holds it against the schema and
   a table nobody declared fails the build. What it names as personal today: the
   account row, `sessions`, `invitations`, `content_grants` (which decks they may
   read), `deck_reads` and `report_reads` (what they opened and when), `mail_log`
   (subject, time, state — never an address), and `unsubscribes`.
4. **`audit`** holds acts, not people: no action's allow-list may name a personal
   field (`SEC-002/T4`). An admin answering an access request does not need to
   read it, and should not offer it as a record of the person.

Reply in plain words, listing what is held and why, matching `LEGAL-SG-001` §3's
table. A reply that reads like a schema dump is a reply that has to be explained
again.

## Correction — this is wrong, fix it

1. **`/admin/accounts/<id>`**, the Correction form at the foot of the Actions
   section. The two fields open holding what the record holds; change the one
   that is wrong and leave the other alone.
2. **Save correction.** The act writes both fields or neither, and says which of
   them moved.
3. Three answers are refusals rather than faults, and each names itself. *That
   address already belongs to another account* means the person already has a
   second row — resolve which one they keep before correcting anything, because
   the console cannot merge them. *A name is needed* and *not an address this
   system can store* are the two values the record will not take.
4. *Nothing changed* is neither a refusal nor a fault: the row already held what
   was asked for, and an address differing only in case is the same address.
5. **The act is audited as `account.correct`, naming which fields moved and
   neither of the values** (`SEC-DEC-01`). If the reply has to say what the
   record said before, take it from the person's own request or from the reply
   that answered their access request — the trail does not hold it, by design.

**Correcting the address stops a link they had not used from working**, and the
form says so when it happens. The link was minted for the mailbox that has just
been found wrong, so it goes with the address. Issue a new one from the same
page: **Resend invitation** if they had never accepted, **Reset password** if
they were part-way through a reset. Nothing is mailed yet (`AUTH-003/T3`), so
the invitation link is delivered by hand, and the reset hands back nothing at
all — tell them it is coming and that it will not reach them until the reset
mail is built.

**Correcting an address ends no session.** The person is the same person and
their access has not moved, so somebody signed in on their phone stays signed in.
If the request is really *this account is not mine* — an address that reached
somebody else, and they accepted the invitation — then correction is the wrong
act: suspend the account or end its sessions first, on the same page, and only
then correct the record.

**An address that is itself disputed still needs the owner.** The identity check
above is not waived by the control existing: the one request that cannot be
confirmed from the address on the account is the one asking to change it.

## Withdrawal of consent — stop holding my data

Consent is the basis for the account existing at all, and access is its only
purpose (`LEGAL-SG-001` §3). So a withdrawal is an erasure; there is no lesser
state to move them to. Confirm that in the reply **before** acting, because the
person may mean "stop mailing me", which is the unsubscribe (`MAIL-002`) and
leaves their access alone.

## Erasure — delete me

1. **`/admin/accounts/<id>`**, the Delete control.
2. The confirmation lists what goes and what stays, and asks for the person's name
   to be typed (`ADMIN-001/T4`). Read that list to answer their question about
   what survives, rather than describing it from memory.
3. Two refusals are real and are not faults: the last admin, and yourself
   (`ADMIN-001/T5`).
4. The act is audited as `account.delete`.

**Tell them about the backups.** An erased person is still in an encrypted backup
for up to twelve months — seven daily, four weekly, twelve monthly
(`DATA-003` §3) — and those backups are restored only to recover from data loss.
`LEGAL-SG-001` §3 discloses this in the notice for the same reason it belongs in
the reply: every system has it, and a claim otherwise is the inaccurate one.

## What stays after an erasure, and why

`content_revisions.author_id` and `content_locales.reviewed_by` are set to null
rather than cascaded — the document and the reviewed translation survive the
person who wrote them, which is what an archive means (`CMS-R01`). `audit` is
retained for seven years and holds ids and acts rather than people.

If the person asks why anything remains, that is the answer: nothing of theirs
remains, and what does is the record of what was done.

## What this depends on

`DATA-002` for the manifest and the delete; `ADMIN-001` for the console;
`DATA-003` for the backup window; `MAIL-002` for the unsubscribe that is not a
withdrawal.

## Verified

**Never executed end to end.** No data-protection request has been received,
because there are no investors yet. What has been checked is that every console
path named above exists and carries the controls named. The correction path is
the one whose behaviour is pinned rather than merely present: each answer this
section tells the reader to expect — the fields that moved, the taken address,
the two unusable values, the invitation that stops working, the sessions that do
not — is asserted against a real PostgreSQL by
`apps/web/src/app/admin/accounts/[id]/correct/route.test.ts`. Re-verify when the
first account belongs to somebody outside the company.
