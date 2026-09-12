# VALO Tech — roadmap

> **Generated** by `scripts/generate-roadmap.py` from [docs/tasks.md](tasks.md), the design graph under [docs/designs/](designs/) and [docs/roadmap-policy.yaml](roadmap-policy.yaml). Do not edit it: the next regeneration discards the edit, and until then the queue disagrees with the ledger. To change the order, change the dependency or the policy.

> **Not for `main`.** This file lives on `development` only (`.claude/CLAUDE.md` §1.1).

Ordering only. What each task *is* lives in [docs/tasks.md](tasks.md); why the product wants it lives in [docs/PRD.md](PRD.md). Nothing is restated here. A wave is a band of the dependency graph's depth: everything in `W(n)` can be built once `W(n-1)` stands. Within a wave, features are ordered by depth and tasks by state — in-progress first, then open, then blocked. Closed tasks are omitted.

**Active wave: W0 — The ground**

_195 tasks in the plan, 137 closed, 58 outstanding._

---

## W0 — The ground · **ACTIVE**

_What nothing else stands on. The page that already serves and its cross-cutting layers are here because nothing depends on them; the local stack, the schema and credential handling are here because everything does. This wave is finished when a developer brings the stack up with one command and a migration has been applied and rolled back — not written, run, because a rollback nobody has executed is not a rollback._

_44/65 closed (67%) · 21 outstanding — 21 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **DECK-003** · Deck reading — 0/5 closed · depth 0
  - `[ ] DECK-003/T1` — One column with sections in order, the version and date on the page
  - `[ ] DECK-003/T2` — A contents list that marks the current section by reading position, not by a threshold
  - `[ ] DECK-003/T3` — A next-section control that moves the reading position and nothing else
  - `[ ] DECK-003/T4` — The change notice for an unpinned reader whose version moved
  - `[ ] DECK-003/T5` — The print stylesheet shared with `RPT-003` where the rules are the same

- **I18N-002** · Served-copy parity gate — 2/2 closed
- **INFRA-001** · Local development stack — 5/5 closed
- **LEGAL-GLOBAL-002** · Cookie and analytics posture — 0/5 closed · depth 0
  - `[ ] LEGAL-GLOBAL-002/T1` — The three categories, with `necessary` fixed on and both others off until a visitor says otherwise
  - `[ ] LEGAL-GLOBAL-002/T2` — The notice states the three storages, when each is set, and that nothing else is set on arrival
  - `[ ] LEGAL-GLOBAL-002/T3` — A test proves a visitor who answers nothing, signs in to nothing and chooses no language leaves with an empty cookie ja…
  - `[ ] LEGAL-GLOBAL-002/T4` — Nothing non-essential is present in the page until consent, rather than present and inert
  - `[ ] LEGAL-GLOBAL-002/T5` — The stored choice is versioned, and a bump re-asks rather than extending an old answer

- **RPT-003** · Report reading — 0/5 closed · depth 0
  - `[ ] RPT-003/T1` — One column at a reading measure, with the period, title and date on the page itself
  - `[ ] RPT-003/T2` — Previous and next by period, skipping gaps, absent rather than disabled at the ends
  - `[ ] RPT-003/T3` — A print stylesheet: black on white, repeating header, figures as tables, links with their targets
  - `[ ] RPT-003/T4` — The phone layout is the default; only figures scroll horizontally, never the page
  - `[ ] RPT-003/T5` — The locale fallback notice sits above the content

- **SITE-001** · The gateway page — 9/9 closed
- **A11Y-001** · Accessibility baseline — 6/6 closed
- **CRED-001** · Credential handling — 5/5 closed
- **DATA-001** · Schema and migrations — 13/13 closed
- **SITE-003** · Chapter sequence — 2/2 closed
- **SITE-004** · The contact close — 2/2 closed
- **SITE-006** · Legal pages and the consent surface — 0/6 closed · depth 1
  - `[ ] SITE-006/T1` — Three legal pages in twenty locales, through the parity gate, linked in a footer row of their own
  - `[ ] SITE-006/T2` — The banner: three categories, `necessary` fixed, three controls of equal weight, no dismissal without an answer
  - `[ ] SITE-006/T3` — The banner is not first in the tab order, does not trap focus, and carries state without relying on colour
  - `[ ] SITE-006/T4` — The stored choice read in a `try`/`catch`; an unreadable store means no answer, and nothing non-essential loads
  - `[ ] SITE-006/T5` — A control on `legal/cookies` that changes the answer, and a footer link that reaches it
  - `[ ] SITE-006/T6` — The legal pages print in black on white

## W1 — The door

_Who may read what, and what records that they did. Everything above reads through the gate this wave builds, so a shortcut here is a shortcut in every feature after it. Sign-out precedes invitation deliberately: a session that cannot be ended server-side is a defect that grows with every account created. The scene sits here too, one layer above the page it moves behind._

_59/65 closed (90%) · 6 outstanding — 6 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **AUTH-001** · Sign-in — 5/5 closed
- **DATA-003** · Backup and restore — 5/5 closed
- **OPS-002** · Logging and monitoring — 6/6 closed
- **SCENE-001** · The world and its journey — 8/8 closed
- **AUTH-002** · Session and role gate — 5/5 closed
- **SCENE-002** · Satellites and their rings — 2/2 closed
- **SCENE-003** · The sky — 3/3 closed
- **SCENE-005** · Orbit stages — 4/4 closed
- **SCENE-006** · The mapping stage — 2/2 closed
- **ADMIN-002** · Admin console shell — 5/5 closed
- **AUTH-004** · Sign-out — 5/5 closed
- **CMS-001** · Content model and revisions — 6/6 closed
- **SCENE-004** · Annotation chips — 3/3 closed
- **SITE-005** · The gateway served by the application — 0/6 closed · depth 4
  - `[ ] SITE-005/T1` — The page is server-rendered from the same dictionary, at the same URLs, with the same asset paths
  - `[ ] SITE-005/T2` — The parity gate is pointed at the rendered output and counts both catalogues, for both readers
  - `[ ] SITE-005/T3` — Node-for-node comparison of the rendered page against the static one, at three viewports
  - `[ ] SITE-005/T4` — Edge caching for anonymous readers, `Vary` on the session cookie, verified through the CDN with and without one
  - `[ ] SITE-005/T5` — First paint measured before and after, at the same viewport on the same machine
  - `[ ] SITE-005/T6` — `main` stays deployable as the fallback through the cutover and for a month after

## W2 — The desk

_The machinery every kind of writing shares — the editor, the media, the locale states, the audience rule, publishing, search — plus the account, configuration and logging surfaces an operator needs before anything is published. Building it once is the whole reason a report, an update and a deck are three navigations over one system rather than three systems._

_34/59 closed (57%) · 25 outstanding — 25 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **ADMIN-001** · Account management — 9/9 closed
- **CFG-001** · Runtime configuration — 7/7 closed
- **CMS-002** · Authoring surface — 7/7 closed
- **CMS-006** · Audience and access — 6/6 closed
- **INV-002** · Gated gateway chapters, served — 0/6 closed · depth 5
  - `[ ] INV-002/T2` — A test requests the page with no cookie and proves a gated sentence is absent from the body
  - `[ ] INV-002/T3` — The nav's gated links are not rendered rather than hidden
  - `[ ] INV-002/T4` — The dictionary splits, and the gated catalogue is sent only to an entitled reader
  - `[ ] INV-002/T5` — The parity gate counts both catalogues
  - `[ ] INV-002/T6` — The invitation block, in twenty locales, carrying no fragment of what it invites to
  - `[!] INV-002/T1` — The gated components are not called for a reader who may not see them  · _in-graph_ · **Blocked by:** SITE-005/T1 — the gateway is still the static file, so there is no server response to withhold the gated chapters from; the gate they would be withhe…

- **OPS-001** · Hosting and deploy — 0/8 closed · depth 5
  - `[ ] OPS-001/T1` — Terraform under `deploy/`: VPC, ECS Fargate, ALB, RDS in private subnets, ECR, Route 53, ACM, with remote state and a l…
  - `[ ] OPS-001/T2` — The deploy sequence: migrate as a one-off task on the same image, then the new task set, health-checked before it takes…
  - `[ ] OPS-001/T3` — A short DNS TTL set a day before the cutover, and `main` left deployable for a month after
  - `[ ] OPS-001/T4` — Secrets from Secrets Manager by ARN; values set by the owner, never in Terraform state or the image
  - `[ ] OPS-001/T5` — The six post-deploy checks, run against the real deployment through Cloudflare
  - `[ ] OPS-001/T6` — A staging service carrying `APP_ENV=staging`, so the console says which one it is
  - `[ ] OPS-001/T7` — RDS unreachable from outside the VPC, proved by attempting it rather than by reading the security group
  - `[ ] OPS-001/T8` — Private-subnet egress, and Cloudflare caching that never holds a document

- **DATA-002** · Erasure and retention — 5/5 closed
- **INV-001** · Investor room shell — 0/5 closed · depth 6
  - `[ ] INV-001/T1` — The landing surface: what is new, where things stand, the current report, your decks
  - `[ ] INV-001/T2` — Empty and error states are different renderings, each saying which it is
  - `[ ] INV-001/T3` — Flat navigation over four destinations, with the current one marked
  - `[ ] INV-001/T4` — The room's chrome is the gateway's, with no scene
  - `[ ] INV-001/T5` — An expired session returns the reader to where they were going

- **POST-001** · Update authoring — 0/6 closed · depth 6
  - `[ ] POST-001/T1` — A composer that opens with the cursor in the body and fits without scrolling
  - `[ ] POST-001/T2` — Kind is required and chosen before writing; three kinds, no more
  - `[ ] POST-001/T3` — An optional product tag from the six, plus the company
  - `[ ] POST-001/T4` — The title derives from the first line until it is edited separately
  - `[ ] POST-001/T5` — A soft length marker that offers to move the text into the current draft report
  - `[ ] POST-001/T6` — The tagged product's current progress value is shown beside the composer

## W3 — What is written

_The three content types, and the compliance posture that governs what is held about the people reading them. Updates come before decks, and not only because they are the simpler shape of the same problem: they are what the room is for. An investor signs in to find out what has happened since they last looked._

_0/6 closed (0%) · 6 outstanding — 6 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **LEGAL-SG-001** · PDPA posture — 0/6 closed · depth 7
  - `[ ] LEGAL-SG-001/T1` — The privacy notice: what is held, why, how long, who to write to, in twenty locales
  - `[ ] LEGAL-SG-001/T2` — The notice is linked from the sign-in page and the room's footer
  - `[ ] LEGAL-SG-001/T3` — The four rights answered within thirty days, with the admin path for each written down
  - `[ ] LEGAL-SG-001/T4` — A named DPO recorded, and published in the notice
  - `[ ] LEGAL-SG-001/T5` — A breach runbook with the assessment steps and both notification paths
  - `[ ] LEGAL-SG-001/T6` — The backup window disclosed in the notice rather than omitted

## W4 — The room

_The reading surfaces, the room they sit in, and the gateway served by the application — which is what finally makes the gate on the two hidden chapters real rather than a stylesheet. This wave ends with the product complete and still unpublished; what publishes it is outside the waves, waiting on the owner._

_(nothing in the ledger sits in this wave)_

## Outside the waves

_A design whose status is `pending-decision`, `pending-external` or `deprecated` takes no wave, so a feature waiting on the owner cannot hold a wave open. Its tasks stay claimable the moment the blocker clears._

- **AUTH-003** · Invitation and password reset — status `in-progress` · 6/7 closed · 1 outstanding
- **CMS-003** · Media library — status `in-progress` · 7/8 closed · 1 outstanding
- **CMS-004** · Preview, publish and withdraw — status `in-progress` · 2/6 closed · 4 outstanding
- **CMS-005** · Locale variants and translation state — status `in-progress` · 4/6 closed · 2 outstanding
- **CMS-007** · Search and filter in the room — status `in-progress` · 3/6 closed · 3 outstanding
- **DECK-001** · Deck authoring — status `in-progress` · 2/5 closed · 3 outstanding
- **DECK-002** · Deck versioning and publishing — status `in-progress` · 4/6 closed · 2 outstanding
- **DECK-004** · Deck access grants — status `in-progress` · 2/6 closed · 4 outstanding
- **I18N-001** · Twenty-locale runtime dictionary — status `in-progress` · 3/4 closed · 1 outstanding
- **INV-003** · Portfolio progress — status `in-progress` · 1/5 closed · 4 outstanding
- **LEGAL-GLOBAL-001** · GDPR posture for EU investors — status `in-progress` · 2/5 closed · 3 outstanding
- **MAIL-001** · Investor mail — status `in-progress` · 4/8 closed · 4 outstanding
- **MAIL-002** · Mail log and unsubscribe — status `in-progress` · 2/6 closed · 4 outstanding
- **POST-002** · Update publishing and audience — status `in-progress` · 4/6 closed · 2 outstanding
- **RPT-001** · Investor report authoring — status `in-progress` · 3/5 closed · 2 outstanding
- **RPT-002** · Report periods and archive — status `in-progress` · 4/6 closed · 2 outstanding
- **SEC-001** · Security baseline — status `in-progress` · 4/5 closed · 1 outstanding
- **SEC-002** · Audit log — status `in-progress` · 4/5 closed · 1 outstanding
- **SITE-002** · Public and investor chapter split — status `in-progress` · 3/4 closed · 1 outstanding
