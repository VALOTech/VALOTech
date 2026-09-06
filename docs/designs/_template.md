---
code: DOMAIN-000
title: One line, in the words the PRD uses
domain: domain
prd_refs: []
depends_on: []
depended_by: []
layers_touched: []
cross_cutting_rules: []
status: draft
---

# `DOMAIN-000` — Title

> Seven sections, in this order. They describe **behaviour**, not code: a design
> that pastes TypeScript is a worse version of the file it is describing, and it
> goes stale the first time that file changes.

## 1. Purpose and PRD refs

One paragraph. What this feature is for, whom it serves, and which PRD codes it
realizes. If it cannot be said in a paragraph, it is more than one feature.

## 2. Layer walkthrough

Down the layers the feature touches, then back up: what the reader does, what
the surface sends, what the service decides, what the database holds — and then
the same path in reverse, from the row to the pixel. The reverse pass is where a
missing field is usually found.

## 3. Contracts

Exact names, because these are what another feature builds against:

- **Routes** — method, path, request shape, response shape, status codes.
- **Schema** — tables, columns, types, indexes, constraints.
- **Environment** — every variable, with its default or its absence.
- **Mail** — template name, subject, and what it is a response to.

## 4. Integration

Expand `depends_on` and `depended_by` with the mechanism, not the name: what
this feature calls, what calls it, and what breaks on each side if this changes.

## 5. Cross-cutting compliance

A checklist citing the rules this inherits — it does not copy their text.
Security, personal data, language, accessibility. For each: how this feature
satisfies it, in one line.

## 6. Open questions and trade-offs

Honest. A question that is genuinely the owner's is filed in
[decisions-log.md](../decisions-log.md) and linked from here rather than
answered here; when the register settles it, this bullet reads `decided` and
links the entry in the same commit.

## 7. Task list

`DOMAIN-000/T1`, `T2`, … one line each, copied verbatim into
[tasks.md](../tasks.md). A task is a thing that can be finished and evidenced,
not a phase.
