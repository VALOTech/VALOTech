---
code: LEGAL-GLOBAL-001
title: GDPR posture for EU investors
domain: legal-global
prd_refs: [LEGAL-GLOBAL-001, DATA-R01, DATA-R03]
depends_on: [DATA-002, LEGAL-SG-001]
depended_by: [LEGAL-GLOBAL-002]
layers_touched: [service, frontend, ui]
cross_cutting_rules: [DATA-R01, DATA-R02, DATA-R03, DATA-R04, I18N-R01]
status: design-ready
---

# `LEGAL-GLOBAL-001` — GDPR posture for EU investors

## 1. Purpose and PRD refs

What changes when an investor is in the EU or the UK. Realizes
`LEGAL-GLOBAL-001`.

The company is in Singapore and the system is small, so the honest framing is
narrow: the GDPR applies to this product **if and when a person in the EU is
given an account**, and the sensible posture is to hold the whole system to the
stricter standard rather than to detect jurisdiction per account. Detecting it
means storing where somebody is, which is more personal data collected in order
to protect personal data.

## 2. Layer walkthrough

**Down.** No new storage and no new field. The changes are three obligations
that go beyond `LEGAL-SG-001` and one document.

**Up.** The same privacy notice, carrying the additional statements the GDPR
requires.

## 3. Contracts

### What the GDPR adds over the PDPA here

| Obligation | What it means for this system |
|---|---|
| Lawful basis stated per purpose | `LEGAL-SG-001`'s table already does this; the wording is reused rather than duplicated |
| **Portability** | A person may ask for their data in a machine-readable form. The system holds five fields and two lists, so the answer is a JSON file an admin generates from the account page |
| **Objection to legitimate interests** | The read-tracking basis can be objected to. Honouring it means the account keeps working and the read records stop being written and are deleted |
| **International transfer** | Data sits in Singapore, or wherever `INFRA-DEC-03` puts it. The transfer needs a lawful mechanism — Standard Contractual Clauses in the ordinary case |
| **Records of processing** | One page, because there is one processing activity |
| **72-hour breach notification** | Stricter than the PDPA's. The runbook uses the stricter clock for everyone |

### Portability, concretely

    GET /admin/accounts/<id>/export   -> application/json

An admin action, not self-service. It emits: the account's fields, the list of
decks granted, the list of what was read and when, and the mail log's subjects
and dates. It is a file the admin sends; there is no download link mailed to the
person, which would be a credential in an inbox.

This is the one place this design adds a surface rather than a statement, and it
is small because the data is.

### Objection to read-tracking

An account flag: when set, `deck_reads` and the report read state stop being
written for that account and the existing rows are deleted. The room still works
— unread marking degrades to "everything looks new", which is a worse experience
that the person chose.

The flag is a right being honoured, so it is an admin action recorded in the
audit, and it is stated in the notice as something a person may ask for.

### The stricter clock everywhere

Breach notification runs on **72 hours** for every person, not only for those in
the EU. Two clocks in one runbook is a runbook that uses the wrong one at four in
the morning.

### What is not claimed

No EU representative is appointed, no DPO is registered with a supervisory
authority, and no transfer impact assessment is written. Those become necessary
at thresholds this product is nowhere near, and claiming them would be worse than
naming their absence. **The position is stated so it can be revisited**, and the
signal is the first EU-resident investor being given an account.

## 4. Integration

**`LEGAL-SG-001`** is the base posture; this is the delta. **`DATA-002`** is the
erasure and the manifest the export walks. **`ADMIN-001`** carries both new
controls. **`OPS-001`** decides where the data sits, which decides which transfer
mechanism applies.

## 5. Cross-cutting compliance

- **`DATA-R01`** — portability is cheap because there is little to port.
- **`DATA-R02`** — the export is a file an admin sends, never a link that could
  be intercepted.
- **`DATA-R03`** — objection deletes the rows it stops writing.
- **`DATA-R04`** — the unsubscribe path is the same one.
- **`I18N-R01`** — the additional notice statements are translated with the
  rest.

## 6. Open questions and trade-offs

- **Holding everyone to the stricter standard.** It costs the read-tracking
  objection and the 72-hour clock for accounts that do not need them. It buys
  never storing where somebody lives in order to decide which rules to apply,
  which would be a new category of personal data collected for a compliance
  reason.
- **No representative and no transfer assessment.** Named above as absent
  rather than implied. Both are the owner's to commission when there is a reason.
- **The export is admin-generated.** A self-service export would be a route
  returning a person's whole record, which is a route worth attacking. At two
  requests a decade the admin path is the smaller surface.

## 7. Task list

- `LEGAL-GLOBAL-001/T1` — The notice carries the additional GDPR statements, in twenty locales
- `LEGAL-GLOBAL-001/T2` — An admin-generated JSON export of everything held about one person
- `LEGAL-GLOBAL-001/T3` — An objection flag that stops read-tracking and deletes the existing rows
- `LEGAL-GLOBAL-001/T4` — The breach runbook uses the 72-hour clock for everyone
- `LEGAL-GLOBAL-001/T5` — A one-page record of processing, and a written statement of what is deliberately not claimed
