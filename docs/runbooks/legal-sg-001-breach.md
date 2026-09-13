# Runbook — `LEGAL-SG-001` a notifiable data breach

> Written before it is needed rather than during, which is the only time it can
> be written calmly. Nothing here has been executed, because no breach has
> happened; what has been checked is that every console path and every command it
> names exists today. The assessment below is a procedure a person follows, not a
> script — the judgement it asks for is the part that cannot be automated.

## What this is

Personal data held by this product reaching somebody who should not have it: a
document served to an investor with no grant, an account taken over, a backup or
its key in the wrong hands, a database reachable from outside the private subnet.

Singapore's PDPA notifiable data breach regime requires notice to the **PDPC**
without undue delay, and — where the breach is likely to result in **significant
harm** to the individuals — notice to **those individuals** as well. Two paths,
assessed separately, and the first does not wait on the second.

## The clock is 72 hours, and it is the only one

**From the moment anybody here becomes aware of it, not from the moment the
assessment finishes.** Awareness is the earlier of the two and it is the one to
count from, because the assessment is work that happens inside the window
rather than before it starts.

This one clock applies to **every** affected person, wherever they are
(`LEGAL-GLOBAL-001`). An investor in the EU brings a deadline of their own, and
the answer is not to run two: a runbook holding one clock for some people and a
different clock for others is a runbook that uses the wrong one at four in the
morning, by somebody who has been awake since two and does not yet know which
residences are involved. Running the shorter one for everybody costs a few
hours of margin and removes a decision from the worst moment to be making one.

**72 hours is a ceiling and not a schedule.** Both regimes ask for notice
without undue delay, so a breach understood on the first morning is notified
that morning. The number is what you have, never what you take.

If the 72 hours will be missed, that is a fact to state in the notification
with its reason, not a reason to keep working in silence until the notice is
perfect.

**The population is small enough to notify individually.** That is this system's
one advantage at this size and it is worth saying out loud, because the reflex
under pressure is a public announcement, and a public announcement about a
handful of named investors is a second disclosure.

## How a breach reaches you

Not from an alarm that says "breach". It arrives as one of these:

- An investor says they can read something they should not, or that a link they
  were sent shows somebody else's document.
- `OPS-002`'s alerting fires on an error rate or an unexpected status pattern.
- The audit shows an act nobody performed — a grant, a role change, a deletion
  with an actor who was not at a keyboard.
- Somebody outside reports it. Treat this as credible until it is disproven, not
  the reverse.

## Stop it first, assess second

The assessment below takes hours; containment takes minutes and does not wait on
it.

1. **End the sessions.** `/admin/accounts/<id>` → End sessions for a compromised
   account. Suspending also ends every live session in the same transaction
   (`ADMIN-001/T3`), and is right when the account itself is the problem.
2. **Narrow what is readable.** If a document is reaching the wrong readers, its
   audience is the lever: `/admin/content/<id>` → Who may read it (`CMS-006/T6`).
   Narrowing takes effect on the next read and is audited. It does **not** recall
   what has been served, and the confirmation says so — record what the window
   was, because the assessment needs it.
3. **Withdraw it entirely** if narrowing is not enough: `/admin/content/<id>` →
   Withdraw. Readers stop seeing it; the revision stays on disk.
4. **Revoke a grant** that should not exist. There is no console control for
   this yet — `DECK-004/T4` is the surface and it is open — so today it is the
   owner calling `content/grants.ts:removeGrant`, or, if that is not to hand,
   narrowing the item's audience away from `granted`, which reaches every
   grantee at once and is a control that exists.
5. **Rotate what leaked.** If a credential or `BACKUP_KEY` is implicated, rotate
   it before anything else — a live key is an ongoing breach, not a past one.

Write down the time of each act as you do it, in UTC, starting with the moment
you became aware — that one starts the 72 hours and is the only timestamp the
notification is measured against. The notification needs a timeline and
reconstructing one afterwards from memory is how the timeline becomes wrong.

## Assess — is it notifiable

Two questions, answered in this order, and the answers written down.

**1. Is it a breach of personal data?** What this product holds about a person is
the manifest in [`DATA-002`](../designs/data/data-002-erasure-and-retention.md)
§3 — that table is the authority. A leaked *document* is a confidentiality
problem and may be a serious one, but it is not a personal-data breach unless the
document or the leak carries something from that manifest.

**2. Is significant harm likely?** The data here is a name, a business address, a
role, and what somebody read and when. It carries no financial instrument, no
health, no government identifier, no password in plain form. That does not make
harm impossible — an investor's identity and their reading of an unpublished
report is commercially sensitive, and a list of who is invested is itself a
disclosure — but it does mean the answer is reasoned rather than assumed in
either direction.

Record the reasoning either way. A decision not to notify individuals is a
decision that has to be defensible later, and the record is the defence.

## Notify the PDPC

Within the 72 hours above, and without undue delay once the assessment concludes
it is notifiable — whichever comes first. The notification carries: what happened
and when it was discovered, what data and how many individuals, what has been
done to contain it, and what is being done to stop it recurring.

Prepare all four before filing rather than filing a first version and correcting
it — a corrected count is the detail that gets read.

## Notify the individuals

Where significant harm is likely, and at the same time as the PDPC unless
notifying the individuals would itself worsen the harm.

Every affected person is a named account with an address, so this is individual
mail and not an announcement. It says, in plain words: what happened, what of
theirs was involved, what has been done, what they should do, and who to write
to. An unsubscribe must not suppress it — a breach notice is transactional, not a
campaign — and `MAIL-002/T3` is the row that will enforce that at send time. It
is open, so today the enforcement is this sentence and the person sending.

**If the mail path is unavailable**, the addresses are on the person pages and
the owner sends the notice from the company mailbox. Do not delay notification on
the product's own send path being ready; `MAIL-001/T8` is not a prerequisite for
telling somebody their data leaked.

## After

- **Write down what actually happened**, including the parts that were luck.
- **Fix the cause, then the class.** The specific leak, and then the gate that
  would have caught it — a test, a predicate, a check in `make check`. A fix with
  no mechanical successor is a fix that waits to be undone.
- **Re-read this runbook** against what you just did and correct the steps that
  were wrong. The first execution is the only one that finds them.

## What this depends on

`CMS-006` for the audience lever; `ADMIN-001` for sessions and suspension;
`DATA-002` for the manifest; `DATA-003` for the backups and their key;
`OPS-002` for the alerting that may be how this starts; `MAIL-002` for the
transactional path that carries an individual notice.

## Verified

**Never executed.** No breach has occurred. Every console path named above was
opened and its controls read while this was written; the PDPC notification itself
has no rehearsal short of filing one. Re-read this whenever `CMS-006`'s audience
control, `ADMIN-001`'s actions or `DATA-003`'s key handling change, since the
containment steps name them directly.
