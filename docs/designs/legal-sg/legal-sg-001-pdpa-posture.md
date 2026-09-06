---
code: LEGAL-SG-001
title: PDPA posture
domain: legal-sg
prd_refs: [LEGAL-SG-001, DATA-R01, DATA-R03, DATA-R04]
depends_on: [DATA-002]
depended_by: [LEGAL-GLOBAL-001]
layers_touched: [service, frontend, ui]
cross_cutting_rules: [DATA-R01, DATA-R02, DATA-R03, DATA-R04, I18N-R01]
status: design-ready
---

# `LEGAL-SG-001` — PDPA posture

## 1. Purpose and PRD refs

What VALO TECH PTE. LTD. owes, under Singapore's Personal Data Protection Act
2012, to the people whose data this system holds. Realizes `LEGAL-SG-001`.

The scope is unusually small and saying so precisely is most of the value: **the
only personal data this product holds is the identity of the investors and admins
who have been given access.** No customer data, no payment data, no visitor
analytics unless `OPS-DEC-01` says otherwise. A posture written for a system that
holds less than people assume is a posture that can actually be honoured.

## 2. Layer walkthrough

**Down.** Nothing new is stored. This design is a set of statements about what
already exists, and a small number of surfaces that make those statements
reachable.

**Up.** A privacy notice, a named contact, and the two rights a person exercises
by writing to that contact.

## 3. Contracts

### What is held, and on what basis

| Data | Purpose | Basis |
|---|---|---|
| Name, e-mail address | To give a named person access to company reporting | Consent, given by accepting an invitation the person asked for or agreed to receive |
| Role, state | To decide what they may read | Same |
| Last sign-in, session records | To let the person and an admin see and end sessions | Legitimate interests — security of the account |
| What they opened, and when | To show them what is unread; for a deck, to record which version they were shown | Legitimate interests, stated in the notice |

The last row is the one that must be disclosed rather than assumed, because it is
behavioural and people do not expect it. Its purpose is narrow and it is written
down: it is not aggregated, not reported to an admin as analytics, and not kept
after the account goes.

### The notice

A page at `/privacy`, in twenty locales, saying in plain words: what is held, why,
on what basis, how long, who to write to, and what the person can ask for. It is
linked from the sign-in page and from the room's footer, and it is short —
a notice nobody finishes is a notice nobody has read.

Written to be true rather than complete. A generic template listing processing
this product does not do is worse than a page naming five things accurately.

### The rights, and how they are answered

| Right | How |
|---|---|
| Access | Write to the contact; an admin reads the person's page and replies. No self-service export (`DATA-002` §3) |
| Correction | Write to the contact; an admin edits the account |
| Withdrawal of consent | Write to the contact, or ask an admin. Withdrawal means the account is deleted, because the only purpose is access |
| Erasure | `DATA-002`'s manifest-driven delete |

Answered within **30 days**, which is the standard the PDPA sets for an access
request and is used here for all four so there is one number to remember.

### The contact

A named person and an address, published in the notice. The PDPA requires a data
protection officer to be designated; at this size that is the owner, and the
designation is a fact to be recorded rather than an organisational change.

### Breach notification

The PDPA's notifiable data breach regime requires notice to the Commission
without undue delay and, where the breach is likely to result in significant harm,
to affected individuals. The runbook at `docs/runbooks/legal-sg-001-breach.md`
carries the assessment steps and the two notification paths, and it is written
before it is needed rather than during.

**The population is small enough to notify individually**, which is the one
advantage of this system's size and is worth stating in the runbook so nobody
reaches for a public announcement.

### The gap this posture names

A backup taken before an erasure still contains the erased person, for up to
twelve months (`DATA-003` §6). That is disclosed in the notice rather than
omitted, because every system has it and a notice that implies otherwise is the
inaccurate one.

## 4. Integration

**`DATA-002`** is the erasure and retention this cites as evidence.
**`DATA-003`** is the backup window the notice discloses. **`MAIL-002`** is the
unsubscribe path. **`ADMIN-001`** is where an admin performs correction and
erasure. **`LEGAL-GLOBAL-001`** covers an investor in the EU, where the
obligations are stricter and mostly the same in shape.

## 5. Cross-cutting compliance

- **`DATA-R01`** — the table above is the whole of what is held.
- **`DATA-R02`** — none of it reaches a log.
- **`DATA-R03`** — erasure is real, with a stated backup window.
- **`DATA-R04`** — mail is sent for the stated purpose with a working
  unsubscribe.
- **`I18N-R01`** — the notice is in twenty locales like the rest of the page.

## 6. Open questions and trade-offs

- **DNC provisions do not apply** — no telephone numbers are held and no
  marketing messages are sent to Singapore numbers. Stated so a future reader
  does not have to re-derive it.
- **No cross-border transfer assessment yet.** It depends on where the
  application runs (`INFRA-DEC-03`) and on the mail carrier
  (`MAIL-DEC-01`). Both are open, and the assessment is a task that unblocks
  with them rather than a gap in this design.
- **The owner is the DPO.** Correct at this size and worth revisiting when
  somebody else joins, because a DPO who is also the person deciding what to
  build has a structural conflict that only scale makes real.

## 7. Task list

- `LEGAL-SG-001/T1` — The privacy notice: what is held, why, how long, who to write to, in twenty locales
- `LEGAL-SG-001/T2` — The notice is linked from the sign-in page and the room's footer
- `LEGAL-SG-001/T3` — The four rights answered within thirty days, with the admin path for each written down
- `LEGAL-SG-001/T4` — A named DPO recorded, and published in the notice
- `LEGAL-SG-001/T5` — A breach runbook with the assessment steps and both notification paths
- `LEGAL-SG-001/T6` — The backup window disclosed in the notice rather than omitted
