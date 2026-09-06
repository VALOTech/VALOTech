---
code: LEGAL-GLOBAL-002
title: Cookie and analytics posture
domain: legal-global
prd_refs: [LEGAL-GLOBAL-002, DATA-R02]
depends_on: [LEGAL-GLOBAL-001]
depended_by: []
layers_touched: [frontend, ui]
cross_cutting_rules: [DATA-R02, I18N-R01, A11Y-R01]
status: pending-decision
decision_required: Whether the site measures anything about visitors
decision_owner: user
---

# `LEGAL-GLOBAL-002` — Cookie and analytics posture

## 1. Purpose and PRD refs

What the gateway stores in a visitor's browser, what it measures about them, and
what either obliges. Realizes `LEGAL-GLOBAL-002`.

Blocked on [`OPS-DEC-01`](../../decisions-log.md#OPS-DEC-01), and the dependency
runs in the direction people usually get backwards: **the obligation follows the
answer, not the other way round.** A site that measures nothing needs no banner,
no cookie policy, no consent record and no retention window. The safe default
ships exactly that, and it is a complete posture rather than a placeholder.

## 2. Layer walkthrough

**Down.** Under the default, one cookie exists in the entire product and it is
the session cookie an investor gets after signing in. Nothing is set for a
visitor.

**Up.** No banner. A short section in the privacy notice saying what is stored
and when.

## 3. Contracts

### What is stored today, and when

| Storage | Set when | Purpose | Consent needed |
|---|---|---|---|
| Session cookie | After a successful sign-in | To keep the person signed in | No — strictly necessary for a service they asked for |
| `localStorage` locale preference | When a visitor chooses a language | To remember it | No — strictly necessary for a preference they set |

Both are in the "strictly necessary" class every cookie regime exempts, and both
are exempt because the visitor's own action created them. **Nothing is set on
arrival.** A visitor who lands and leaves has had nothing written to their
browser, which is what makes the absence of a banner correct rather than merely
convenient.

### Why there is no banner

A consent banner is required when non-essential storage or tracking happens. None
does. Adding a banner "to be safe" would put an interruption in front of the
company's own front door and would imply tracking that is not occurring —
misleading in the direction people do not expect a compliance control to mislead.

The privacy notice says what is stored, which is the disclosure obligation that
does apply.

### If the answer changes

`OPS-DEC-01` option **B** — cookieless server-side counts of page views and
languages — would still need no banner in most readings, and would need: a
paragraph in the notice, a stated retention (30 days), and no identifier that
could single a visitor out. That last one is the whole distinction, and it is why
the design would be **counts written server-side**, never a script in the page.

Option **C** — a conventional analytics product — needs a banner that blocks
until answered, a record of the consent, a way to withdraw it, and a cookie
policy page. It also means the gateway loads a third-party script, which is a
`Content-Security-Policy` change (`SEC-001`) and a supply-chain dependency on
somebody else's code running on the company's front page.

Each of those is a real cost and none of them is paid under the default.

### The room

The investor room is behind a sign-in and its per-account read state is disclosed
under `LEGAL-SG-001` and objectable under `LEGAL-GLOBAL-001`. It is not analytics
and it is not in a cookie; it is application data about a named person, and
conflating the two categories is how a privacy notice becomes wrong.

## 4. Integration

**`LEGAL-SG-001`** and **`LEGAL-GLOBAL-001`** carry the notice this adds a
section to. **`SEC-001`** owns the cookie flags and the policy that would have to
change under option C. **`AUTH-002`** sets the one cookie that exists.

## 5. Cross-cutting compliance

- **`DATA-R02`** — under the default nothing about a visitor is recorded at all,
  which is the strongest form of the rule.
- **`I18N-R01`** — the notice section is translated with the rest.
- **`A11Y-R01`** — if a banner is ever built it is keyboard-operable and does
  not trap focus, which is the failure mode of nearly every one shipped.

## 6. Open questions and trade-offs

- **The decision is open** and the default is complete. That is the point of the
  entry: nothing is blocked, and what ships while it waits is a coherent posture
  rather than a stub.
- **Measuring nothing means never knowing which languages are read.** Twenty
  locales are maintained without evidence about whether anyone reads the Urdu
  one. That is a real cost of the default and the honest reason to consider
  option B.
- **A server-side count is not free of obligation.** Even without a cookie, a
  log of requests is personal data if it carries an address. Option B's design
  would have to count without storing one, which is a constraint rather than a
  detail.

## 7. Task list

- `LEGAL-GLOBAL-002/T1` — Whether the site measures anything about visitors, and what that obliges
- `LEGAL-GLOBAL-002/T2` — The notice states the two storages, when each is set, and that nothing is set on arrival
- `LEGAL-GLOBAL-002/T3` — A test proves a visitor who does not sign in and does not choose a language leaves with an empty cookie jar and empty storage
