---
code: I18N-002
title: Served-copy parity gate
domain: i18n
prd_refs: [I18N-002, I18N-R03]
depends_on: [I18N-001]
depended_by: []
layers_touched: [infra, ui]
cross_cutting_rules: [I18N-R03, P-05]
status: implemented
---

# `I18N-002` — Served-copy parity gate

## 1. Purpose and PRD refs

The check that stops the served English and the dictionary from drifting apart.
Realizes `I18N-002` and is `I18N-R03`.

The gateway ships the English text **inside** the markup so the page reads
without JavaScript, and the same text again in the dictionary so it can be
swapped. Two copies of one sentence is a drift waiting to happen, and pushing
publishes: without this gate the drift ships.

## 2. Layer walkthrough

**Down.** `scripts/sync-static-copy.mjs` reads `assets/i18n.js` and
`index.html`, and either writes the English into every `data-i18n` node
(`--write`) or compares them and fails (`--check`).

**Up.** It reports a count, and the count is the point — see below.

## 3. Contracts

    node scripts/sync-static-copy.mjs --check     # fails on drift
    node scripts/sync-static-copy.mjs --write     # regenerates the served English

It fails on three things:

1. **Markup and dictionary disagree** — a `data-i18n` node whose text is not what
   the English dictionary says.
2. **Locale parity is lost** — a key present in one dictionary and missing from
   another.
3. **The localized-node count has moved** — `EXPECTED_NODES` is a constant, and a
   change to the markup must **bump it deliberately**.

The third is the one worth explaining. A gate that counts what it finds and
compares it to what it found is a gate that always passes; a gate that compares
it to a number a person wrote down notices a node that lost its `data-i18n`
attribute, which is exactly how a string stops being translated without anything
else changing. The cost is that adding a localized node fails the build once, on
purpose.

It runs in the **pre-push hook** and in CI. Pushing is what publishes, so the
hook is where it belongs; CI is what catches a push that bypassed the hook.

## 4. Integration

**`I18N-001`** is what it checks. `.githooks/pre-push` and
`.github/workflows/ci.yml` are what run it. It is the only gate that runs on
`main` as well as `development`, because `main` is the branch that carries the
markup it checks.

## 5. Cross-cutting compliance

- **`I18N-R03`** — the gate itself.
- **`P-05`** — a locale falling out of parity is a locale that would ship
  incomplete, and this is what stops it.

## 6. Open questions and trade-offs

- **Generating the markup at build time instead.** That removes the second copy
  and the whole class of drift — and it removes the no-build-step property that
  makes this repository its own artifact. The trade is settled while the site is
  static and reopens with `INFRA-DEC-01`'s application, where a build exists
  anyway.

## 7. Task list

- `I18N-002/T1` — The check fails on markup drift, on locale parity loss, and on a moved node count
- `I18N-002/T2` — It runs in the pre-push hook and in CI
