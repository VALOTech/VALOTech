# VALO Tech — roadmap

> **Generated** by `scripts/generate-roadmap.py` from [docs/tasks.md](tasks.md), the design graph under [docs/designs/](designs/) and [docs/roadmap-policy.yaml](roadmap-policy.yaml). Do not edit it: the next regeneration discards the edit, and until then the queue disagrees with the ledger. To change the order, change the dependency or the policy.

> **Not for `main`.** This file lives on `development` only (`.claude/CLAUDE.md` §1.1).

Ordering only. What each task *is* lives in [docs/tasks.md](tasks.md); why the product wants it lives in [docs/PRD.md](PRD.md). Nothing is restated here. A wave is a band of the dependency graph's depth: everything in `W(n)` can be built once `W(n-1)` stands. Within a wave, features are ordered by depth and tasks by state — in-progress first, then open, then blocked. Closed tasks are omitted.

**Active wave: W0 — The ground**

_327 tasks in the plan, 266 closed, 61 outstanding._

---

## W0 — The ground · **ACTIVE**

_What nothing else stands on. The page that already serves and its cross-cutting layers are here because nothing depends on them; the local stack, the schema and credential handling are here because everything does. This wave is finished when a developer brings the stack up with one command and a migration has been applied and rolled back — not written, run, because a rollback nobody has executed is not a rollback._

_48/50 closed (96%) · 2 outstanding — 0 buildable now · 0 waiting on the owner · 1 external residue · 1 parked to a later wave._

- **INFRA-001** · Local development stack — 5/5 closed
- **SITE-001** · The gateway page — 9/9 closed
- **A11Y-001** · Accessibility baseline — 6/6 closed
- **CRED-001** · Credential handling — 5/5 closed
- **DATA-001** · Schema and migrations — 13/13 closed
- **I18N-001** · Twenty-locale runtime dictionary — 3/4 closed · depth 1
  - `[!] I18N-001/T4` — Eleven locales read as prose, sentence by sentence, by someone who speaks them  · _external_ · **Blocked by:** pending-external: a native reader for `es`, `pt`, `ru`, `tr`, `id`, `ms`, `tl`, `th`, `ar`, `ja` and `zt`. All eleven pass every mechanical class in…

- **SITE-002** · Public and investor chapter split — 3/4 closed · depth 1
  - `[!] SITE-002/T4` — The split is enforced by the server rather than by CSS  · _cross-wave-parked_ · **Blocked by:** INV-002/T1 — the enforcement is that task's, and this row closes when the served page stops shipping the gated markup to a visitor.

- **SITE-003** · Chapter sequence — 2/2 closed
- **SITE-004** · The contact close — 2/2 closed
## W1 — The door

_Who may read what, and what records that they did. Everything above reads through the gate this wave builds, so a shortcut here is a shortcut in every feature after it. Sign-out precedes invitation deliberately: a session that cannot be ended server-side is a defect that grows with every account created. The scene sits here too, one layer above the page it moves behind._

_74/75 closed (98%) · 1 outstanding — 0 buildable now · 0 waiting on the owner · 1 external residue · 0 parked to a later wave._

- **AUTH-001** · Sign-in — 5/5 closed
- **DATA-003** · Backup and restore — 5/5 closed
- **I18N-002** · Served-copy parity gate — 2/2 closed
- **SCENE-001** · The world and its journey — 9/9 closed
- **SEC-002** · Audit log — 4/5 closed · depth 2
  - `[!] SEC-002/T2` — The application role holds no UPDATE or DELETE on it  · _external_ · **Blocked by:** pending-external: the REVOKE runs where the database is deployed, against the role in DATABASE_URL, and is documented at docs/operator-checklist.md#A…

- **AUTH-002** · Session and role gate — 5/5 closed
- **AUTH-003** · Invitation and password reset — 7/7 closed
- **SCENE-002** · Satellites and their rings — 3/3 closed
- **SCENE-003** · The sky — 3/3 closed
- **SCENE-005** · Orbit stages — 4/4 closed
- **SCENE-006** · The mapping stage — 2/2 closed
- **ADMIN-002** · Admin console shell — 5/5 closed
- **AUTH-004** · Sign-out — 5/5 closed
- **CMS-001** · Content model and revisions — 7/7 closed
- **SCENE-004** · Annotation chips — 3/3 closed
- **SEC-001** · Security baseline — 5/5 closed
## W2 — The desk

_The machinery every kind of writing shares — the editor, the media, the locale states, the audience rule, publishing, search — plus the account, configuration and logging surfaces an operator needs before anything is published. Building it once is the whole reason a report, an update and a deck are three navigations over one system rather than three systems._

_74/75 closed (98%) · 1 outstanding — 0 buildable now · 1 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **ADMIN-001** · Account management — 12/12 closed
- **CFG-001** · Runtime configuration — 8/8 closed
- **CMS-003** · Media library — 10/10 closed
- **CMS-005** · Locale variants and translation state — 6/6 closed
- **CMS-006** · Audience and access — 6/6 closed
- **OPS-002** · Logging and monitoring — 6/6 closed
- **CMS-002** · Authoring surface — 9/9 closed
- **CMS-004** · Preview, publish and withdraw — 6/7 closed · depth 6
  - `[!] CMS-004/T6` — A public item's cache is purged on publish and on withdraw  · _pending-decision_ · **Blocked by:** pending-decision: CMS-DEC-07 ([docs/decisions-log.md#CMS-DEC-07](decisions-log.md#CMS-DEC-07)) — OPS-001 §3 settles that Cloudflare caches the assets…

- **CMS-007** · Search and filter in the hall — 6/6 closed
- **DATA-002** · Erasure and retention — 5/5 closed
## W3 — What is written

_The three content types, and the compliance posture that governs what is held about the people reading them. Updates come before decks, and not only because they are the simpler shape of the same problem: they are what the hall is for. An investor signs in to find out what has happened since they last looked._

_60/67 closed (89%) · 7 outstanding — 1 buildable now · 1 waiting on the owner · 3 external residue · 2 parked to a later wave._

- **DECK-001** · Deck authoring — 6/6 closed
- **LEGAL-SG-001** · PDPA posture — 5/8 closed · depth 7
  - `[!] LEGAL-SG-001/T4` — A named DPO recorded, and published in the notice  · _external_ · **Blocked by:** pending-external: legal — the owner names the individual, at docs/operator-checklist.md#DPO-CONTACT. The mechanism is built and needs no deploy to us…
  - `[!] LEGAL-SG-001/T7` — The cross-border transfer assessment, now that the hosting and the mail carrier are both settled  · _pending-decision_ · **Blocked by:** pending-decision: OPS-DEC-03 ([docs/decisions-log.md#OPS-DEC-03](decisions-log.md#OPS-DEC-03)) — the assessment is about whether personal data leaves…
  - `[!] LEGAL-SG-001/T8` — The PDPA sections this design rests on are in the tree, and every claim cites one  · _external_ · **Blocked by:** pending-external: legal — the statute text is obtained by the owner or counsel, at docs/operator-checklist.md#COMPLIANCE-SOURCES. Nobody here can sup…

- **MAIL-001** · Investor mail — 8/8 closed
- **POST-001** · Update authoring — 6/6 closed
- **RPT-001** · Investor report authoring — 5/5 closed
- **AUTH-005** · Registration for people considering an investment — 3/4 closed · depth 8
  - `[!] AUTH-005/T3` — The form on the gateway, in twenty locales, operable by keyboard  · _cross-wave-parked_ · **Blocked by:** SITE-005/T1 — the gateway is not served by the application, so there is no page that can carry the form.

- **DECK-002** · Deck versioning and publishing — 5/6 closed · depth 8
  - `[!] DECK-002/T3` — An unpinned reader is told once when the version changed, with what changed by section  · _cross-wave-parked_ · **Blocked by:** DECK-003/T1 (the deck reading view) — DECK-002 §3 puts the notice in the reading view itself, where an unpinned reader whose deck has moved is told o…

- **LEGAL-GLOBAL-001** · GDPR posture for EU investors — 5/6 closed · depth 8
  - `[!] LEGAL-GLOBAL-001/T6` — The GDPR articles this design rests on are in the tree, and every claim cites one  · _external_ · **Blocked by:** pending-external: legal — the article text is obtained by the owner or counsel, at docs/operator-checklist.md#COMPLIANCE-SOURCES. The operational rul…

- **MAIL-002** · Mail log and unsubscribe — 6/6 closed
- **POST-002** · Update publishing and audience — 5/6 closed · depth 8
  - `[ ] POST-002/T6` — Unread marking from the per-account read state, and a paging control rather than infinite scroll

- **RPT-002** · Report periods and archive — 6/6 closed
## W4 — The hall

_The reading surfaces, the hall they sit in, and the gateway served by the application — which is what finally makes the gate on the two hidden chapters real rather than a stylesheet. This wave ends with the product complete and still unpublished; what publishes it is outside the waves, waiting on the owner._

_10/60 closed (16%) · 50 outstanding — 49 buildable now · 0 waiting on the owner · 1 external residue · 0 parked to a later wave._

- **DECK-003** · Deck reading — 0/5 closed · depth 9
  - `[ ] DECK-003/T1` — One column with sections in order, the version and date on the page
  - `[ ] DECK-003/T2` — A contents list that marks the current section by reading position, not by a threshold
  - `[ ] DECK-003/T3` — A next-section control that moves the reading position and nothing else
  - `[ ] DECK-003/T4` — The change notice for an unpinned reader whose version moved
  - `[ ] DECK-003/T5` — The print stylesheet shared with `RPT-003` where the rules are the same

- **DECK-004** · Deck access grants — 2/6 closed · depth 9
  - `[ ] DECK-004/T2` — The confirmation states in words what the person will be able to read, including the version
  - `[ ] DECK-004/T4` — The from-the-deck view, showing pin, granter, date and when last opened
  - `[ ] DECK-004/T5` — The from-the-account view, listing every deck a person may read
  - `[ ] DECK-004/T6` — Bulk grant with the names shown before it commits, and no bulk revoke

- **INV-001** · Investor hall shell — 4/6 closed · depth 9
  - `[~] INV-001/T3` — Flat navigation over four destinations, with the current one marked  · **Note:** three of the four destinations stand. The rail and its current-destination mark ship in apps/web/src/app/hall/nav.tsx, a client component for one rea…
  - `[ ] INV-001/T6` — The landing's blocks are ordered by who the reader is, and an unclassified reader has an order of their own

- **LEGAL-GLOBAL-002** · Cookie and analytics posture — 0/5 closed · depth 9
  - `[ ] LEGAL-GLOBAL-002/T1` — The three categories, with `necessary` fixed on and both others off until a visitor says otherwise
  - `[ ] LEGAL-GLOBAL-002/T2` — The notice states the three storages, when each is set, and that nothing else is set on arrival
  - `[ ] LEGAL-GLOBAL-002/T3` — A test proves a visitor who answers nothing, signs in to nothing and chooses no language leaves with an empty cookie ja…
  - `[ ] LEGAL-GLOBAL-002/T4` — Nothing non-essential is present in the page until consent, rather than present and inert
  - `[ ] LEGAL-GLOBAL-002/T5` — The stored choice is versioned, and a bump re-asks rather than extending an old answer

- **RPT-003** · Report reading — 0/5 closed · depth 9
  - `[ ] RPT-003/T1` — One column at a reading measure, with the period, title and date on the page itself
  - `[ ] RPT-003/T2` — Previous and next by period, skipping gaps, absent rather than disabled at the ends
  - `[ ] RPT-003/T3` — A print stylesheet: black on white, repeating header, figures as tables, links with their targets
  - `[ ] RPT-003/T4` — The phone layout is the default; only figures scroll horizontally, never the page
  - `[ ] RPT-003/T5` — The locale fallback notice sits above the content

- **SITE-005** · The gateway served by the application — 0/6 closed · depth 9
  - `[ ] SITE-005/T1` — The page is server-rendered from the same dictionary, at the same URLs, with the same asset paths
  - `[ ] SITE-005/T2` — The parity gate is pointed at the rendered output and counts both catalogues, for both readers
  - `[ ] SITE-005/T3` — Node-for-node comparison of the rendered page against the static one, at three viewports
  - `[ ] SITE-005/T4` — Edge caching for anonymous readers, `Vary` on the session cookie, verified through the CDN with and without one
  - `[ ] SITE-005/T5` — First paint measured before and after, at the same viewport on the same machine
  - `[ ] SITE-005/T6` — `main` stays deployable as the fallback through the cutover and for a month after

- **INV-002** · Gated gateway chapters, served — 0/6 closed · depth 10
  - `[ ] INV-002/T2` — A test requests the page with no cookie and proves a gated sentence is absent from the body
  - `[ ] INV-002/T3` — The nav's gated links are not rendered rather than hidden
  - `[ ] INV-002/T4` — The dictionary splits, and the gated catalogue is sent only to an entitled reader
  - `[ ] INV-002/T5` — The parity gate counts both catalogues
  - `[ ] INV-002/T6` — The invitation block, in twenty locales, carrying no fragment of what it invites to
  - `[!] INV-002/T1` — The gated components are not called for a reader who may not see them  · _in-graph_ · **Blocked by:** SITE-005/T1 — the gateway is still the static file, so there is no server response to withhold the gated chapters from; the gate they would be withhe…

- **INV-003** · Portfolio progress — 3/6 closed · depth 10
  - `[ ] INV-003/T2` — Editing one product at a time, audited with the previous stage and headline
  - `[ ] INV-003/T3` — A changed stage offers a prefilled progress update, and can be declined
  - `[ ] INV-003/T6` — One product's own page: its standing, and every update tagged to it

- **OPS-001** · Hosting and deploy — 0/8 closed · depth 10
  - `[ ] OPS-001/T1` — Terraform under `deploy/`: VPC, ECS Fargate, ALB, RDS in private subnets, ECR, Route 53, ACM, with remote state and a l…
  - `[ ] OPS-001/T2` — The deploy sequence: migrate as a one-off task on the same image, then the new task set, health-checked before it takes…
  - `[ ] OPS-001/T3` — A short DNS TTL set a day before the cutover, and `main` left deployable for a month after
  - `[ ] OPS-001/T4` — Secrets from Secrets Manager by ARN; values set by the owner, never in Terraform state or the image
  - `[ ] OPS-001/T5` — The six post-deploy checks, run against the real deployment through Cloudflare
  - `[ ] OPS-001/T6` — A staging service carrying `APP_ENV=staging`, so the console says which one it is
  - `[ ] OPS-001/T7` — RDS unreachable from outside the VPC, proved by attempting it rather than by reading the security group
  - `[ ] OPS-001/T8` — Private-subnet egress, and Cloudflare caching that never holds a document

- **SITE-006** · Legal pages and the consent surface — 1/7 closed · depth 10
  - `[ ] SITE-006/T2` — The banner: three categories, `necessary` fixed, three controls of equal weight, no dismissal without an answer
  - `[ ] SITE-006/T3` — The banner is not first in the tab order, does not trap focus, and carries state without relying on colour
  - `[ ] SITE-006/T4` — The stored choice read in a `try`/`catch`; an unreadable store means no answer, and nothing non-essential loads
  - `[ ] SITE-006/T5` — A control on `legal/cookies` that changes the answer, and a footer link that reaches it
  - `[ ] SITE-006/T6` — The legal pages print in black on white
  - `[!] SITE-006/T7` — The terms page, in twenty locales, once counsel has read its English source  · _external_ · **Blocked by:** pending-external: legal — somebody qualified reads the English, at docs/operator-checklist.md#TERMS-REVIEW. Everything this side can supply is suppli…
