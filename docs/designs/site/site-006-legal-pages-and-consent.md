---
code: SITE-006
title: Legal pages and the consent surface
domain: site
prd_refs: [SITE-006, LEGAL-GLOBAL-002, LEGAL-SG-001]
depends_on: [LEGAL-GLOBAL-002, SITE-001]
depended_by: []
layers_touched: [frontend, ui]
cross_cutting_rules: [I18N-R01, I18N-R02, I18N-R04, A11Y-R01, A11Y-R02, A11Y-R03, DATA-R02]
status: in-progress
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
| `/legal/terms` | What using the site and the investor hall means, and the company that operates them | This design |

Twenty locales, through the same parity gate as the rest of the site
(`I18N-002`). A legal page in English on a page reading Thai is the one place a
fallback is least acceptable, because it is the page whose whole job is to be
understood.

**A second catalogue, not more keys in the first.** `assets/i18n.js` is loaded by
the homepage, and these pages' copy is forty-nine keys of legal prose in twenty
languages; carried there, every visitor pays for it on the critical path of a
page nobody opened to read it. `assets/legal-i18n.js` holds it instead and the
legal pages load both — the chrome they share with the footer from the first, so
`Privacy` is translated once for the whole site, and their own copy from the
second. `assets/legal.js` is the swap, rather than `site.js`, which drives a
scene and an investor gate these pages do not have and would title them from the
homepage's headline.

**`legal/terms` publishes last, and the delay is not a schedule.** It waits on
[`TERMS-REVIEW`](../../operator-checklist.md#TERMS-REVIEW), and what holds it is
where its English source lives: [`docs/legal/terms-en.md`](../../legal/terms-en.md)
is written and complete, and `docs/` never reaches `main`, so there is no page for
GitHub Pages to serve and no link pointing at one. The other two do not wait —
they describe what the system does, which this repository knows without asking
anybody.

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

**Shipping it edits `legal/cookies`, and that is a task rather than a habit.**
The banner writes a fifth storage — `localStorage["valotech.consent"]` — into a
browser the cookies page currently tells a reader holds four, and `lc.necessaryBody`
says in twenty languages that everything in that table is the whole of the
category. So `SITE-006/T2` adds the row and rewrites that sentence in the same
commit that ships the banner; a banner that lands without them leaves the page
stating a number the product has just changed.

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
  largest single body of prose written for this site since the gateway shipped,
  and every word of it goes through the same authoring and review as the rest.
  That is the real cost of matching the family, and it is paid once. It is paid
  in a catalogue of its own rather than in the homepage's, which is the one
  decision here that is about weight rather than words.
- **Terms are the page this repository is least qualified to write**, so it is
  the one page that does not publish on its own schedule. What it will say is a
  plain statement of who operates the site, what the investor hall is, and what a
  reader may not do with what they read there; what it will not say is anything
  about governing law or liability, because both are choices rather than
  descriptions and guessing at either is worse than the page being short. The
  English source is written and waiting to be read, and the waiting is recorded
  on the operator checklist rather than in a comment nobody opens.
- **The banner interrupts a page whose job is persuasion.** Argued and accepted
  at `LEGAL-GLOBAL-002` §6. The mitigation is that it is small, answerable in one
  click either way, and never shown again.

## 7. Task list

- `SITE-006/T1` — The privacy and cookies pages in twenty locales, through the parity gate, linked in a footer row of their own
- `SITE-006/T2` — The banner: three categories, `necessary` fixed, three controls of equal weight, no dismissal without an answer
- `SITE-006/T3` — The banner is not first in the tab order, does not trap focus, and carries state without relying on colour
- `SITE-006/T4` — The stored choice read in a `try`/`catch`; an unreadable store means no answer, and nothing non-essential loads
- `SITE-006/T5` — A control on `legal/cookies` that changes the answer, and a footer link that reaches it
- `SITE-006/T6` — The legal pages print in black on white
- `SITE-006/T7` — The terms page, in twenty locales, once counsel has read its English source
