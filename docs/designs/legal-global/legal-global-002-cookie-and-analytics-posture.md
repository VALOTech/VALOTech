---
code: LEGAL-GLOBAL-002
title: Cookie and analytics posture
domain: legal-global
prd_refs: [LEGAL-GLOBAL-002, DATA-R02]
depends_on: [LEGAL-GLOBAL-001]
depended_by: [SITE-006]
layers_touched: [frontend, ui]
cross_cutting_rules: [DATA-R02, I18N-R01, A11Y-R01]
status: design-ready
---

# `LEGAL-GLOBAL-002` — Cookie and analytics posture

## 1. Purpose and PRD refs

What the gateway stores in a visitor's browser, what it measures about them, and
what either obliges. Realizes `LEGAL-GLOBAL-002`.

The posture is **the ecosystem's own**
([`OPS-DEC-01`](../../decisions-log.md#OPS-DEC-01)), read off the sibling
products rather than invented here: every VALO web surface carries
`legal/privacy`, `legal/cookies` and `legal/terms`, and a consent banner with
three categories — `necessary`, fixed on; `analytics`, default off; `marketing`,
default off — whose choice is stored per visitor and can be withdrawn. A person
arriving at valotech.org from any product page meets the same thing.

This design is the posture. `SITE-006` builds the pages and the banner.

## 2. Layer walkthrough

**Down.** One stored choice per visitor. Nothing non-essential loads until it
says so, and the check is at the point of loading rather than at the point of
reporting.

**Up.** The banner on a first visit, the three legal pages, and a control to
change the answer afterwards that is reachable without hunting.

## 3. Contracts

### The three categories

| Category | Default | What it governs | Consent needed |
|---|---|---|---|
| `necessary` | **on, fixed** | The session cookie an investor gets after signing in; the locale preference a visitor sets | No — both are created by the person's own action, and both are exempt in every cookie regime |
| `analytics` | **off** | Anything that counts, measures or attributes a visit | Yes |
| `marketing` | **off** | Anything that follows a visitor between sites | Yes |

`marketing` exists and is expected to stay empty. It is carried because the
siblings carry it and because a category added later reads as a new intention;
carried from the start it reads as what it is, which is a category with nothing
in it.

### What is stored today, and when

| Storage | Set when | Category |
|---|---|---|
| Session cookie | After a successful sign-in | `necessary` |
| Locale preference (`localStorage`) | When a visitor chooses a language | `necessary` |
| Consent choice (`localStorage`) | When the banner is answered | `necessary` — it is the record of the answer, and storing it is what stops the banner asking again |

**Nothing else is set, and nothing at all is set on arrival before the banner is
answered.** A visitor who lands, reads and leaves has had one thing written to
their browser: their answer, if they gave one.

### The stored choice

    localStorage["valotech.consent"] = { analytics: false, marketing: false, v: 1 }

Versioned, because the honest consequence of adding a fourth category later is
that every previously-stored choice no longer covers it. A bump re-asks; it does
not silently extend an old answer to cover something new.

Withdrawal is the same control, reachable from the footer and from
`legal/cookies`, and it takes effect on the next page load rather than requiring
anything to be cleared by hand.

### Loading behind consent

Nothing non-essential is in the page until consent says so — **not present and
disabled, not present and inert: not present.** A script that loads and then
checks a flag has already made the request, and the request is the thing that
was consented to.

Which analytics is loaded when a visitor turns it on is a later choice with no
compliance weight, because the surface that governs it is what is being adopted
now. The safe state until then is that the category exists and nothing sits
behind it.

### The three pages

`legal/privacy`, `legal/cookies`, `legal/terms` — the same set the siblings
carry, in twenty locales, linked from the footer of every page and from the
banner. `SITE-006` builds them; `LEGAL-SG-001` and `LEGAL-GLOBAL-001` supply what
privacy says.

### What the room does is not this

The investor room's per-account read state is disclosed under `LEGAL-SG-001` and
objectable under `LEGAL-GLOBAL-001`. It is application data about a named person
who signed in, not a cookie and not analytics, and conflating the two categories
is how a privacy notice becomes wrong. The banner does not ask about it, because
the banner is about a visitor and this is about a member of the room.

## 4. Integration

**`SITE-006`** builds the pages, the banner and the stored choice.
**`LEGAL-SG-001`** and **`LEGAL-GLOBAL-001`** carry the notice this points at.
**`SEC-001`** owns the cookie flags and would own the policy change if an
analytics script were ever loaded. **`AUTH-002`** sets the one cookie that
exists.

## 5. Cross-cutting compliance

- **`DATA-R02`** — nothing about a visitor is recorded unless they turn it on,
  and what is stored under `necessary` identifies nobody.
- **`I18N-R01`** — the banner and the three pages are in twenty locales like
  the rest of the site.
- **`A11Y-R01`** — the banner is keyboard-operable, does not trap focus, and is
  dismissible by keyboard alone. That is the failure mode of nearly every
  consent banner shipped, and it is a task rather than a hope.

## 6. Open questions and trade-offs

- **A banner with nothing behind it is a real cost.** It interrupts the
  company's own front door to ask about categories that are both empty today,
  and `P-06` says the company's face is not a place to experiment. It is
  accepted because consistency across the family is worth more than the
  interruption: a visitor who sees a different posture on each VALO page learns
  that the posture means nothing.
- **The banner must not be the first thing a screen reader meets.** It is
  announced after the page's own landmark, and the skip link still reaches the
  content first. Getting that wrong makes the site worse for exactly the people
  the accessibility work was for.
- **Marketing is an empty category.** Named above. If it is still empty in a
  year, removing it is a version bump and a re-ask, which is why it is cheaper
  to carry it than to add it later.

## 7. Task list

- `LEGAL-GLOBAL-002/T1` — The three categories, with `necessary` fixed on and both others off until a visitor says otherwise
- `LEGAL-GLOBAL-002/T2` — The notice states the three storages, when each is set, and that nothing else is set on arrival
- `LEGAL-GLOBAL-002/T3` — A test proves a visitor who answers nothing, signs in to nothing and chooses no language leaves with an empty cookie jar and empty storage
- `LEGAL-GLOBAL-002/T4` — Nothing non-essential is present in the page until consent, rather than present and inert
- `LEGAL-GLOBAL-002/T5` — The stored choice is versioned, and a bump re-asks rather than extending an old answer
