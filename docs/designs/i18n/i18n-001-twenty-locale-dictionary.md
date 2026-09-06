---
code: I18N-001
title: Twenty-locale runtime dictionary
domain: i18n
prd_refs: [I18N-001, I18N-R01, I18N-R02, I18N-R04, I18N-R05, P-05]
depends_on: [SITE-001]
depended_by: [I18N-002]
layers_touched: [frontend, ui]
cross_cutting_rules: [I18N-R01, I18N-R02, I18N-R04, I18N-R05, P-05]
status: implemented
---

# `I18N-001` — Twenty-locale runtime dictionary

## 1. Purpose and PRD refs

Every visitor-facing string of the gateway, in twenty languages, swapped without
a reload and without a build step. Realizes `I18N-001` and carries `I18N-R01`,
`R02`, `R04`, `R05` and `P-05`.

## 2. Layer walkthrough

**Down.** `assets/i18n.js` holds twenty dictionaries of 303 keys. The **served
markup carries the English text**, generated from the dictionary by
`scripts/sync-static-copy.mjs`, so a reader without JavaScript gets the whole
page rather than empty headings. On load, `site.js` swaps every `data-i18n` node
for the reader's locale.

**Up.** The chosen locale is remembered per browser and reported nowhere.

## 3. Contracts

### The set

`en, vi, zh, zt, th, id, ms, tl, hi, es, ar, fr, bn, pt, ru, ur, de, ja, tr, ko`
— twenty, complete in every one. `zt` is Traditional Chinese and is not a copy of
`zh`. Right-to-left for `ar` and `ur`.

Detection: a remembered preference, then the device locale, then English. A
missing key falls back to English; **a raw key never reaches the screen**
(`I18N-R04`).

### Every locale is authored, not machine output

Each is held to the way its own language reads rather than to the shape of the
English. Three rules carry most of that.

- **The register is the market's.** Every locale addresses a company, formally
  and consistently: usted, vous, Sie, です／ます, Anda, आप, คุณ. Korean addresses
  the reader as 귀사 and drops the pronoun wherever the language naturally would,
  because a literal second person reads there as a translation rather than as
  address.
- **A technical noun is written in the locale's own script.** The keep-list is
  **nineteen tokens and no more**: the brands, the acronyms (PoC, CRM, ERP, BI,
  QA, SaaS), the legal entity, `markdown`, and the three glossary terms every
  locale leaves in English. Where a native word carries the sense it is used —
  رازداری, تعمیل, ماخذ — and where the loan is the standard professional term it
  is transliterated — ڈیٹا, डेटा, ডেটা. **Latin words inside a right-to-left page
  are the worst case:** they turn one sentence into a dozen direction switches.
- **Typography follows the locale** (`I18N-R05`). French takes a no-break space
  before `: ; ! ?`; Japanese and Chinese take full-width punctuation; Arabic
  takes ، and Urdu takes ۔.

### Type per script

Roboto Condensed and DM Mono cover Latin, Latin-ext, Cyrillic and Vietnamese.
Thai, Arabic, the Indic scripts, Korean and CJK fall back to a per-script stack:
a condensed display face that does not cover a script is worse than a system face
that does.

### Mirroring

Under `ar` and `ur` the whole composition mirrors — the argument pins to the
right, and `SCENE-001`'s stations and the star's bearing reflect about the
vertical axis. The scene still paints in physical coordinates; only where it
*stands* follows the page.

## 4. Integration

**`SITE-001`** provides the markup every key lands in. **`I18N-002`** is the gate
that keeps the served English and the dictionary from drifting. **`SCENE-004`**
draws its chips from keys the dictionary already carried.

## 5. Cross-cutting compliance

- **`I18N-R01`** — no hard-coded visitor-facing string.
- **`I18N-R02`** — twenty locales, complete; English authored, the rest authored
  translations.
- **`I18N-R04`** — English fallback; no raw key.
- **`I18N-R05`** — per-locale typography.
- **`P-05`** — a string that exists in English and nowhere else is unfinished.

## 6. Open questions and trade-offs

- **Eleven locales have never been read as prose by a native speaker.** All
  sixteen non-`en`/`vi`/`zh`/`zt` locales passed seven mechanical classes and five
  were read line by line, fixing `ko`, `ur`, `hi`, `bn`, `fr` and `de`. The
  remaining eleven passed every check a machine can make. **A mechanical pass
  cannot see a sentence that is correct and lifeless**, which is why this is filed
  at `REVIEW/T1` rather than called done.
- **A build-time i18n instead of a runtime one.** It would remove the swap and the
  parity gate. Rejected while the site is static: the whole point of no build step
  is that the repository is the artifact.

## 7. Task list

- `I18N-001/T1` — 303 keys complete in twenty locales, swapped without a reload
- `I18N-001/T2` — The served copy and the dictionary cannot drift past a push
- `I18N-001/T3` — Sixteen non-`en`/`vi`/`zh`/`zt` locales reviewed on seven mechanical classes; six corrected
