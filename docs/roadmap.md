# VALO Tech — roadmap

> **Generated** by `scripts/generate-roadmap.py` from [docs/tasks.md](tasks.md), the design graph under [docs/designs/](designs/) and [docs/roadmap-policy.yaml](roadmap-policy.yaml). Do not edit it: the next regeneration discards the edit, and until then the queue disagrees with the ledger. To change the order, change the dependency or the policy.

> **Not for `main`.** This file lives on `development` only (`.claude/CLAUDE.md` §1.1).

Ordering only. What each task *is* lives in [docs/tasks.md](tasks.md); why the product wants it lives in [docs/PRD.md](PRD.md). Nothing is restated here. A wave is a band of the dependency graph's depth: everything in `W(n)` can be built once `W(n-1)` stands. Within a wave, features are ordered by depth and tasks by state — in-progress first, then open, then blocked. Closed tasks are omitted.

**Active wave: W0 — The ground**

_65 tasks in the plan, 44 closed, 21 outstanding._

---

## W0 — The ground · **ACTIVE**

_What nothing else stands on: the page that already serves, and the data plane the application has not got yet. Until a schema exists and a migration can be applied and rolled back, nothing above can be built or tested — so this wave is finished when a developer brings the stack up with one command and the round trip has actually been run._

_7/17 closed (41%) · 10 outstanding — 10 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **DATA-001** · Schema and migrations — 0/10 closed · depth 0
  - `[ ] DATA-001/T1` — Choose and wire the migration tool; one command applies and one rolls back
  - `[ ] DATA-001/T10` — Every migration has a down-migration that has been run
  - `[ ] DATA-001/T2` — Accounts table: identity, role, state, created and updated
  - `[ ] DATA-001/T3` — Sessions table, or the session store the auth library needs
  - `[ ] DATA-001/T4` — Decks, deck sections and deck versions
  - `[ ] DATA-001/T5` — Deck grants: which account may read which deck
  - `[ ] DATA-001/T6` — Posts, with an audience column
  - `[ ] DATA-001/T7` — Mail log and unsubscribe state
  - `[ ] DATA-001/T8` — Audit table, append-only, with a database-level guard against update and delete
  - `[ ] DATA-001/T9` — Configuration table with a recorded prior value

- **SITE-001** · The gateway page — 7/7 closed
## W1 — The door

_Who may read what, and the cross-cutting layers the page already carries. Everything in the room reads through the gate this wave builds, so a shortcut here is a shortcut in every feature after it. Sign-out precedes invitation deliberately: a session that cannot be ended server-side is a defect that grows with every account created._

_23/34 closed (67%) · 11 outstanding — 10 buildable now · 0 waiting on the owner · 1 external residue · 0 parked to a later wave._

- **A11Y-001** · Accessibility baseline — 5/5 closed
- **AUTH-001** · Sign-in — 0/5 closed · depth 1
  - `[ ] AUTH-001/T1` — Password hashing at the current cost, verified against a known vector
  - `[ ] AUTH-001/T2` — Sign-in route: identical failure for an unknown account and a wrong password
  - `[ ] AUTH-001/T3` — Rate limit per account and per address, with the limit stated in config
  - `[ ] AUTH-001/T4` — The sign-in form, in twenty languages, keyboard-reachable, with an accessible name on every field
  - `[ ] AUTH-001/T5` — Regression test: a wrong password and an unknown account are indistinguishable in status, body and timing

- **I18N-001** · Twenty-locale runtime dictionary — 3/4 closed · depth 1
  - `[!] I18N-001/T4` — Eleven locales read as prose, sentence by sentence, by someone who speaks them  · _external_ · **Blocked by:** pending-external: a native reader for `es`, `pt`, `ru`, `tr`, `id`, `ms`, `tl`, `th`, `ar`, `ja` and `zt`. All eleven pass every mechanical class in…

- **SITE-002** · Public and investor chapter split — 3/4 closed · depth 1
  - `[!] SITE-002/T4` — The split is enforced by the server rather than by CSS  · _in-graph_ · **Blocked by:** AUTH-002/T1

- **SITE-003** · Chapter sequence — 2/2 closed
- **SITE-004** · The contact close — 2/2 closed
- **AUTH-002** · Session and role gate — 0/4 closed · depth 2
  - `[ ] AUTH-002/T1` — Session cookie: httpOnly, SameSite=Lax, Secure, rotated on sign-in
  - `[ ] AUTH-002/T2` — Server-side invalidation, so a stolen cookie dies on sign-out
  - `[ ] AUTH-002/T3` — Role gate at the query, not the template; a helper that cannot be forgotten
  - `[ ] AUTH-002/T4` — Isolation test: an investor request for another investor's deck returns nothing, not a redirect

- **I18N-002** · Served-copy parity gate — 2/2 closed
- **SCENE-001** · The world and its journey — 6/6 closed
## W2 — The room

_What a signed-in investor finds, and the scene that carries the public page. Updates come before the deck, and not only because they are the simpler shape of the same problem — they are what the room is for. An investor signs in to find out what has happened since they last looked, and a room that opens on a deck they read a month ago has answered a question nobody asked._

_14/14 closed (100%) · 0 outstanding — 0 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **SCENE-002** · Satellites and their rings — 2/2 closed
- **SCENE-003** · The sky — 3/3 closed
- **SCENE-005** · Orbit stages — 4/4 closed
- **SCENE-006** · The mapping stage — 2/2 closed
- **SCENE-004** · Annotation chips — 3/3 closed
## W3 — The desk

_How the content gets there. Every word on the public page and in the room is authored, translated, reviewed and published by somebody, and until that is a surface it is a deployment. This wave is what turns the site from something the developer edits into something the company runs._

_(nothing in the ledger sits in this wave)_

## W4 — The outside

_What leaves the system and cannot be recalled — mail to a real investor — and the controls an operator needs before it does. Built last among the buildable, behind everything that can be tested without sending anything to a real person._

_(nothing in the ledger sits in this wave)_

## W5 — The move

_The security baseline, the logs, erasure, a restore that has actually been performed, and the compliance posture — each of them easy to promise before launch and expensive to add after. It ends at the one task that ends the static site's tenure, and after which a defect has an audience._

_(nothing in the ledger sits in this wave)_

## In the ledger with no design

_These carry tasks and resolve to no design, so they have no wave and no order. Either the design is missing or the section is. `scripts/validate-roadmap.py` fails on this._

- **AUTH-003** · Invitation and password reset — 3 task(s)
- **AUTH-004** · Sign-out — 1 task(s)
- **ADMIN-001** · Account management — 4 task(s)
- **ADMIN-002** · Admin console shell — 1 task(s)
- **INV-001** · Investor room shell — 1 task(s)
- **INV-002** · Gated gateway chapters, served — 2 task(s)
- **INV-003** · Portfolio progress — 3 task(s)
- **DECK-001** · Deck authoring — 2 task(s)
- **DECK-002** · Deck versioning and publishing — 2 task(s)
- **DECK-003** · Deck reading — 1 task(s)
- **DECK-004** · Deck access grants — 1 task(s)
- **POST-001** · Update authoring — 2 task(s)
- **POST-002** · Update publishing and audience — 3 task(s)
- **MAIL-001** · Investor mail — 1 task(s)
- **MAIL-002** · Mail log and unsubscribe — 2 task(s)
- **CFG-001** · Runtime configuration — 1 task(s)
- **SEC-001** · Security baseline — 3 task(s)
- **SEC-002** · Audit log — 2 task(s)
- **OPS-001** · Hosting and deploy — 1 task(s)
- **OPS-002** · Logging and monitoring — 2 task(s)
- **INFRA-001** · Local development stack — 2 task(s)
- **CRED-001** · Credential handling — 1 task(s)
- **LEGAL-SG-001** · PDPA posture — 3 task(s)
- **LEGAL-GLOBAL-001** · GDPR posture for EU investors — 1 task(s)
- **LEGAL-GLOBAL-002** · Cookie and analytics posture — 1 task(s)
