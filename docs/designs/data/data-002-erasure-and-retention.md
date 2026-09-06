---
code: DATA-002
title: Erasure and retention
domain: data
prd_refs: [DATA-002, DATA-R01, DATA-R03, DATA-R10]
depends_on: [ADMIN-001, SEC-002]
depended_by: [LEGAL-GLOBAL-001, LEGAL-SG-001]
layers_touched: [data, domain, service]
cross_cutting_rules: [DATA-R01, DATA-R02, DATA-R03, DATA-R10, SEC-R04]
status: design-ready
---

# `DATA-002` — Erasure and retention

## 1. Purpose and PRD refs

Where every piece of personal data lives, how long it lives, and what a real
delete removes. Realizes `DATA-002` and carries `DATA-R03`.

Erasure fails in one characteristic way: it deletes the obvious row and leaves
the copies. So the centre of this design is not the delete statement — it is the
**manifest**, an enumerated list of every place a person can appear, checked
mechanically against the schema so a new table cannot be added without either
appearing on it or being declared to hold nothing personal.

## 2. Layer walkthrough

**Down.** One erasure function, driven by the manifest. Foreign keys with the
right `on delete` behaviour do most of the work; the manifest is what proves
"most" is "all".

**Up.** `ADMIN-001`'s confirmation, which lists what goes and what remains.

## 3. Contracts

### The manifest

Every table, and what it holds about a person:

| Table | Personal data | On erasure |
|---|---|---|
| `accounts` | name, address | **deleted** — the row itself |
| `sessions` | last-seen time, coarse location | cascade |
| `invitations` | — (account id, token hash) | cascade |
| `content_grants` | which decks | cascade |
| `deck_reads` | what they read, when | cascade |
| `report_reads` | what they read, when | cascade |
| `mail_log` | subject, time, state | cascade |
| `unsubscribes` | the preference | cascade |
| `content_revisions` | `author_id` | **set null** — the document stays |
| `content_items` | — | — |
| `media` | `uploaded_by` | set null |
| `portfolio` | `updated_by` | set null |
| `config` | `changed_by` | set null |
| `audit` | ids, actions, timestamps, changed field names | **retained** — holds no personal data by construction (`SEC-002`) |

**The split is between what is about the person and what the person did on the
company's behalf.** A report an admin wrote is the company's document; cascading
it would delete an investor's archive to satisfy a staff member's erasure. A deck
read record is about the person and goes.

### The check

`scripts/check-erasure-manifest.py` compares this table against the schema:

1. Every table in the database appears in the manifest.
2. Every column referencing `accounts` has an `on delete` behaviour matching
   what the manifest says.
3. A table declared to hold nothing personal has no column whose name matches
   the personal-data patterns — `email`, `name`, `phone`, `address`, `ip`.

The third is a heuristic and will produce a false positive one day; the answer
then is an explicit exemption line naming the column and why, not a loosened
pattern. A gate that gets quieter each time it fires stops being a gate.

### Retention, for what is not erased

| Data | Kept | Why that long |
|---|---|---|
| `audit` | 7 years | The longest applicable Singapore record-keeping obligation; holds no personal data |
| `mail_log` | 2 years | Long enough to answer a question about a past campaign (`MAIL-002`) |
| `sessions` | until expiry, then deleted | Nothing is learned from an expired session |
| `content_revisions` | forever | The archive is the point (`CMS-R01`) |

A retention window is enforced by a scheduled deletion, not by a policy
document. Until one runs, the window is a claim — and a claim about retention is
the specific thing an audit asks for evidence of.

### Erasure is not suspension

Suspension is reversible and is the right answer to almost every situation.
Erasure is a request from the person, or a decision by the owner, and it is
final. `ADMIN-001` presents them as different actions with different weights,
and this design gives the second one its meaning.

### What is not offered

No export-my-data endpoint. The data held about an investor is a name, an
address, a role, a list of decks and a list of what they opened — and a subject
access request is answered by an admin reading the person's page and writing a
reply. Building a self-service export for a system holding this little would be
building a feature for a request that has never arrived.

## 4. Integration

**`ADMIN-001`** is the surface. **`SEC-002`** is what survives and why it can.
**`MAIL-002`** and `RPT-002`'s read state are two of the cascades.
**`LEGAL-SG-001`** and **`LEGAL-GLOBAL-001`** cite this design as their evidence
rather than restating it.

## 5. Cross-cutting compliance

- **`DATA-R01`** — the manifest is short because the schema holds little.
- **`DATA-R02`** — nothing personal in the audit, which is why it can be kept.
- **`DATA-R03`** — a real delete, and the manifest is the proof it is complete.
- **`DATA-R10`** — every window above is enforced by a scheduled deletion, and
  `DATA-002/T4` is that schedule.
- **`SEC-R04`** — erasure is audited, by id.

## 6. Open questions and trade-offs

- **The pattern check will misfire.** Named above with the response: an
  exemption line, never a weaker pattern.
- **Seven years for the audit is a ceiling, not a requirement.** It is the
  longest plausible obligation rather than a specific one, chosen because the
  rows are tiny and hold nothing personal. `LEGAL-SG-001` may narrow it to
  something citable.
- **No anonymised retention of behaviour.** An erased account's read records go
  entirely rather than being kept without the id. Keeping them would be useful
  and would be data about a person the company was asked to forget.

## 7. Task list

- `DATA-002/T1` — The manifest: every table, what it holds, and what erasure does to it
- `DATA-002/T2` — One erasure function driven by the manifest, with the schema's `on delete` matching it
- `DATA-002/T3` — A gate comparing the manifest against the live schema, with exemptions written rather than patterns loosened
- `DATA-002/T4` — Scheduled deletion enforcing each retention window
- `DATA-002/T5` — Content authored by an erased account survives with a null author
