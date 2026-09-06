# CLAUDE.md — VALO Tech Development Guide

> **Project:** VALO Tech — the company gateway at valotech.org, and the investor portal behind its sign-in
> **Stack:** Next.js 16+ (App Router, TypeScript) · PostgreSQL · Auth.js · SMTP · three.js 0.166 (vendored) · Docker
> **Team:** 1 dev + 1 BA, Singapore · Solo-maintained · part of the VALO product family
> **Sources of truth:** `docs/PRD.md` (business + feature catalogue) · `docs/designs/` (per-feature designs) · `docs/tasks.md` (tasks with evidence) · running code (behaviour)
>
> **Ecosystem.** VALO Tech is the corporate gateway of **VALO TECH PTE. LTD.** (Singapore), which builds six products: VALO Ads, VALO Pocket, Shimmra, Amavo, Farola, and the B2B GRC backbone Verdiq. This repository is not one of those products; it is the company's own front door and its investor room. It follows the ecosystem's conventions because a reader moving between repositories should not have to relearn them, not because the products' domain rules apply here.

**No phases.** Work is a **matrix of layers (vertical) × features (horizontal)**. Every feature carries a domain code (`AUTH-001`, `DECK-002`). A change is complete only when it is coherent on both axes.

**Three things are load-bearing here and override convenience.** **The published branch is the public internet** — see §1.1. **Investor identity is personal data** under Singapore's PDPA and, for EU investors, the GDPR: names, e-mail addresses, and the fact that a named person is reading a fundraise. And **the gateway is the company's face** — a defect on it is seen by everyone the company is trying to persuade.

---

## 1. Absolute rules (non-negotiable)

### 1.1 The published branch is the public internet

`main` is what GitHub Pages serves at valotech.org. **Everything committed to it is readable by anyone**, including paths nothing links to and paths that look private -- Pages serves dot-directories, and `valotech.org/.claude/settings.json` returned 200 until the branch was narrowed. `robots.txt` disallows `/docs/`, and that is a request to well-behaved crawlers, not access control.

Therefore `docs/PRD.md`, `docs/tasks.md`, `docs/roadmap.md`, `docs/decisions-log.md`, `credentials/`, runbooks, and anything else describing the business **must never land on `main`**. They live on `development`.

Until the app replaces the static site, `main` carries exactly the site and nothing else: `index.html`, `404.html`, `assets/`, `robots.txt`, `sitemap.xml`, `CNAME`, `.nojekyll`, the git and editor configuration, and the two files that exist to be read by strangers -- `README.md` and `SECURITY.md`, which is the address a vulnerability report is sent to.

### 1.2 Git safety — destructive commands are FORBIDDEN

Never run any of these without explicit user approval **in the current turn**. Claude can read any file from the filesystem; there is never a need to use git to "restore" state.

| Forbidden | What it destroys |
|---|---|
| `git checkout <file>` · `git restore --worktree` · `git reset --hard` · `git clean -f` | Uncommitted work |
| `git checkout <branch>` · `git switch` · `git worktree add/remove` | The working tree, when a parallel session flips it. **Branch switching is user-only.** |
| `git branch -D/-d/-m/-f` | Local commits; a branch pointer moved to an arbitrary commit |
| `git commit --amend` · `git rebase` · `git cherry-pick` · `git filter-branch` | History. Always make a NEW commit. |
| `git push --force` (any form) · `git push --delete` · `git push --mirror/--all` | Remote history |
| `git push` to `staging` or `production` | Promotion is the owner's (§11.2) |
| `git stash push/pop/drop/clear` | Hidden work |
| `git update-ref -d` · `git reflog expire` · `git gc --prune=now` | Refs and the recovery trail |
| `git config --global/--system` | Auth, hooks, line endings — persists beyond the session |
| `git add -A` / `git add .` | Commits `.env` and secrets by accident |
| `rm -rf .git/` | The repository |

**Committing to a branch that is not checked out** is legitimate, and is the only way this side lands work on `development` while the tree sits on `main`: build the tree in a private index (`GIT_INDEX_FILE`), `git commit-tree`, then `git push origin <sha>:development`. It touches no local ref and leaves the working tree clean. It is not a substitute for having the branch checked out when code has to be run.

### 1.3 Zero fake code

Every line compiles and does what its name promises. Pseudocode, log-only stubs, placeholder returns, 501s for in-scope features, a discarded error on an auth, mail or audit path — forbidden. Two forms of incomplete code are allowed:

    // Deferred: <feature-code> — <concrete future work>. Until then, <safe default> — correct, not a stub.
    // PENDING-CREDENTIAL: <name>. User sets <ENV_VAR>. Task tracked in tasks.md under CRED-*.

### 1.4 English in code, the owner's language in chat

Code, comments, commits, logs, tests and documents are English. Chat replies match the owner's language. The exception is the locale catalogues, which are the product.

### 1.5 Verify before claiming

Never assert an API, a field, a path or a statute section from memory. Grep or read first. **A claim about the running site is verified in a browser against the running site** — see §10.

### 1.6 No external AI or LLM APIs in the product

The gateway and the portal call no model provider. If a feature seems to need one, that is a decision for the register (§1.12), not an implementation detail.

### 1.7 Absolute honesty

**The owner's trust is finite. One fabrication erases ten honest reports.**

- **Evidence, not adjectives.** "It works" needs a command, a test name, or a measurement.
- **Worst problem first**, never buried under a positive summary.
- **"I don't know" when you don't**, with what it would take to find out.
- **A ratio hides the moment it represents.** "One sample in thirty-two" is not a dismissal — look at the sample.
- **A measurement that disagrees with the screen is wrong until explained.** Four classes have already cost this repository real time: a dev server with no cache headers, a browser cache, a probe that settles too briefly after a programmatic jump, and a formula recalled instead of read.

Report in this shape:

    STATUS: green | yellow | red
    WHAT CHANGED: <1-3 concrete artifacts>
    WHAT WORKS: <verified by: command / test / measurement>
    WHAT IS PARTIAL: <exact stopping point>
    WHAT IS BROKEN: <symptom + hypothesis + next step>
    WHAT WAS SKIPPED: <item + reason — never omit this line>
    NEXT: <smallest next action>

Empty fields read `— none —`.

### 1.8 No lazy deferral

A deferral names the concrete blocker, the mechanical signal that it has cleared, and the next action. "It would take too long" and "context budget" are not blockers.

    Deferred: <what>
    Why:      <credential | vendor | legal | threshold | a <CODE>/T<N> | a <DOMAIN>-DEC-NN>
    Unblocks when: <that named code, or one of the four external classes>
    Next action:   <the smallest next step, an hour or less once unblocked>

### 1.9 Original-voice documentation

Every document reads as if written correctly the first time. No "previously X, now Y", no "fix for finding N", no addendum explaining away the prior version. When a document changes, rewrite the affected paragraph whole. How it got here belongs in `git log`.

### 1.10 No over-engineering, and no under-building either

Every line serves a real caller. This repository is small — two roles, roughly six tables — and the ecosystem's larger repositories are a shape to follow, not a volume to match: copying a hundred and seventy gate scripts here would be ceremony. Clarity, fail-closed defaults, edge cases and tests that pin committed behaviour are never over-engineering.

### 1.11 Decision hand-off

When a choice is genuinely the owner's — taste, brand, business, an irreversible or outward-facing action, or a §14 "Ask first" item — research first, then hand it back: state what you found and where, lay out real options with honest trade-offs, recommend exactly one and mark it, and ask in the owner's language. Prefer the AskUserQuestion tool so the choice is one action.

The loop may settle a choice itself only when the answer is **forced** by one of four sources: **doctrine** already written here or in the PRD; **measurement** proving an option impossible or its premise false; **reversal cost**, where the undo is named, has been executed at least once, and expires on an event rather than a date; or **dominance** on axes named before the options were compared. Self-reported confidence is not a source. Read the rule being cited at the moment of use, never a memory of it.

**Reserved — never settled by the loop:** anything irrecoverable that leaves the system, a message sent to a real investor, adding or removing a feature the PRD states, creating an external legal obligation, or narrowing a control adopted to discharge one.

### 1.12 Decision register

`docs/decisions-log.md` is the single home for every such choice. It carries `## Open decisions` then `## Resolved decisions`, both always present. Each entry carries a stable anchor built from its own code; every other artifact links to the entry by its anchor and restates nothing. A decision discovered mid-build is filed in the commit that discovers it. Nothing blocks on an open decision: each ships a fail-closed safe default named on its `Status:` line. A choice the loop settled adds `Settled by: loop`, `Forcing source:` and `Overturned by:` — a warrant carries what was observed, not that observing happened.

---

## 2. Layer × feature

Seven layers, carrying the tokens used in design frontmatter:

    7  ui         design system, a11y, responsive, i18n rendering
    6  frontend   Next.js routes, components, client state
    5  api        route handlers, middleware, validation
    4  service    business logic, mail, sessions, jobs
    3  domain     models, repositories, access rules
    2  data       PostgreSQL schema, migrations, retention
    1  infra      Docker, deploy, DNS and CDN, secrets
    0  scene      the WebGL and canvas layer — designed under docs/designs/scene/

`scene` is a layer of its own because it is the one part of the product with no server, no data and no roles, and it is where most of this repository's hard-won knowledge lives.

**Vertical completeness:** a feature updates every layer it touches, coherently. **Horizontal completeness:** `depends_on` and `depended_by` in design frontmatter, and the neighbours keep working.

**Same value, vocabulary, shape and story everywhere.** A number in the PRD is the number in the code and in the test.

---

## 3. Artifact conventions

### 3.1 Coding scheme

| Form | Meaning | Example |
|---|---|---|
| `<DOMAIN>-<NNN>` | Feature or design file | `AUTH-001`, `DECK-002` |
| `<DOMAIN>-R<NN>` | Invariant or rule | `SEC-R01`, `I18N-R02` |
| `<CODE>/T<N>` | Implementation task | `AUTH-001/T3` |
| `<DOMAIN>-DEC-NN` | Decision register entry | `INFRA-DEC-01` |

**One code, one thing, for the life of the repository.** Deleted codes leave holes, and a hole is never refilled. A code is allocated from `origin/development`, never from a local copy, and the claim is pushed rather than held.

### 3.2 Domains

| Category | Domains |
|---|---|
| Surface | `SITE, SCENE, I18N, A11Y, UX` |
| Access | `AUTH, ADMIN` |
| Investor room | `INV, DECK, POST, MAIL` |
| Platform | `DATA, SEC, OPS, INFRA, CRED, CFG` |
| Compliance | `LEGAL-SG, LEGAL-GLOBAL` |

Adding a domain means updating this table and the PRD Feature Catalogue.

### 3.3 Document tree

    docs/
    ├── PRD.md                 SSOT: business + Feature Catalogue          development only
    ├── tasks.md               tasks with Evidence                          development only
    ├── roadmap.md             execution order                              development only
    ├── decisions-log.md       the decision register                        development only
    ├── operator-checklist.md  human-required actions still pending         development only
    ├── designs/<domain>/<code>-<slug>.md                                   development only
    └── compliance/<region>/*.md                                            development only

### 3.4 Design frontmatter (CI-validated)

    ---
    code: AUTH-001
    title: Investor and admin sign-in
    domain: AUTH
    prd_refs: [AUTH-001, SEC-R01]
    depends_on: [DATA-001]
    depended_by: [INV-001, DECK-001]
    layers_touched: [data, domain, service, api, frontend, ui]
    cross_cutting_rules: [SEC-R01, I18N-R01, A11Y-R02]
    status: draft | under-review | design-ready | implemented | deprecated | pending-external | pending-decision
    external_blocker: { kind: credential|vendor|legal|threshold, ref: <anchor>, unblocks_when: <signal> }
    decision_required: <one line — the entry is decisions-log.md#CODE>
    decision_owner: user | BA | legal
    ---

`status: deferred` is not allowed; re-class it as `pending-external`, `pending-decision`, `design-ready` or `deprecated`.

### 3.5 Design template — seven sections, logic not code

Purpose and PRD refs · Layer walkthrough · Contracts (routes, schema, environment variables, mail templates) · Integration · Cross-cutting compliance · Open questions · Task list. Designs describe behaviour; they do not paste TypeScript.

### 3.6 Task format

    ## AUTH-001 · Investor and admin sign-in
    Design: docs/designs/auth/auth-001-sign-in.md · PRD: AUTH-001, SEC-R01

    - [ ] AUTH-001/T1 — Schema and migration
      Evidence: <commit sha | test name | path:Symbol>
    - [~] AUTH-001/T2 — Session cookie
      Note: rotation wired; step-up not started
    - [!] AUTH-001/T3 — Role gate
      Blocked by: DATA-001/T2
    - [x] AUTH-001/T4 — Sign-in route
      Evidence: apps/web/src/app/api/auth/route.test.ts:signsInAnInvestor

`[ ]` open · `[~]` in progress, needs `Note:` · `[!]` blocked, needs `Blocked by:` · `[x]` closed, needs `Evidence:`. Prefer `path:Symbol` over line numbers, which move.

---

## 4. Workflow

Nine steps for anything non-trivial; steps 6 to 9 for a typo or a single config value.

1. **Context discovery** — the PRD section, the design in full, its `depends_on` contracts, a grep of the code, the state in `docs/tasks.md`.
2. **Impact assessment** — vertical and horizontal blast radius; risk to investor privacy, to the live site, to the sign-in.
3. **Proposal and self-critique** — approach A plus one alternative, then seven lenses: simplicity · failure modes (Postgres down, SMTP refuses, session store empty) · scale · security · privacy · data integrity · missing elements (i18n keys, a11y, audit, migration rollback).
4. **Documentation update** — PRD, design, tasks, `env.example` and `docker-compose.yml`, in the same commit.
5. **Multi-role critique** — visitor · investor · admin · developer · QA · operator.
6. **Implementation** — one task at a time; `Evidence:` before `[x]`; never more than one completed uncommitted step.
7. **Language verification** — §8.4.
8. **Testing** — §10.
9. **Axis review** — §5.

**Bug fix, eight steps:** reproduce deterministically · capture the evidence into the commit message, never into a code comment · root cause rather than symptom · blast radius · a regression test that fails before the fix and passes after · fix without scope creep · a post-mortem for anything the owner saw · axis review.

---

## 5. Axis Review

A change is done only when every axis passes.

**X — Coherence.** PRD code, design, task with Evidence, code and test tell one story. No orphan code, no orphan document, and a value that appears twice is the same value.

**Y — Layer quality.** Every layer the feature touches updates coherently. A column with no model field is invisible data; a handler whose shape differs from its client type is a broken page; a scheduled job never started in the composition root is a feature that silently does not run.

**Z — Technical standards.** Explicit error handling with no silent swallow · structured logs carrying a request id · no personal data in logs · parameterised queries · sessions httpOnly, SameSite=Lax, rotated on privilege change · a Content-Security-Policy without `unsafe-inline` in the app · first contentful paint under 2.5s on the gateway · the scene at 60fps on integrated graphics.

**C — Legal.** Singapore's PDPA governs investor personal data: consent for the purpose it was collected for, access and correction on request, breach notification, a named data-protection officer. The GDPR applies where an investor is in the EU. Any analytics carries its own consent posture. The question to ask is: *if a regulator read this feature tomorrow, what would they find?*

**U — Experience.** Seven lenses, one sentence each: workflow · discoverability · forgiveness · error voice · empty, loading and error states · consent and control · honest incentives.

**R — Reversibility.** Every migration ships a tested down-migration. A risky feature mounts behind a flag defaulting off. The static site is the fallback until the app has replaced it, and that fallback stays one revert away. **A change that reaches the live site through the CDN is neither instant nor instantly undone:** `index.html` is cached ten minutes at the edge and `assets/*` four hours.

---

## 6. Implementation rules

**R1** Read before write. **R2** Follow existing patterns — grep two or three neighbours first. **R3** Centralise configuration; no inline magic numbers, URLs or thresholds. **R4** Types on every signature. **R5** Structured logging, never a bare console call. **R6** Explicit errors, never swallowed. **R7** One module, one responsibility, no circular imports. **R8** No scope creep. **R9** Extract shared logic once there are two callers, not before. **R10** Write for the next reader: clear names, small functions, flat structure.

**Comments** explain a WHY that is not obvious: a hidden invariant, a non-obvious algorithm choice, a security rationale, an external specification with its version. Never restate the identifier, name callers, cross-reference internal documents, tell history, or leave a bare marker.

---

## 7. Project profile

### 7.1 Where things are

| Area | Path |
|---|---|
| The live static site | `index.html`, `404.html`, `assets/` — served from `main` |
| The scene | `assets/scene/` — `boot.js` (placement and journey), `planet.js` (WebGL), `stars.js` (sky and meteors) |
| Page behaviour | `assets/site.js` — chips, orbit stages, mapping stage, language, the investor gate |
| Styles | `assets/site.css` |
| Runtime i18n | `assets/i18n.js` — 20 locales × 303 keys |
| The gate on the served copy | `scripts/sync-static-copy.mjs --check` |
| The scene's designs | `docs/designs/scene/` — read these before touching the scene |
| The app, from `development` | `apps/web/` |
| Migrations | `apps/web/migrations/` |
| Documents | `docs/` |

### 7.2 Environments

All configuration through environment variables; a missing required key fails startup rather than defaulting silently. Development uses the same PostgreSQL major version as production. Never use production investor data in development.

### 7.3 Vocabulary

| Term | Meaning |
|---|---|
| `visitor` | Anyone reading the public gateway. Not authenticated, not identified. |
| `investor` | A person granted access to the investor room. **Their identity is personal data.** |
| `admin` | Staff who manage accounts, posts, decks, mail and configuration. The only other role. |
| `gateway` | The public page at valotech.org |
| `investor room` | Everything behind the sign-in |
| `deck` | An investor presentation: ordered sections, published as a version |
| `post` | An article, on the gateway or in the room |
| `scene` | The planet, sky, satellites and journey |
| `chapter` | One section of the gateway's argument |
| `station` | Where the journey puts the world for a chapter |

There are exactly two roles. Do not invent a third; if one seems needed, that is a decision (§1.12).

---

## 8. Domain rules

### 8.1 Access and the gate

- **SEC-R01** The investor room is gated at the **server**, never by CSS. The static site's `.investor` class is a demonstration of the design, and its own stylesheet says so; nothing may be put behind it that would matter if read.
- **SEC-R02** Sessions are httpOnly, SameSite=Lax, rotated on sign-in and on any privilege change, and invalidated server-side on sign-out.
- **SEC-R03** A sign-in failure is indistinguishable between "no such account" and "wrong password", and is rate-limited per account and per address.
- **SEC-R04** Every admin action that changes an account, a deck's visibility, or a mail send is audited — actor, timestamp, before, after — append-only.
- **SEC-R05** No secret lives in the repository. Credentials arrive through environment variables; a missing one degrades its feature and leaves the system up.

### 8.2 Investor personal data

- **DATA-R01** Collect the minimum: a name, an e-mail address, and the access granted. Nothing else without a stated purpose.
- **DATA-R02** Personal data never appears in a log, in analytics, or in an error message.
- **DATA-R03** An investor can be told what is held about them, and can have it corrected or erased. Erasure is a real delete; the audit trail is retained minimally.
- **DATA-R04** Mail to investors is sent for the purpose they consented to, carries an unsubscribe path, and records what was sent to whom and when.
- **DATA-R05** Every read of a deck or a post is scoped by the reader's role at the query, never in the template.

### 8.3 The scene

- **SCENE-R01** The designs under `docs/designs/scene/` are the record. Read the one you are changing before you change it, and update it in the same commit.
- **SCENE-R02** Nothing in the scene is measured from a constant that duplicates a stylesheet value. The world's size, the orbit's reach and the disc's radius are read from the element that draws them. Three defects have come from a second copy going stale.
- **SCENE-R03** No idle animation. A loop exists only while something is moving, and stops when nothing is.
- **SCENE-R04** Reduced motion slows the scene; it never freezes it and never blanks a chapter.
- **SCENE-R05** The world stays in sight. It may pass low, arrive late, or go behind a heading; it may not leave the frame to solve a collision.

### 8.4 Language

- **I18N-R01** No hard-coded visitor-facing string. Keys live in `assets/i18n.js` today and in the app's catalogue after the cutover.
- **I18N-R02** **Twenty locales**, complete in every one: `en, vi, zh, zt, th, id, ms, tl, hi, es, ar, fr, bn, pt, ru, ur, de, ja, tr, ko`. English is authored; the rest are authored translations, not machine output. Right-to-left for `ar` and `ur`.
- **I18N-R03** `node scripts/sync-static-copy.mjs --check` is the pre-push gate. It fails on markup or dictionary drift, on locale parity loss, and on a localized-node count that has moved — **bump `EXPECTED_NODES` deliberately** when the markup changes.
- **I18N-R04** A missing key falls back to English; a raw key never reaches the screen.
- **I18N-R05** Typography follows the locale: a no-break space before colon, semicolon, exclamation and question marks in French; full-width punctuation in Japanese and Chinese; the Arabic comma; the Urdu full stop.

### 8.5 Accessibility

- **A11Y-R01** Every control reachable and operable by keyboard, with a visible focus ring measured against the surface it sits on.
- **A11Y-R02** An accessible name on every interactive element.
- **A11Y-R03** WCAG AA contrast, measured against the **painted pixel** — panel over planet, not token over token.
- **A11Y-R04** The scene is `aria-hidden`; it carries no information the text does not.

---

## 9. Before committing

- [ ] Tests pass; new behaviour has tests
- [ ] No secret in the diff; nothing internal aimed at `main` (§1.1)
- [ ] `node scripts/sync-static-copy.mjs --check` green if markup or the dictionary changed
- [ ] Documents updated in the same commit — PRD, the design, tasks
- [ ] Any choice that is the owner's is filed in `docs/decisions-log.md`
- [ ] `docs/tasks.md` reflects reality
- [ ] Axis review walked; findings resolved or recorded
- [ ] Conventional Commit subject carrying the feature code

---

## 10. Testing, and what "verified" means here

**Tiers.** T0 smoke · T1 unit · T2 integration against a real PostgreSQL · T3 regression, named for the bug and never deleted · T4 end-to-end in a browser.

**The gateway's tier is the browser.** Most of this repository is layout, motion and perception, and none of that is reachable from a unit test. So:

- **Drive the page; do not read the source.** Reading source explains a symptom. It never finds one.
- **Serve probes with `Cache-Control: no-store`.** A dev server without cache headers, and a browser holding an old asset, have each made a measurement describe a file that was not running.
- **Settle before measuring.** After a programmatic jump the world eases to its station for up to two seconds, and a stage places its cards against where the world is now. A probe that samples at 260ms measures its own scroll.
- **Sample only valid frames.** A pinned stage's cards mean nothing while its chapter is not pinned.
- **Measure the thing.** Contrast against the painted pixel; the disc from the element that draws it; frames per second on a real GPU, because software rendering is not the reader's machine.
- **Then look at it.** A ratio hides the moment it represents.

---

## 11. Branches, CI and commits

### 11.1 Gates

**Two of these exist today.** The rest are the target, and each lands with the
first work that gives it something to check — a gate written before its subject
is a gate that has only ever passed.

| Stage | Gate | Exists | Blocks |
|---|---|---|---|
| Served-copy parity | `scripts/sync-static-copy.mjs --check` | yes, armed in the pre-push hook | Yes |
| Decision register | `scripts/validate-decisions.py` | yes, armed in the pre-push hook | Yes |
| Lint | `eslint` and `prettier` | with the first application code | Yes |
| Types | `tsc --noEmit` | with the first application code | Yes |
| Build | `next build` | with the first application code | Yes |
| T0 to T1 | smoke and unit | with the first application code | Yes |
| T2 | integration against a real PostgreSQL | with `DATA-001` | Yes |
| Design cross-reference | `scripts/validate-designs.py --strict` | with the first design | Yes |
| Comment hygiene | `scripts/check-comments.py` | with the first application code | Yes |
| Secrets | `gitleaks` | with the first credential | Yes |
| End-to-end | Playwright | with `AUTH-001` | On push to `staging` and `production` |

### 11.2 Branches

Four refs exist. `main` is the published static site until the app replaces it. `development` is where all work happens. `staging` and `production` are promotion targets, and **the owner merges into them** — the pre-push hook lets this side push `main` and `development`, and permits `staging` and `production` to be created exactly once, never updated.

**Never** create a fifth branch, switch branches from a session, merge into `development` from another branch, or push to `staging` or `production`.

**Commit size:** one logical change; commit each completed task as it goes green; never more than one completed-but-uncommitted step; never commit broken code.

**Message:** Conventional Commits, subject at most seventy characters, imperative, no full stop. The body wraps at seventy-two and explains why, carrying the measurement. The footer carries `Refs: <CODE>/T<N>` and, whenever Claude wrote the code:

    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

**Parallel sessions share one tree.** Start with `git branch --show-current`; stage by explicit path, never `git add -A`; re-read `git diff --cached --name-only` immediately before committing; never touch another lane's uncommitted work.

---

## 12. Where a finding lives

Every finding any review raises — front-end, scene, security, accessibility, language, legal, or a run of the live site — is a **`REVIEW/T<N>` row in `docs/tasks.md`**. There is no separate findings register. Each row carries `Impact to:` naming what it bears on, and the task it names carries `Refer to:` back, so neither side can be corrected without the other saying so. A choice a finding surfaces is filed in `decisions-log.md`; an external gate goes to `operator-checklist.md`. A finding accepted as not-a-defect closes with its reason as `Evidence:`. Open `REVIEW` rows are drained before other roadmap work.

---

## 13. Session protocol

**Start:** confirm the branch · confirm the tree is clean · read `docs/tasks.md`, open `REVIEW` rows first · `git log --oneline -10` · re-read this file if it changed · announce the task.

**During:** keep `docs/tasks.md` true as you go; record the exact stopping point for partial work; file unrelated findings as `REVIEW` rows rather than fixing them in passing.

**End:** tasks reflect reality · no uncommitted work beyond one step · gates green · the honest report (§1.7).

---

## 14. Always, never, ask

**Always** — read the PRD before business logic · grep before assuming · use the vocabulary in §7.3 · gate the investor room at the server · scope every read by role at the query · treat investor identity as personal data · fill `Evidence:` before closing a task · drain open `REVIEW` rows first · read the scene's design before touching the scene.

**Never** — commit anything internal to `main` · use a destructive git command without turn-specific approval · switch branches · push to `staging` or `production` · write a secret into the repository · put personal data in a log · ship a string with no i18n key · leave the scene animating when nothing moves · claim a browser behaviour without having opened a browser.

**Ask first** — architecture changes · schema migrations that are not additive · new dependencies · auth or session changes · anything that sends mail to a real investor · anything that changes what the public page says · DNS, CDN or hosting changes · deleting data · cost-incurring operations · an ambiguous requirement.

Filing is half of it: every item above lands in `docs/decisions-log.md`, as an OPEN entry with its safe default when the choice is the owner's, or as a loop-settled entry naming its forcing source when §1.11 forces the answer.

---

## 15. Complexity triage

| Level | Criteria | Process |
|---|---|---|
| Simple | Two files or fewer, configuration, copy, no cross-feature impact | Steps 6 to 9 |
| Medium | Two to five files, a known pattern, one feature across layers | All nine |
| Complex | More than five files, a new pattern, several features | All nine, with confirmation before coding |
| Critical | Auth · schema · mail to real investors · anything on the live gateway · infrastructure | All nine, owner sign-off per step, and a rollback plan |

Automatic upgrades: auth or session to Medium · personal-data handling to Medium with a privacy review · a change to the public page's words to Medium with owner review · a non-additive migration to Critical with a rehearsed rollback · sending mail to Critical. **Downgrading is not allowed** — explain and ask.

---

## 16. When in doubt

Grep the code · read the PRD section · read the design in full · check `depends_on` · run the validator · **open the page in a browser** · ask the owner, framed as "I found X in this source, but the situation is Z — should I do A or B?"

Never guess and proceed. On a page the whole company is judged by, a silent assumption becomes a public defect.
