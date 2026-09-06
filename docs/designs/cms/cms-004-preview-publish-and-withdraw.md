---
code: CMS-004
title: Preview, publish and withdraw
domain: cms
prd_refs: [CMS-004, CMS-R01, CMS-R02, CMS-R07, SEC-R04]
depends_on: [CMS-001, SEC-002]
depended_by: [POST-002, RPT-002, DECK-002]
layers_touched: [domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R01, CMS-R02, CMS-R07, SEC-R04, A11Y-R01]
status: design-ready
---

# `CMS-004` — Preview, publish and withdraw

## 1. Purpose and PRD refs

The three actions that decide what an investor sees. Realizes `CMS-004` and
carries `CMS-R07`.

`CMS-DEC-02` settled that there is no second role approving what a first role
writes. That decision is only safe because of this design: **the preview is the
approval step**, and it has to show exactly what the reader will get, in the
reader's own view, before anything is published. A preview that is approximate is
a review of something other than what ships.

## 2. Layer walkthrough

**Down.** Publishing validates the revision, moves `content_items.current_revision_id`,
and writes an audit row — in one transaction, in that order. Withdrawing moves
the pointer to the previously published revision, or to null when there is none.

**Up.** Three controls, and each says what will happen before it happens.
Publish names what it replaces. Withdraw names what the reader will see instead —
including when the honest answer is "nothing".

## 3. Contracts

### Preview

    GET /admin/content/<id>/preview?as=investor|public&locale=<locale>

**The preview renders through the reader's own components and the reader's own
data path**, with the audience predicate evaluated as the chosen role rather than
bypassed. It differs from the real thing in exactly one way: it reads the latest
revision instead of the published one, and it says so in a bar across the top
that is not part of the page.

`as=` matters because a public item and an investor item are the same document
with different surroundings, and an admin previewing as themselves sees the admin
chrome around it and misses that the public version has no navigation to the rest
of the room.

A preview is reachable by an admin only. There is no shareable preview link and
no preview token — a token that outlives its preview is a published draft nobody
decided to publish (`CMS-R02`).

### Publish

    POST /admin/content/<id>/publish   { revisionId }

In one transaction:

1. **Validate the revision** against the block vocabulary. A revision that no
   longer validates — because a media row it references was deleted, or a block
   type was retired — is refused with what is wrong, and the pointer does not
   move.
2. **Check the locales.** Publishing does not require every locale (`I18N-DEC-01`),
   but it names how many are reviewed and how many will fall back, and the
   confirmation shows it. Nothing is blocked; the author is told.
3. **Move the pointer.**
4. **Write `content.publish`** naming the item, the new revision and the one it
   replaced (`SEC-R04`, `CMS-R07`).

The `revisionId` is passed explicitly rather than "publish the latest". An author
who left the editor open in another tab and comes back to publish should publish
what they read, not what the other tab saved.

### Withdraw

    POST /admin/content/<id>/withdraw

Moves the pointer to the previous published revision. When there is none, the
item has no published revision and becomes invisible to every reader — the
confirmation says that in those words rather than "unpublish", because the two
outcomes are different and the control is the same.

Withdrawal is **not** deletion. The item, its revisions and its history stay. An
item is deleted only by an admin action that says "delete", and even then the
audit row survives it.

### What publishing does not do

- It does not send mail. `MAIL-001` is a separate, deliberate act, because a
  publish that notifies is a publish nobody can rehearse.
- It does not schedule. There is no future-dated publish: an action that happens
  while nobody is watching is one nobody can stop.
- It does not rebuild anything. Reads go to the database; a public item carries a
  short cache lifetime and a purge on publish.

### One action back

The withdraw control is the single-action undo `CMS-004` promises, and it is
reachable from the item's own screen without a confirmation dialogue that has to
be read — it is reversible in the same way, so a mistaken withdraw costs one
click. The dangerous direction is publishing, and that is the one with the
confirmation.

## 4. Integration

**`CMS-001`** owns the pointer and the validator. **`SEC-002`** receives the
audit rows, in this transaction. **`CMS-005`** supplies the locale counts the
confirmation shows. **`CMS-006`** is evaluated inside the preview so it is the
real rule being previewed. **`POST-002`**, **`RPT-002`** and **`DECK-002`** are
the three surfaces that call publish, and none of them has its own publishing
logic.

## 5. Cross-cutting compliance

- **`CMS-R01`** — publishing replaces a pointer, never a revision.
- **`CMS-R02`** — no preview token, no shareable draft URL.
- **`CMS-R07`** — publish and withdraw audited with what was replaced.
- **`SEC-R04`** — in the same transaction as the write.
- **`A11Y-R01`** — the confirmation is keyboard-operable and focus lands in it.

## 6. Open questions and trade-offs

- **No scheduled publishing.** An announcement timed to a funding event is a
  real want and this refuses it. The reason is that a scheduled publish fires
  when nobody is at a keyboard, and the failure mode — publishing something
  whose facts changed between writing and firing — is discovered by the
  recipients. The workaround is that publishing takes ten seconds.
- **Publishing does not block on missing locales.** It follows `I18N-DEC-01`
  and it is the one place that decision is felt. The mitigation is that the
  confirmation states the count and the item screen keeps showing it until the
  locales are done, so a gap is visible rather than forgotten.
- **The preview shares the reader's components.** It is the reason the preview
  is trustworthy and it means a rendering change breaks both together, which is
  correct. It also means a preview cannot show a diff against the published
  version; that is a second feature and it is not built.

## 7. Task list

- `CMS-004/T1` — Preview renders through the reader's own components and evaluates the audience rule as the chosen role
- `CMS-004/T2` — Preview is admin-only, with no token and no shareable link
- `CMS-004/T3` — Publish validates, moves the pointer and audits, in one transaction, taking an explicit revision
- `CMS-004/T4` — The confirmation names what is replaced and how many locales will fall back
- `CMS-004/T5` — Withdraw returns to the previous published revision, or states plainly that nothing will be visible
- `CMS-004/T6` — A public item's cache is purged on publish and on withdraw
