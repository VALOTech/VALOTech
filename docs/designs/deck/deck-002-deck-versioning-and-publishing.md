---
code: DECK-002
title: Deck versioning and publishing
domain: deck
prd_refs: [DECK-002, CMS-R01, CMS-R02, CMS-R07, SEC-R04]
depends_on: [CMS-004, DECK-001]
depended_by: [DECK-003, DECK-004]
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R01, CMS-R02, CMS-R07, SEC-R04, DATA-R05]
status: design-ready
---

# `DECK-002` — Deck versioning and publishing

## 1. Purpose and PRD refs

Which version of a deck an investor reads, and what is recoverable about what
they were shown. Realizes `DECK-002` and carries `CMS-R01` at its sharpest.

The PRD states the requirement in one sentence: **an investor who was shown one
version must not be silently shown another.** A fundraise is the setting where
that question is eventually asked by somebody with a lawyer, and the only
truthful answer is one recorded at the time.

`CMS-001` already gives immutable revisions and a published pointer. This design
is what a deck needs on top of that, and it is not much — which is the point of
having built the machinery once.

## 2. Layer walkthrough

**Down.** Revisions as everywhere. What a deck adds is a **version label** on the
published revision and a record of which version each grantee has been shown.

**Up.** The reader sees the version they were granted, or the current one if
their grant does not pin a version. The admin sees, per investor, which version
they last opened and when.

## 3. Contracts

### Versions

A published revision of a deck carries `version` — a monotonic integer per deck,
assigned at publication. It is a label on a revision, not a second concept: v3 is
the third revision of this deck that was ever published.

    publish(deckId, revisionId) -> version = max(version for this deck) + 1

Versions are never reused and never renumbered, including after a withdrawal. A
withdrawn v3 leaves a hole, because "the version they read" has to keep resolving
for as long as anyone might ask.

### What a grantee reads

`content_grants` gains an optional `pinned_version`:

| `pinned_version` | Behaviour |
|---|---|
| null | The reader gets the current published version, and sees a note when it changes between visits |
| `n` | The reader gets version `n`, whatever has been published since |

Pinning is for the case that makes this feature necessary: a deck sent into a
diligence process, where the document under discussion must not move. Unpinned is
the default, because a room full of pinned decks is a room where an investor is
reading last year's story and nobody knows.

**When an unpinned reader's deck changes**, the reading view says so once: the
version number, the publication date, and a link to what changed at the section
level. Silence here is the specific failure `CMS-R01` was written against.

### The read record

    deck_reads(account_id, deck_id, version, first_opened_at, last_opened_at)

One row per account per version. It is what makes *what were they shown, and
when* answerable directly rather than inferred from an audit trail plus a
publication history. It is the second and last piece of behavioural data this
product keeps (`RPT-002`'s read state is the first), it is deleted with the
account, and it is stated in the privacy posture.

### Publishing

Through `CMS-004`, with one addition: the confirmation names every investor
holding an unpinned grant, because they will see the new version on their next
visit. Publishing a deck is the one publish in this product with a named
audience, and knowing who is about to see something different is the difference
between publishing and sending.

### Withdrawing

Moves the pointer back, as everywhere. A pinned grant to the withdrawn version
**keeps working** — the revision still exists and the pin still names it. That is
deliberate: withdrawing a version to stop showing it to new readers must not
retract a document from somebody in the middle of reading it, and if it must,
the action is to revoke the grant, which is a different thing said differently.

## 4. Integration

**`DECK-001`** authors. **`CMS-004`** is the publish and withdraw machinery this
extends. **`DECK-003`** reads a version. **`DECK-004`** is the grant surface,
including the pin. **`SEC-002`** records publication with the version.

## 5. Cross-cutting compliance

- **`CMS-R01`** — every published version survives, and a pin can name it
  forever.
- **`CMS-R02`** — a draft has no version and reaches nobody.
- **`CMS-R07`** — publication audited with the version and what it replaced.
- **`SEC-R04`** — in the same transaction.
- **`DATA-R05`** — the read path takes the reader and resolves their pin.

## 6. Open questions and trade-offs

- **A section-level diff between versions.** Promised above in the change
  notice, and it is the one part of this design that is real work: comparing two
  block arrays and reporting which sections changed. The cheap version — listing
  section headings that were added, removed or whose text differs — is what
  ships; a word-level diff is not built.
- **Keeping a read record.** Behavioural data about a named investor, kept
  because the requirement this design exists for cannot be met without it. It is
  the minimum that answers the question: which version, first and last opened.
  Not how long, not how far they scrolled, not which sections.
- **Pins default to off.** A safer default would pin every grant at the version
  current when it was made, which would mean nobody is ever silently moved. It
  would also mean an investor granted a deck in March reads March's story in
  October and nobody notices. The notice on change is the compromise.

## 7. Task list

- `DECK-002/T1` — A monotonic version assigned at publication, never reused, holes kept
- `DECK-002/T2` — An optional pinned version on a grant; unpinned readers get the current one
- `DECK-002/T3` — An unpinned reader is told once when the version changed, with what changed by section
- `DECK-002/T4` — A read record per account per version, deleted with the account
- `DECK-002/T5` — The publish confirmation names every investor who will see the new version
- `DECK-002/T6` — Withdrawal does not break a pin to the withdrawn version
