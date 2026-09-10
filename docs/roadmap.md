# VALO Tech — roadmap

> **Generated** by `scripts/generate-roadmap.py` from [docs/tasks.md](tasks.md), the design graph under [docs/designs/](designs/) and [docs/roadmap-policy.yaml](roadmap-policy.yaml). Do not edit it: the next regeneration discards the edit, and until then the queue disagrees with the ledger. To change the order, change the dependency or the policy.

> **Not for `main`.** This file lives on `development` only (`.claude/CLAUDE.md` §1.1).

Ordering only. What each task *is* lives in [docs/tasks.md](tasks.md); why the product wants it lives in [docs/PRD.md](PRD.md). Nothing is restated here. A wave is a band of the dependency graph's depth: everything in `W(n)` can be built once `W(n-1)` stands. Within a wave, features are ordered by depth and tasks by state — in-progress first, then open, then blocked. Closed tasks are omitted.

**Active wave: W0 — The ground**

_295 tasks in the plan, 167 closed, 128 outstanding._

---

## W0 — The ground · **ACTIVE**

_What nothing else stands on. The page that already serves and its cross-cutting layers are here because nothing depends on them; the local stack, the schema and credential handling are here because everything does. This wave is finished when a developer brings the stack up with one command and a migration has been applied and rolled back — not written, run, because a rollback nobody has executed is not a rollback._

_46/48 closed (95%) · 2 outstanding — 0 buildable now · 0 waiting on the owner · 1 external residue · 1 parked to a later wave._

- **INFRA-001** · Local development stack — 5/5 closed
- **SITE-001** · The gateway page — 8/8 closed
- **A11Y-001** · Accessibility baseline — 5/5 closed
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

_59/69 closed (85%) · 10 outstanding — 6 buildable now · 3 waiting on the owner · 1 external residue · 0 parked to a later wave._

- **AUTH-001** · Sign-in — 4/5 closed · depth 2
  - `[!] AUTH-001/T4` — The sign-in form, in twenty languages, keyboard-reachable, with an accessible name on every field  · _pending-decision_ · **Blocked by:** pending-decision: I18N-DEC-02 — the form must render in the reader's locale across twenty, and the application has no i18n framework yet; which one i…

- **DATA-003** · Backup and restore — 5/5 closed
- **I18N-002** · Served-copy parity gate — 2/2 closed
- **SCENE-001** · The world and its journey — 6/6 closed
- **SEC-002** · Audit log — 3/5 closed · depth 2
  - `[!] SEC-002/T2` — The application role holds no UPDATE or DELETE on it  · _external_ · **Blocked by:** pending-external: the REVOKE runs where the database is deployed, against the role in DATABASE_URL, and is documented at docs/operator-checklist.md#A…
  - `[!] SEC-002/T4` — Only changed fields are recorded, and no personal data reaches the trail  · _pending-decision_ · **Blocked by:** pending-decision: SEC-DEC-01 — whether a changed field records its name or an allow-listed value is the trail's personal-data policy, and it is the u…

- **AUTH-002** · Session and role gate — 4/4 closed
- **AUTH-003** · Invitation and password reset — 5/7 closed · depth 3
  - `[ ] AUTH-003/T3` — The mail that carries the link, in the invitee's locale
  - `[ ] AUTH-003/T4` — The set-password form, its policy, and the sign-in that follows

- **SCENE-002** · Satellites and their rings — 2/2 closed
- **SCENE-003** · The sky — 3/3 closed
- **SCENE-005** · Orbit stages — 4/4 closed
- **SCENE-006** · The mapping stage — 2/2 closed
- **ADMIN-002** · Admin console shell — 3/5 closed · depth 4
  - `[~] ADMIN-002/T2` — The seven destinations, with the landing surface listing what needs attention  · **Note:** The seven-destination nav ships in apps/web/src/app/admin/layout.tsx as the console's navigational chrome. The landing surface's listing of what need…
  - `[ ] ADMIN-002/T3` — One destructive-action component, naming the subject, with a typed confirmation for the three that cannot be undone

- **AUTH-004** · Sign-out — 3/5 closed · depth 4
  - `[~] AUTH-004/T4` — Every authenticated response is `no-store`, verified by pressing the back button  · **Note:** The mechanism ships and is header-verified; the acceptance the row names — pressing Back — is owed, so this is in-progress rather than closed. apps/w…
  - `[!] AUTH-004/T2` — The session list shows this account's live sessions and marks the current one  · _pending-decision_ · **Blocked by:** pending-decision: I18N-DEC-02 — the list is a localised page and the application has no i18n framework yet; which one it uses is the owner's to settl…

- **CMS-001** · Content model and revisions — 6/6 closed
- **SCENE-004** · Annotation chips — 3/3 closed
- **SEC-001** · Security baseline — 4/5 closed · depth 4
  - `[ ] SEC-001/T4` — Rate limits on sign-in, reset and invitation, per account and per address, refusing identically

## W2 — The desk

_The machinery every kind of writing shares — the editor, the media, the locale states, the audience rule, publishing, search — plus the account, configuration and logging surfaces an operator needs before anything is published. Building it once is the whole reason a report, an update and a deck are three navigations over one system rather than three systems._

_42/63 closed (66%) · 21 outstanding — 18 buildable now · 3 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **ADMIN-001** · Account management — 5/8 closed · depth 5
  - `[ ] ADMIN-001/T2` — The person page: identity, access, sessions, actions
  - `[ ] ADMIN-001/T4` — Deletion is a real delete; the confirmation lists what goes and what remains, and takes the typed name
  - `[ ] ADMIN-001/T6` — Creation issues an invitation; no admin ever sets another person's password

- **CFG-001** · Runtime configuration — 6/6 closed
- **CMS-003** · Media library — 5/7 closed · depth 5
  - `[!] CMS-003/T2` — Raster images are re-encoded, so EXIF and its location do not survive  · _pending-decision_ · **Blocked by:** pending-decision: CMS-DEC-03 — re-encoding needs an image library, and which one is a new dependency the owner chooses; the safe default refuses rast…
  - `[!] CMS-003/T3` — SVG is parsed and stripped to shape and text, or refused  · _pending-decision_ · **Blocked by:** pending-decision: CMS-DEC-03 — sanitising SVG needs a library, or the design's refuse-outright fallback; the choice is the owner's, and the safe defa…

- **CMS-005** · Locale variants and translation state — 3/6 closed · depth 5
  - `[ ] CMS-005/T4` — The review screen shows source beside translation, editable, marked one locale at a time
  - `[ ] CMS-005/T6` — A new revision starts with no locale rows, and the grid shows it
  - `[!] CMS-005/T3` — Drafting translates block text and reassembles marks by span, never by offset arithmetic  · _pending-decision_ · **Blocked by:** pending-decision: CMS-DEC-04 — the mark reassembly by span needs a programmatic per-span translator, so which carrier drafts a locale (a self-hosted…

- **CMS-006** · Audience and access — 6/6 closed
- **OPS-002** · Logging and monitoring — 6/6 closed
- **CMS-002** · Authoring surface — 1/7 closed · depth 6
  - `[~] CMS-002/T1` — A block list the author operates by keyboard, with each block's type visible  · **Note:** Built. apps/web/src/app/admin/content/[id]/edit/editor.tsx renders the blocks as a list of focusable rows; each row shows its written type (apps/web/…
  - `[~] CMS-002/T2` — The seven block types, each with the fields its schema requires  · **Note:** Built. apps/web/src/app/admin/content/[id]/edit/block-fields.tsx:BlockFields edits each of the seven types with the fields its schema demands (headin…
  - `[~] CMS-002/T6` — Explicit save, a visible unsaved state, and a local copy offered back after a closed tab  · **Note:** Built. apps/web/src/app/admin/content/[id]/edit/editor.tsx saves explicitly on a control and on Ctrl/Cmd-S (POST to the route below), states the unsa…
  - `[ ] CMS-002/T3` — An image block cannot be saved without alternative text
  - `[ ] CMS-002/T4` — Marks by selection, stored as offsets, with the editor's model the block array and not the DOM
  - `[ ] CMS-002/T5` — Paste imports plain text plus recognised structure and nothing else

- **CMS-004** · Preview, publish and withdraw — 2/6 closed · depth 6
  - `[ ] CMS-004/T1` — Preview renders through the reader's own components and evaluates the audience rule as the chosen role
  - `[ ] CMS-004/T2` — Preview is admin-only, with no token and no shareable link
  - `[ ] CMS-004/T4` — The confirmation names what is replaced and how many locales will fall back
  - `[ ] CMS-004/T6` — A public item's cache is purged on publish and on withdraw

- **CMS-007** · Search and filter in the room — 3/6 closed · depth 6
  - `[ ] CMS-007/T3` — Kind, product, period and type filters, composing into one statement
  - `[ ] CMS-007/T5` — The empty state names what narrowed the result and offers to widen it
  - `[ ] CMS-007/T6` — The field is labelled, keyboard-operable, and announces its result count

- **DATA-002** · Erasure and retention — 5/5 closed
## W3 — What is written

_The three content types, and the compliance posture that governs what is held about the people reading them. Updates come before decks, and not only because they are the simpler shape of the same problem: they are what the room is for. An investor signs in to find out what has happened since they last looked._

_18/59 closed (30%) · 41 outstanding — 41 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **DECK-001** · Deck authoring — 2/5 closed · depth 7
  - `[ ] DECK-001/T2` — An overview of section cards in order, showing heading, first line and what each carries
  - `[ ] DECK-001/T3` — Reordering by drag and by keyboard, writing back to the block array
  - `[ ] DECK-001/T4` — Section, word and figure counts in the overview

- **LEGAL-SG-001** · PDPA posture — 0/6 closed · depth 7
  - `[ ] LEGAL-SG-001/T1` — The privacy notice: what is held, why, how long, who to write to, in twenty locales
  - `[ ] LEGAL-SG-001/T2` — The notice is linked from the sign-in page and the room's footer
  - `[ ] LEGAL-SG-001/T3` — The four rights answered within thirty days, with the admin path for each written down
  - `[ ] LEGAL-SG-001/T4` — A named DPO recorded, and published in the notice
  - `[ ] LEGAL-SG-001/T5` — A breach runbook with the assessment steps and both notification paths
  - `[ ] LEGAL-SG-001/T6` — The backup window disclosed in the notice rather than omitted

- **MAIL-001** · Investor mail — 1/8 closed · depth 7
  - `[ ] MAIL-001/T2` — Recipients are a confirmed list of names, never a criterion re-evaluated at send time
  - `[ ] MAIL-001/T3` — Suspended and unsubscribed accounts are excluded and shown as excluded, with the reason
  - `[ ] MAIL-001/T4` — The send requires the recipient count to be typed, and re-resolves every recipient first
  - `[ ] MAIL-001/T5` — One row per recipient written before the attempt; a failure leaves the row and the send continues
  - `[ ] MAIL-001/T6` — Retry sends only to the ones that failed
  - `[ ] MAIL-001/T7` — With no credential the composer works, the list resolves, and the send control is disabled with the reason
  - `[ ] MAIL-001/T8` — One SMTP connection per send, TLS required, and a connection that cannot be secured fails rather than falling back

- **POST-001** · Update authoring — 0/6 closed · depth 7
  - `[ ] POST-001/T1` — A composer that opens with the cursor in the body and fits without scrolling
  - `[ ] POST-001/T2` — Kind is required and chosen before writing; three kinds, no more
  - `[ ] POST-001/T3` — An optional product tag from the six, plus the company
  - `[ ] POST-001/T4` — The title derives from the first line until it is edited separately
  - `[ ] POST-001/T5` — A soft length marker that offers to move the text into the current draft report
  - `[ ] POST-001/T6` — The tagged product's current progress value is shown beside the composer

- **RPT-001** · Investor report authoring — 3/5 closed · depth 7
  - `[ ] RPT-001/T4` — The progress board's current values are shown beside the section that narrates them
  - `[ ] RPT-001/T5` — Making a report public states in words what that means

- **DECK-002** · Deck versioning and publishing — 4/6 closed · depth 8
  - `[ ] DECK-002/T3` — An unpinned reader is told once when the version changed, with what changed by section
  - `[ ] DECK-002/T5` — The publish confirmation names every investor who will see the new version

- **LEGAL-GLOBAL-001** · GDPR posture for EU investors — 1/5 closed · depth 8
  - `[ ] LEGAL-GLOBAL-001/T1` — The notice carries the additional GDPR statements, in twenty locales
  - `[ ] LEGAL-GLOBAL-001/T3` — An objection flag that stops read-tracking and deletes the existing rows
  - `[ ] LEGAL-GLOBAL-001/T4` — The breach runbook uses the 72-hour clock for everyone
  - `[ ] LEGAL-GLOBAL-001/T5` — A one-page record of processing, and a written statement of what is deliberately not claimed

- **MAIL-002** · Mail log and unsubscribe — 0/6 closed · depth 8
  - `[ ] MAIL-002/T1` — Rows written before the attempt, keyed by account and never by address
  - `[ ] MAIL-002/T2` — An unsubscribe that works in one click without signing in, and a preference inside the room
  - `[ ] MAIL-002/T3` — Transactional mail is never suppressed, enforced by the `kind` set at send time
  - `[ ] MAIL-002/T4` — A manual `stop sending` control with its reason, and the send view naming the mailbox bounces arrive in
  - `[ ] MAIL-002/T5` — Two-year retention, and immediate removal with the account
  - `[ ] MAIL-002/T6` — The admin log, filtered by recipient and date, showing state and error

- **POST-002** · Update publishing and audience — 4/6 closed · depth 8
  - `[ ] POST-002/T5` — Narrowing states what it cannot recall; widening states what becomes public
  - `[ ] POST-002/T6` — Unread marking from the per-account read state, and a paging control rather than infinite scroll

- **RPT-002** · Report periods and archive — 3/6 closed · depth 8
  - `[ ] RPT-002/T2` — Publishing into a taken period fails with the report that holds it and the two real choices
  - `[ ] RPT-002/T3` — The archive lists by period, groups by year, and shows a period with no report as a gap
  - `[ ] RPT-002/T5` — Withdrawal states that the period becomes a gap and which report becomes current

## W4 — The room

_The reading surfaces, the room they sit in, and the gateway served by the application — which is what finally makes the gate on the two hidden chapters real rather than a stylesheet. This wave ends with the product complete and still unpublished; what publishes it is outside the waves, waiting on the owner._

_2/56 closed (3%) · 54 outstanding — 54 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

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

- **INV-001** · Investor room shell — 0/5 closed · depth 9
  - `[ ] INV-001/T1` — The landing surface: what is new, where things stand, the current report, your decks
  - `[ ] INV-001/T2` — Empty and error states are different renderings, each saying which it is
  - `[ ] INV-001/T3` — Flat navigation over four destinations, with the current one marked
  - `[ ] INV-001/T4` — The room's chrome is the gateway's, with no scene
  - `[ ] INV-001/T5` — An expired session returns the reader to where they were going

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
  - `[ ] SITE-005/T6` — `main` stays deployable as the fallback until the owner answers `INFRA-DEC-03`

- **INV-002** · Gated gateway chapters, served — 0/6 closed · depth 10
  - `[ ] INV-002/T2` — A test requests the page with no cookie and proves a gated sentence is absent from the body
  - `[ ] INV-002/T3` — The nav's gated links are not rendered rather than hidden
  - `[ ] INV-002/T4` — The dictionary splits, and the gated catalogue is sent only to an entitled reader
  - `[ ] INV-002/T5` — The parity gate counts both catalogues
  - `[ ] INV-002/T6` — The invitation block, in twenty locales, carrying no fragment of what it invites to
  - `[!] INV-002/T1` — The gated components are not called for a reader who may not see them  · _in-graph_ · **Blocked by:** SITE-005/T1 — the gateway is still the static file, so there is no server response to withhold the gated chapters from; the gate they would be withhe…

- **INV-003** · Portfolio progress — 0/5 closed · depth 10
  - `[ ] INV-003/T1` — Six rows, a constrained product and a closed four-word stage vocabulary
  - `[ ] INV-003/T2` — Editing one product at a time, audited with the previous stage and headline
  - `[ ] INV-003/T3` — A changed stage offers a prefilled progress update, and can be declined
  - `[ ] INV-003/T4` — All six always render, including paused, with an absent row filled rather than dropped
  - `[ ] INV-003/T5` — Stage is carried by a word as well as by colour, and the board states when it last changed

- **OPS-001** · Hosting and deploy — 0/7 closed · depth 10
  - `[ ] OPS-001/T1` — Terraform under `deploy/`: VPC, ECS Fargate, ALB, RDS in private subnets, ECR, Route 53, ACM, with remote state and a l…
  - `[ ] OPS-001/T2` — The deploy sequence: migrate as a one-off task on the same image, then the new task set, health-checked before it takes…
  - `[ ] OPS-001/T3` — A short DNS TTL set a day before the cutover, and `main` left deployable for a month after
  - `[ ] OPS-001/T4` — Secrets from Secrets Manager by ARN; values set by the owner, never in Terraform state or the image
  - `[ ] OPS-001/T5` — The six post-deploy checks, run against the real deployment through Cloudflare
  - `[ ] OPS-001/T6` — A staging service carrying `APP_ENV=staging`, so the console says which one it is
  - `[ ] OPS-001/T7` — RDS unreachable from outside the VPC, proved by attempting it rather than by reading the security group

- **SITE-006** · Legal pages and the consent surface — 0/6 closed · depth 10
  - `[ ] SITE-006/T1` — Three legal pages in twenty locales, through the parity gate, linked in a footer row of their own
  - `[ ] SITE-006/T2` — The banner: three categories, `necessary` fixed, three controls of equal weight, no dismissal without an answer
  - `[ ] SITE-006/T3` — The banner is not first in the tab order, does not trap focus, and carries state without relying on colour
  - `[ ] SITE-006/T4` — The stored choice read in a `try`/`catch`; an unreadable store means no answer, and nothing non-essential loads
  - `[ ] SITE-006/T5` — A control on `legal/cookies` that changes the answer, and a footer link that reaches it
  - `[ ] SITE-006/T6` — The legal pages print in black on white
