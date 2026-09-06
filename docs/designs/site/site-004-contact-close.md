---
code: SITE-004
title: Contact close
domain: site
prd_refs: [SITE-004, P-01]
depends_on: [SITE-001]
depended_by: []
layers_touched: [frontend, ui]
cross_cutting_rules: [I18N-R01, A11Y-R01, A11Y-R02, P-01]
status: implemented
---

# `SITE-004` — Contact close

## 1. Purpose and PRD refs

How the page ends, and the only thing it asks a reader to do. Realizes
`SITE-004`.

It is the section the navigation once called *Pricing*, and it is not a price
list: its own lede says pricing is part of the design conversation rather than a
published menu. Removing it to satisfy an instruction about pricing would have
removed the page's closing invitation, which is what
`decisions-log.md#SITE-DEC-03` records.

## 2. Layer walkthrough

**Down.** A footer with two columns: the engagement and its call to action on the
reading side, the company and the ecosystem links on the other, a tagline and the
legal line beneath.

**Up.** The call to action is a `mailto:` link, so nothing is submitted anywhere
and no address is collected from a visitor.

## 3. Contracts

- **The offer.** A thirty-minute exploratory conversation, no proposal pressure,
  no sales script. The page says this in the same breath as the button, because a
  call to action that hides what happens next is one people do not press.
- **Why prices are not published.** Every engagement reflects the buyer's
  systems, their regulatory context and which phases suit them now. Said plainly
  rather than implied: a missing price with no explanation reads as evasion.
- **Company.** `VALO TECH PTE. LTD.`, `hello@valotech.org`, Singapore.
- **Ecosystem.** The six product links. These are brand links, not the portfolio
  chapter — that is gated (`SITE-002`).
- **The world stands to the right of it**, which is `SITE-003`'s last station.

## 4. Integration

**`SITE-001`** provides the footer's ground and type. **`SITE-003`** puts the
world on the open side for it. **`MAIL-001`**, when it exists, does not replace
this: a `mailto:` opens the reader's own client and asks nothing of them, and
that stays true whether or not the company can send mail.

## 5. Cross-cutting compliance

- **`I18N-R01`** — every string is a key, including the offer and the fine print.
- **`A11Y-R01`, `A11Y-R02`** — the button is a link with an accessible name that
  says where it goes; the ecosystem links are a list.
- **`P-01`** — a visitor can act on the page without signing in, which is the
  whole of what the close is for.

## 6. Open questions and trade-offs

- **A real form instead of `mailto:`.** It would capture a lead and lose the
  reader with no configured mail client. Not built, and it is not free: a form
  collects personal data and brings `LEGAL-SG-001` with it for a **visitor**, not
  only for an investor, which is a compliance surface this page does not have
  today.

## 7. Task list

- `SITE-004/T1` — The close carries the offer, the call to action, and the reason prices are not published
- `SITE-004/T2` — Company, contact and ecosystem links, with the legal line beneath
