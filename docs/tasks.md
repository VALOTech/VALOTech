# VALO Tech — Tasks

> **Not for `main`.** This document lives on `development` only (`.claude/CLAUDE.md` §1.1).
> **Purpose:** track every implementation task that realizes [docs/PRD.md](PRD.md). A task closes only with concrete `Evidence:`.
> **Companions:** [docs/PRD.md](PRD.md) · [docs/decisions-log.md](decisions-log.md) · [docs/design-gateway.md](design-gateway.md) · [.claude/CLAUDE.md](../.claude/CLAUDE.md) §3.6 and §4.

---

## How to use this document

Tasks are grouped by feature code and carry a stable id `<CODE>/T<N>`. A task lives in exactly one section, owned by one feature; work spanning features is split. `Evidence:` is a commit sha, a test name, or `path:Symbol` — never a bare line number, which moves.

| Marker | State | Required |
|---|---|---|
| `- [ ]` | open | — |
| `- [~]` | in progress | `Note:` — what is done and what is left |
| `- [!]` | blocked | `Blocked by:` — a task code or a register anchor |
| `- [x]` | closed | `Evidence:` |

**Open `REVIEW` rows are drained before other roadmap work.**

---

## REVIEW · findings from any review of the running product

Every finding — front-end, scene, security, accessibility, language, legal — is a row here. Each carries `Impact to:`; the task it names carries `Refer to:` back.

- [ ] REVIEW/T1 — Eleven locales have never been read sentence by sentence by a native speaker
  Note: the 2026-09-05 language pass cleared all sixteen non-`en`/`vi`/`zh`/`zt` locales on seven mechanical classes — coverage, brand preservation, register, typography, script, product-term consistency, and English function-word leakage — and read five of them line by line, fixing `ko`, `ur`, `hi`, `bn`, `fr` and `de`. The remaining eleven (`es`, `pt`, `ru`, `tr`, `id`, `ms`, `tl`, `th`, `ar`, `ja`, and the already-clean `zt`) passed every mechanical check but have not been read as prose by someone who speaks them. A mechanical pass cannot see a sentence that is correct and lifeless.
  Impact to: `I18N-001`
- [ ] REVIEW/T2 — A label crosses the face of the world in about a third of the frames it is shown in
  Note: measured at 1920 across the four label chapters, a chip's rectangle touched the drawn disc in 42 of 117 frames where it was shown. The dominant case is a satellite passing in front of or behind the world, where no horizontal offset clears the disc and the label rightly stays with its body — the reference design does the same. Filed as a deliberate acceptance, not a defect, so that a future reader does not rediscover it as one. Reopen if the owner reads it as clutter.
  Impact to: `SCENE-004`
- [x] REVIEW/T3 — Fifty-seven internal working files are published on the company domain
  Note: `.claude/` is committed to `main`, and GitHub Pages serves dot-directories. Measured: `valotech.org/.claude/settings.json` returns 200, as does every file of the four writing and translation skills — 336 KB of internal tooling on the company's public domain, linked from nothing and useful to no visitor. `settings.json` holds only a list of denied commands, so nothing here is a secret; the objection is that internal material is published at all, and that it is fetched by every crawler that walks the tree. `.githooks/pre-push`, `.editorconfig` and `.gitattributes` are served too and are unremarkable. Recommended: move `.claude/` off `main` and keep it on `development`, which loses nothing — the files stay in history and on the branch where work happens. Not done: removing files from the published branch is an owner's call (`.claude/CLAUDE.md` §14).
  Evidence: commit 215d9c2 — 62 files removed from `main`; `valotech.org/.claude/settings.json`, `/docs/design-gateway.md`, `/glossary-vi.json`, `/scripts/sync-static-copy.mjs` and `/.githooks/pre-push` all return 404, while the site itself loads with 0 failed requests and 0 console errors. The wider exposure — the repository is public, so every branch including this one is readable — is the owner's accepted position at docs/decisions-log.md#INFRA-DEC-04.
  Impact to: — none — · the published branch itself

---

## SITE-001 · The gateway page
PRD: `SITE-001`, `SITE-003`, `SITE-004` · Record: [docs/design-gateway.md](design-gateway.md)

- [x] SITE-001/T1 — One page, nine chapters, a fixed scene layer beneath them
  Evidence: index.html · assets/site.css §10b
- [x] SITE-001/T2 — Chapter sequence follows the reference: problem, answer, your people, why, workforce, ValoStack, yours-not-ours, contact
  Evidence: commit 7543b48
- [x] SITE-001/T3 — The close carries the contact call to action and states why prices are not published
  Evidence: index.html:#engage · docs/decisions-log.md#SITE-DEC-03
- [x] SITE-001/T4 — Navigation follows the page and folds into a menu below 1080px
  Evidence: assets/site.css:.nav-links · commit 7543b48
- [x] SITE-001/T5 — The reading column yields to the frame so labels survive below 1440px
  Evidence: commit 3af6ea0
- [x] SITE-001/T6 — A frame past 2000px shows a larger page rather than a further one
  Evidence: commit ecf3f62 · docs/decisions-log.md#SITE-DEC-02

## SITE-002 · Public and investor chapter split
PRD: `SITE-002` · Decision: [decisions-log.md#SITE-DEC-01](decisions-log.md#SITE-DEC-01)

- [x] SITE-002/T1 — How-we-deliver and the portfolio are hidden from a visitor and shown to a signed-in reader
  Evidence: assets/site.css:.chapter--gated · index.html
- [x] SITE-002/T2 — The mechanism detail under each of seven trust claims opens behind the sign-in
  Evidence: assets/site.css:.cap-detail
- [x] SITE-002/T3 — The navigation names the gated pair only to a signed-in reader
  Evidence: assets/site.css:.nav-gated
- [!] SITE-002/T4 — The split is enforced by the server rather than by CSS
  Blocked by: AUTH-002/T1

## SCENE-001 · The world and its journey
PRD: `SCENE-001` · Record: [docs/design-gateway.md](design-gateway.md)

- [x] SCENE-001/T1 — A lunar sphere becomes Earth across one scroll scrub, with a lit frontier
  Evidence: assets/scene/planet.js:TRANSITION_GLSL
- [x] SCENE-001/T2 — The journey is measured in chapters, not page fractions
  Evidence: assets/scene/boot.js:CHAPTER_SPINE
- [x] SCENE-001/T3 — The journey is read ahead of the reader so each chapter's disc is standing when its heading arrives
  Evidence: assets/scene/boot.js:LEAD_EASE
- [x] SCENE-001/T4 — A jump is placed rather than eased
  Evidence: commit e180555
- [x] SCENE-001/T5 — The world's size follows the frame, and its ceiling can never shrink a tuned size
  Evidence: assets/site.css:--planet · docs/decisions-log.md#SITE-DEC-02
- [x] SCENE-001/T6 — The close takes the open side of the footer
  Evidence: commit 535d981

## SCENE-002 · Satellites and their rings
PRD: `SCENE-002` · Decision: [decisions-log.md#SCENE-DEC-01](decisions-log.md#SCENE-DEC-01)

- [x] SCENE-002/T1 — Three bodies on one shared period, arriving in the order the story does
  Evidence: assets/scene/boot.js:SATELLITES
- [x] SCENE-002/T2 — One drawn ring per body, revealed with the body that rides it
  Evidence: commit e180555

## SCENE-003 · The sky
PRD: `SCENE-003`

- [x] SCENE-003/T1 — A parallaxed field in three depth tiers, against the orbit's bearing
  Evidence: assets/scene/stars.js:TIERS
- [x] SCENE-003/T2 — Meteors with two endings: a crater on the rock, absorption on the living world
  Evidence: assets/scene/stars.js:ABSORB_AT
- [x] SCENE-003/T3 — Colour temperature, a discrete twinkle, and a rare supernova
  Evidence: commit dc9e614

## SCENE-005 · Orbit stages
PRD: `SCENE-005`

- [x] SCENE-005/T1 — Two chapters whose cards ride an ellipse about the world, a rear card masked rather than stacked
  Evidence: assets/site.js:initOrbits
- [x] SCENE-005/T2 — The stage takes the frame, and its heading is not squeezed into a ribbon
  Evidence: commit c0244ee
- [x] SCENE-005/T3 — The ellipse and the mask are measured from the world, not from a copy of its stylesheet value
  Evidence: assets/site.js:rockRadius
- [x] SCENE-005/T4 — The stage keeps its own clock while it holds the frame
  Evidence: commit c0244ee

## I18N-001 · Twenty-locale runtime dictionary
PRD: `I18N-001`, `I18N-002`

- [x] I18N-001/T1 — 303 keys complete in twenty locales, swapped without a reload
  Evidence: assets/i18n.js
- [x] I18N-001/T2 — The served copy and the dictionary cannot drift past a push
  Evidence: scripts/sync-static-copy.mjs
- [x] I18N-001/T3 — Sixteen non-`en`/`vi`/`zh`/`zt` locales reviewed on seven mechanical classes; six corrected
  Evidence: assets/i18n.js
  Refer to: REVIEW/T1

---

## DATA-001 · Schema and migrations
PRD: `DATA-001`

- [ ] DATA-001/T1 — Choose and wire the migration tool; one command applies and one rolls back
- [ ] DATA-001/T2 — Accounts table: identity, role, state, created and updated
- [ ] DATA-001/T3 — Sessions table, or the session store the auth library needs
- [ ] DATA-001/T4 — Decks, deck sections and deck versions
- [ ] DATA-001/T5 — Deck grants: which account may read which deck
- [ ] DATA-001/T6 — Posts, with an audience column
- [ ] DATA-001/T7 — Mail log and unsubscribe state
- [ ] DATA-001/T8 — Audit table, append-only, with a database-level guard against update and delete
- [ ] DATA-001/T9 — Configuration table with a recorded prior value
- [ ] DATA-001/T10 — Every migration has a down-migration that has been run

## AUTH-001 · Sign-in
PRD: `AUTH-001`, `SEC-R01`, `SEC-R03`

- [ ] AUTH-001/T1 — Password hashing at the current cost, verified against a known vector
- [ ] AUTH-001/T2 — Sign-in route: identical failure for an unknown account and a wrong password
- [ ] AUTH-001/T3 — Rate limit per account and per address, with the limit stated in config
- [ ] AUTH-001/T4 — The sign-in form, in twenty languages, keyboard-reachable, with an accessible name on every field
- [ ] AUTH-001/T5 — Regression test: a wrong password and an unknown account are indistinguishable in status, body and timing

## AUTH-002 · Session and role gate
PRD: `AUTH-002`, `SEC-R02`, `DATA-R05`

- [ ] AUTH-002/T1 — Session cookie: httpOnly, SameSite=Lax, Secure, rotated on sign-in
- [ ] AUTH-002/T2 — Server-side invalidation, so a stolen cookie dies on sign-out
- [ ] AUTH-002/T3 — Role gate at the query, not the template; a helper that cannot be forgotten
- [ ] AUTH-002/T4 — Isolation test: an investor request for another investor's deck returns nothing, not a redirect

## AUTH-003 · Invitation and password reset
PRD: `AUTH-003`

- [ ] AUTH-003/T1 — Single-use, expiring token; consumed atomically
- [ ] AUTH-003/T2 — The invitation and reset pages, in twenty languages
- [!] AUTH-003/T3 — The mail that carries the link
  Blocked by: docs/decisions-log.md#MAIL-DEC-01

## AUTH-004 · Sign-out
PRD: `AUTH-004`

- [ ] AUTH-004/T1 — Sign-out destroys the session server-side and clears the cookie

## ADMIN-001 · Account management
PRD: `ADMIN-001`, `SEC-R04`

- [ ] ADMIN-001/T1 — Create, suspend and delete an investor account
- [ ] ADMIN-001/T2 — Grant and revoke deck access
- [ ] ADMIN-001/T3 — Every one of those writes lands in the audit table
- [ ] ADMIN-001/T4 — Erasure: a real delete of an investor's personal data, audit retained minimally

## ADMIN-002 · Admin console shell
PRD: `ADMIN-002`

- [ ] ADMIN-002/T1 — The staff surface, reachable only by an admin, with the same nav discipline as the gateway

## INV-001 · Investor room shell
PRD: `INV-001`

- [ ] INV-001/T1 — What a signed-in investor lands on, and how they reach a deck, the posts and the gated chapters

## INV-002 · Gated gateway chapters, served
PRD: `INV-002`, `SEC-R01`

- [!] INV-002/T1 — The two gated chapters and the seven mechanisms are rendered only for an authorised reader
  Blocked by: AUTH-002/T3
- [ ] INV-002/T2 — Regression test: an unauthenticated request for the gated markup receives none of it

## DECK-001 · Deck authoring
PRD: `DECK-001`

- [ ] DECK-001/T1 — Compose a deck as ordered sections
- [ ] DECK-001/T2 — A draft is visible to an admin and to nobody else

## DECK-002 · Deck versioning and publishing
PRD: `DECK-002`

- [ ] DECK-002/T1 — Publishing creates an immutable version
- [ ] DECK-002/T2 — What an investor was shown, and when, is recoverable

## DECK-003 · Deck reading
PRD: `DECK-003`

- [ ] DECK-003/T1 — The investor's reading view: sequential, readable on a phone, printable

## DECK-004 · Deck access grants
PRD: `DECK-004`

- [ ] DECK-004/T1 — Grant and revoke, audited, enforced at the query

## POST-001 · Post authoring
PRD: `POST-001`

- [ ] POST-001/T1 — Write, edit and delete an article

## POST-002 · Post publishing and audience
PRD: `POST-002`

- [ ] POST-002/T1 — Public, investor-only or draft, enforced at the query
- [ ] POST-002/T2 — Isolation test: a visitor request never returns an investor-only post

## MAIL-001 · Investor mail
PRD: `MAIL-001`

- [!] MAIL-001/T1 — Compose and send to selected investors
  Blocked by: docs/decisions-log.md#MAIL-DEC-01

## MAIL-002 · Mail log and unsubscribe
PRD: `MAIL-002`, `DATA-R04`

- [!] MAIL-002/T1 — Every send recorded: what, to whom, when
  Blocked by: docs/decisions-log.md#MAIL-DEC-01
- [!] MAIL-002/T2 — An unsubscribe that stops non-transactional mail
  Blocked by: docs/decisions-log.md#MAIL-DEC-01

## CFG-001 · Runtime configuration
PRD: `CFG-001`

- [ ] CFG-001/T1 — The values an admin may change without a deploy, each with its prior value and a single-action undo

## SEC-001 · Security baseline
PRD: `SEC-001`

- [ ] SEC-001/T1 — Content-Security-Policy with no `unsafe-inline`, verified in a browser
- [ ] SEC-001/T2 — HSTS, secure cookies, and no secret reachable from the client bundle
- [~] SEC-001/T3 — Dependency and secret scanning in CI
  Note: secret scanning runs on every push and pull request — gitleaks over full history, the binary pinned to release 8.30.0 rather than the published action, which refuses to run for an organisation without a paid licence and would therefore stop working the day this repository goes private. Dependency scanning waits on there being a dependency: the one library shipped, three.js 0.166, is vendored and pinned on purpose, and `.github/dependabot.yml.disabled` says what turns it on.

## SEC-002 · Audit log
PRD: `SEC-002`, `SEC-R04`

- [ ] SEC-002/T1 — Append-only in the database, not merely by convention
- [ ] SEC-002/T2 — Test: an update or delete against the audit table is refused

## OPS-001 · Hosting and deploy
PRD: `OPS-001`

- [!] OPS-001/T1 — Deploy the application somewhere and point the domain at it
  Blocked by: docs/decisions-log.md#INFRA-DEC-03

## OPS-002 · Logging and monitoring
PRD: `OPS-002`, `DATA-R02`

- [ ] OPS-002/T1 — Structured logs with a request id and no personal data
- [ ] OPS-002/T2 — A scrubber as a backstop, and an alert when it fires

## INFRA-001 · Local development stack
PRD: `INFRA-001`

- [~] INFRA-001/T1 — One command brings up PostgreSQL and the application against it
  Note: `make infra-up` starts PostgreSQL 17 on 5434 — the row this repository claimed in `docs/ECOSYSTEM.md`, not the engine's default, because two compose files reaching for 5432 is how a stack silently talks to a sibling's database. The health check waits for `pg_isready` rather than for the port, since Postgres accepts connections before it can answer them. The application half waits on there being an application.
- [~] INFRA-001/T2 — `env.example` lists every variable the application reads, with no value that is a secret
  Note: written and complete for the variables the designs name — app, database, session, rate limit — each with whether it is required and what a missing one does. It cannot close until code reads them, because the check that matters is that the list and the reader agree, and there is no reader yet. The mail block is deliberately empty and says why: `docs/decisions-log.md#MAIL-DEC-01`.

## CRED-001 · Credential handling
PRD: `CRED-001`, `SEC-R05`

- [~] CRED-001/T1 — Every credential from the environment; a missing one degrades its feature and leaves the system up
  Note: the rule and the three credentials are written in `credentials/README.md`, and `credentials/credential-input.html` generates what can be generated and takes what cannot, sending nothing anywhere. The behaviour half — that a missing credential degrades its own feature rather than the system — is a property of code that does not exist yet.

## LEGAL-SG-001 · PDPA posture
PRD: `LEGAL-SG-001`

- [ ] LEGAL-SG-001/T1 — The purpose investor data is collected for, stated where it is collected
- [ ] LEGAL-SG-001/T2 — Access and correction on request
- [ ] LEGAL-SG-001/T3 — A named data-protection officer and a breach-notification path

## LEGAL-GLOBAL-001 · GDPR posture for EU investors
PRD: `LEGAL-GLOBAL-001`

- [ ] LEGAL-GLOBAL-001/T1 — Lawful basis recorded, subject rights reachable, cross-border transfer stated

## LEGAL-GLOBAL-002 · Cookie and analytics posture
PRD: `LEGAL-GLOBAL-002`

- [!] LEGAL-GLOBAL-002/T1 — Whether the site measures anything about visitors, and what that obliges
  Blocked by: docs/decisions-log.md#OPS-DEC-01
