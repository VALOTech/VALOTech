---
code: SITE-006
title: Legal pages and the consent surface
domain: site
prd_refs: [SITE-006, LEGAL-GLOBAL-002, LEGAL-SG-001]
depends_on: [LEGAL-GLOBAL-002, SITE-001]
depended_by: []
layers_touched: [frontend, ui]
cross_cutting_rules: [I18N-R01, I18N-R02, I18N-R04, A11Y-R01, A11Y-R02, A11Y-R03, DATA-R02]
status: design-ready
---

# `SITE-006` — Legal pages and the consent surface

## 1. Purpose and PRD refs

Three pages and a banner, matching what every other VALO product puts in front
of a visitor. Realizes `SITE-006` and builds what `LEGAL-GLOBAL-002` decides.

The ecosystem's shape is the specification: `legal/privacy`, `legal/cookies`,
`legal/terms`, and a three-category consent banner with the non-essential
categories off. Nothing here is invented — the value of this feature is that it
is the same as the siblings, so a person who has met one VALO page has met them
all.

## 2. Layer walkthrough

**Down.** Three documents in the twenty-locale dictionary, and one small script
that reads and writes the stored consent. No new storage on the server: a
visitor's answer lives in their own browser and reaches us never.

**Up.** A footer link set on every page, the banner on a first visit, and a
control on `legal/cookies` that changes the answer afterwards.

## 3. Contracts

### The pages

| Route | What it says | Source |
|---|---|---|
| `/legal/privacy` | What is held, why, on what basis, how long, who to write to, and the four rights | `LEGAL-SG-001`, plus `LEGAL-GLOBAL-001`'s additions |
| `/legal/cookies` | The three storages, when each is set, the three categories, and the control to change the answer | `LEGAL-GLOBAL-002` |
| `/legal/terms` | What using the site and the investor room means, and the company that operates them | This design |

Twenty locales, from the same dictionary and through the same parity gate as the
rest of the page (`I18N-002`). A legal page in English on a page reading Thai is
the one place a fallback is least acceptable, because it is the page whose whole
job is to be understood.

**Written to be true rather than complete.** A template listing processing this
product does not do is worse than a page naming five things accurately — the same
rule `LEGAL-SG-001` sets for the notice, applied to all three.

### Where they are linked

The footer, on every page, in a row of their own — not folded into the ecosystem
links, because a person looking for a privacy policy is looking for a specific
thing and scanning for it among product names is how they conclude there is not
one.

The banner links `legal/cookies` and `legal/privacy` directly.

### The banner

Appears when no consent choice is stored. It carries:

- one sentence saying what it is for, and no persuasion;
- the three categories, `necessary` shown checked and disabled, the other two
  unchecked;
- **three controls of equal visual weight** — *accept all*, *reject all*, *save
  my choice*. A reject that is a grey link beside a bright accept is a dark
  pattern, and a company whose page argues for audit-defensible systems cannot
  ship one;
- a link to `legal/cookies`.

It is dismissed by answering. There is no close button that stores nothing,
because a banner that can be dismissed without an answer asks again on every
page and teaches people to click the brightest thing.

### Accessibility, which is where these are usually wrong

- The banner is **not** the first thing in the tab order. The skip link and the
  page's own landmarks come first; the banner is announced as a region with a
  name, after them.
- Focus is **not trapped** in it. It is not a modal — the page beneath is
  readable, and a person who wants to read the privacy page before answering
  can reach it.
- Every control is reachable and operable by keyboard, `Escape` does nothing
  (there is no dismissal without an answer), and the checked state is carried
  by the control's own semantics rather than by colour (`A11Y-R02`).
- Contrast is measured on the ground the banner actually renders on, which is
  the scene (`A11Y-R03`).

### The stored choice

    localStorage["valotech.consent"] = { analytics: false, marketing: false, v: 1 }

Read on load inside a `try`/`catch` — a browser with storage disabled must render
the page, not fail. An unreadable store is treated as *no answer*: the banner
appears and nothing non-essential loads, which is the fail-closed direction.

### Print and reduced motion

The legal pages print in black on white like `RPT-003`'s, because they are the
pages people actually print. The banner never animates in; it is present or it
is not.

## 4. Integration

**`LEGAL-GLOBAL-002`** decides the categories and the defaults. **`SITE-001`**
supplies the type, the ground and the footer this extends. **`I18N-001`** holds
the copy and **`I18N-002`** gates it. **`LEGAL-SG-001`** and
**`LEGAL-GLOBAL-001`** are what `/legal/privacy` says.

## 5. Cross-cutting compliance

- **`I18N-R01`**, **`I18N-R02`** — twenty locales, complete; these pages are the
  last place an English fallback is acceptable.
- **`I18N-R04`** — a missing key never reaches the screen as a raw key.
- **`A11Y-R01`**, **`A11Y-R02`**, **`A11Y-R03`** — the list above is the task
  list, not an aspiration.
- **`DATA-R02`** — the answer never leaves the browser, so there is nothing
  about a visitor to keep out of a log.

## 6. Open questions and trade-offs

- **Three legal pages in twenty locales is a substantial body of copy** — the
  largest single addition to the dictionary since the gateway shipped, and every
  word of it goes through the same authoring and review as the rest. That is the
  real cost of matching the family, and it is paid once.
- **Terms are the page this repository is least qualified to write.** What ships
  is a plain statement of who operates the site, what the investor room is, and
  what a reader may not do with what they read there. Anything beyond that is a
  question for counsel, and it is on the operator checklist rather than guessed
  at here.
- **The banner interrupts a page whose job is persuasion.** Argued and accepted
  at `LEGAL-GLOBAL-002` §6. The mitigation is that it is small, answerable in one
  click either way, and never shown again.

## 7. Task list

- `SITE-006/T1` — Three legal pages in twenty locales, through the parity gate, linked in a footer row of their own
- `SITE-006/T2` — The banner: three categories, `necessary` fixed, three controls of equal weight, no dismissal without an answer
- `SITE-006/T3` — The banner is not first in the tab order, does not trap focus, and carries state without relying on colour
- `SITE-006/T4` — The stored choice read in a `try`/`catch`; an unreadable store means no answer, and nothing non-essential loads
- `SITE-006/T5` — A control on `legal/cookies` that changes the answer, and a footer link that reaches it
- `SITE-006/T6` — The legal pages print in black on white
