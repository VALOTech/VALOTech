# VALO Tech — roadmap

> **Generated** by `scripts/generate-roadmap.py` from [docs/tasks.md](tasks.md), the design graph under [docs/designs/](designs/) and [docs/roadmap-policy.yaml](roadmap-policy.yaml). Do not edit it: the next regeneration discards the edit, and until then the queue disagrees with the ledger. To change the order, change the dependency or the policy.

> **Not for `main`.** This file lives on `development` only (`.claude/CLAUDE.md` §1.1).

Ordering only. What each task *is* lives in [docs/tasks.md](tasks.md); why the product wants it lives in [docs/PRD.md](PRD.md). Nothing is restated here. A wave is a band of the dependency graph's depth: everything in `W(n)` can be built once `W(n-1)` stands. Within a wave, features are ordered by depth and tasks by state — in-progress first, then open, then blocked. Closed tasks are omitted.

**Active wave: W0 — The ground**

_261 tasks in the plan, 45 closed, 216 outstanding._

---

## W0 — The ground · **ACTIVE**

_What nothing else stands on. The page that already serves and its cross-cutting layers are here because nothing depends on them; the local stack, the schema and credential handling are here because everything does. This wave is finished when a developer brings the stack up with one command and a migration has been applied and rolled back — not written, run, because a rollback nobody has executed is not a rollback._

_23/47 closed (48%) · 24 outstanding — 22 buildable now · 0 waiting on the owner · 1 external residue · 1 parked to a later wave._

- **INFRA-001** · Local development stack — 0/5 closed · depth 0
  - `[~] INFRA-001/T1` — PostgreSQL 17 on 5434 under docker-compose, with a named volume and a health check  · **Note:** `make infra-up` starts PostgreSQL 17 on 5434 — the row this repository claimed in `docs/ECOSYSTEM.md`, not the engine's default, because two compose…
  - `[~] INFRA-001/T2` — `env.example` names every variable the application reads, with what its absence means  · **Note:** written and complete for the variables the designs name — app, database, session, rate limit — each with whether it is required and what a missing on…
  - `[ ] INFRA-001/T3` — Make targets for up, down, reset, and the three migration commands
  - `[ ] INFRA-001/T4` — `make migrate-roundtrip` applies, rolls back and re-applies against a throwaway database
  - `[ ] INFRA-001/T5` — A first-run path that works from a fresh clone with no prior state

- **SITE-001** · The gateway page — 8/8 closed
- **A11Y-001** · Accessibility baseline — 5/5 closed
- **CRED-001** · Credential handling — 0/5 closed · depth 1
  - `[~] CRED-001/T1` — One module reads the environment once, validates it, and exports a frozen object  · **Note:** the rule and the three credentials are written in `credentials/README.md`, and `credentials/credential-input.html` generates what can be generated an…
  - `[ ] CRED-001/T2` — A required variable that is absent stops the application before it listens, naming the variable
  - `[ ] CRED-001/T3` — An absent optional credential disables its feature with a stated reason, and the system stays up
  - `[ ] CRED-001/T4` — A credential never reaches a log, an error message or a response, including through generic serialisation
  - `[ ] CRED-001/T5` — `credentials/README.md` says what the owner sets, and the local input form writes `.env` without the value crossing a c…

- **DATA-001** · Schema and migrations — 0/12 closed · depth 1
  - `[ ] DATA-001/T1` — Choose and wire the migration tool; one command applies and one rolls back
  - `[ ] DATA-001/T2` — Accounts table: identity, role, state, created and updated
  - `[ ] DATA-001/T3` — Sessions table, or the session store the auth library needs
  - `[ ] DATA-001/T4` — Content items and their revisions, with the published revision named by a pointer
  - `[ ] DATA-001/T5` — Content grants and the audience constraint
  - `[ ] DATA-001/T6` — Locale rows carrying a review state a query can filter on
  - `[ ] DATA-001/T7` — Mail log and unsubscribe state
  - `[ ] DATA-001/T8` — Audit table, append-only, with a database-level guard against update and delete
  - `[ ] DATA-001/T9` — Configuration table with a recorded prior value
  - `[ ] DATA-001/T10` — Every migration has a down-migration that has been run
  - `[ ] DATA-001/T11` — Media and its references, with the audience reached by join
  - `[ ] DATA-001/T12` — The portfolio state table

- **I18N-001** · Twenty-locale runtime dictionary — 3/4 closed · depth 1
  - `[!] I18N-001/T4` — Eleven locales read as prose, sentence by sentence, by someone who speaks them  · _external_ · **Blocked by:** pending-external: a native reader for `es`, `pt`, `ru`, `tr`, `id`, `ms`, `tl`, `th`, `ar`, `ja` and `zt`. All eleven pass every mechanical class in…

- **SITE-002** · Public and investor chapter split — 3/4 closed · depth 1
  - `[!] SITE-002/T4` — The split is enforced by the server rather than by CSS  · _cross-wave-parked_ · **Blocked by:** AUTH-002/T1

- **SITE-003** · Chapter sequence — 2/2 closed
- **SITE-004** · The contact close — 2/2 closed
## W1 — The door

_Who may read what, and what records that they did. Everything above reads through the gate this wave builds, so a shortcut here is a shortcut in every feature after it. Sign-out precedes invitation deliberately: a session that cannot be ended server-side is a defect that grows with every account created. The scene sits here too, one layer above the page it moves behind._

_22/69 closed (31%) · 47 outstanding — 46 buildable now · 1 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **AUTH-001** · Sign-in — 0/5 closed · depth 2
  - `[ ] AUTH-001/T1` — Password hashing at the current cost, verified against a known vector
  - `[ ] AUTH-001/T2` — Sign-in route: identical failure for an unknown account and a wrong password
  - `[ ] AUTH-001/T3` — Rate limit per account and per address, with the limit stated in config
  - `[ ] AUTH-001/T4` — The sign-in form, in twenty languages, keyboard-reachable, with an accessible name on every field
  - `[ ] AUTH-001/T5` — Regression test: a wrong password and an unknown account are indistinguishable in status, body and timing

- **DATA-003** · Backup and restore — 0/5 closed · depth 2
  - `[ ] DATA-003/T1` — A daily dump, encrypted before it leaves the host, to a target from the environment
  - `[ ] DATA-003/T2` — Seven daily, four weekly, twelve monthly, enforced rather than intended
  - `[ ] DATA-003/T3` — `make restore-rehearsal` into a throwaway database, asserting schema and row counts, printing the elapsed time
  - `[ ] DATA-003/T4` — `make doctor` reports the last successful backup and the last successful rehearsal, and fails the second after two mont…
  - `[ ] DATA-003/T5` — A restore runbook whose every command was executed in the rehearsal, with measured timings

- **I18N-002** · Served-copy parity gate — 2/2 closed
- **SCENE-001** · The world and its journey — 6/6 closed
- **SEC-002** · Audit log — 0/5 closed · depth 2
  - `[ ] SEC-002/T1` — The table, the closed action vocabulary, and the append-only trigger
  - `[ ] SEC-002/T2` — The application role holds no UPDATE or DELETE on it
  - `[ ] SEC-002/T3` — One insert function, called inside the caller's transaction, with no error discarded
  - `[ ] SEC-002/T4` — Only changed fields are recorded, and no personal data reaches the trail
  - `[ ] SEC-002/T5` — The admin view: newest first, filterable by actor, subject and action, with no edit or delete control

- **AUTH-002** · Session and role gate — 0/4 closed · depth 3
  - `[ ] AUTH-002/T1` — Session cookie: httpOnly, SameSite=Lax, Secure, rotated on sign-in
  - `[ ] AUTH-002/T2` — Server-side invalidation, so a stolen cookie dies on sign-out
  - `[ ] AUTH-002/T3` — Role gate at the query, not the template; a helper that cannot be forgotten
  - `[ ] AUTH-002/T4` — Isolation test: an investor request for another investor's deck returns nothing, not a redirect

- **AUTH-003** · Invitation and password reset — 0/7 closed · depth 3
  - `[ ] AUTH-003/T1` — Token generation, hashing, and storage that never holds a usable token
  - `[ ] AUTH-003/T2` — Single-use consumption in one atomic statement, with expiry in the same predicate
  - `[ ] AUTH-003/T4` — The set-password form, its policy, and the sign-in that follows
  - `[ ] AUTH-003/T5` — Reset answers identically for an address that exists and one that does not
  - `[ ] AUTH-003/T6` — A new invitation invalidates every outstanding one for that account
  - `[ ] AUTH-003/T7` — With no mail credential, the invitation is still created and its link is shown to the admin
  - `[!] AUTH-003/T3` — The mail that carries the link, in the invitee's locale  · _pending-decision_ · **Blocked by:** pending-decision: `MAIL-DEC-01` — [decisions-log.md#MAIL-DEC-01](decisions-log.md#MAIL-DEC-01). The invitation itself is built and the token is issue…

- **SCENE-002** · Satellites and their rings — 2/2 closed
- **SCENE-003** · The sky — 3/3 closed
- **SCENE-005** · Orbit stages — 4/4 closed
- **SCENE-006** · The mapping stage — 2/2 closed
- **ADMIN-002** · Admin console shell — 0/5 closed · depth 4
  - `[ ] ADMIN-002/T1` — A `/admin` segment layout whose role check every page inherits, answering `404` to a non-admin
  - `[ ] ADMIN-002/T2` — The seven destinations, with the landing surface listing what needs attention
  - `[ ] ADMIN-002/T3` — One destructive-action component, naming the subject, with a typed confirmation for the three that cannot be undone
  - `[ ] ADMIN-002/T4` — An environment bar wherever `APP_ENV` is not production
  - `[ ] ADMIN-002/T5` — Console chrome in English, with the exception stated where a reader will find it

- **AUTH-004** · Sign-out — 0/5 closed · depth 4
  - `[ ] AUTH-004/T1` — POST sign-out deletes the session row, then expires the cookie
  - `[ ] AUTH-004/T2` — The session list shows this account's live sessions and marks the current one
  - `[ ] AUTH-004/T3` — Ending every session, including this one, in one action
  - `[ ] AUTH-004/T4` — Every authenticated response is `no-store`, verified by pressing the back button
  - `[ ] AUTH-004/T5` — Signing out twice succeeds; there is no already-signed-out error

- **CMS-001** · Content model and revisions — 0/6 closed · depth 4
  - `[ ] CMS-001/T1` — Items, revisions, and a published pointer that is the only thing a reader query consults
  - `[ ] CMS-001/T2` — The closed block vocabulary and its validator, rejecting an unknown block on write
  - `[ ] CMS-001/T3` — Marks as offsets over plain text, so a paragraph stays one translatable string
  - `[ ] CMS-001/T4` — `saveDraft` replaces the open draft rather than accumulating a revision per save
  - `[ ] CMS-001/T5` — `publish` and `withdraw` as pointer moves, with the previous revision intact
  - `[ ] CMS-001/T6` — Every read function takes the reader; none exists that does not

- **SCENE-004** · Annotation chips — 3/3 closed
- **SEC-001** · Security baseline — 0/5 closed · depth 4
  - `[~] SEC-001/T3` — Every route parses its input with a schema, and the handler sees only the parsed value  · **Note:** secret scanning runs on every push and pull request — gitleaks over full history, the binary pinned to release 8.30.0 rather than the published actio…
  - `[ ] SEC-001/T1` — One middleware sets every header on every response, with no route exempt
  - `[ ] SEC-001/T2` — The CSP carries no `unsafe-inline`, and the page is verified in a browser under it
  - `[ ] SEC-001/T4` — Rate limits on sign-in, reset and invitation, per account and per address, refusing identically
  - `[ ] SEC-001/T5` — `gitleaks`, dependency audit and type check in CI, with every action pinned to a verified SHA

## W2 — The desk

_The machinery every kind of writing shares — the editor, the media, the locale states, the audience rule, publishing, search — plus the account, configuration and logging surfaces an operator needs before anything is published. Building it once is the whole reason a report, an update and a deck are three navigations over one system rather than three systems._

_0/62 closed (0%) · 62 outstanding — 62 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **ADMIN-001** · Account management — 0/7 closed · depth 5
  - `[ ] ADMIN-001/T1` — The list, sortable by last sign-in, with role and state
  - `[ ] ADMIN-001/T2` — The person page: identity, access, sessions, actions
  - `[ ] ADMIN-001/T3` — Suspending ends every live session in the same transaction
  - `[ ] ADMIN-001/T4` — Deletion is a real delete; the confirmation lists what goes and what remains, and takes the typed name
  - `[ ] ADMIN-001/T5` — Deleting the last admin, or yourself, is refused
  - `[ ] ADMIN-001/T6` — Creation issues an invitation; no admin ever sets another person's password
  - `[ ] ADMIN-001/T7` — A role change rotates the session and is audited

- **CFG-001** · Runtime configuration — 0/6 closed · depth 5
  - `[ ] CFG-001/T1` — The table with a previous-value column, and defaults declared in code beside the keys
  - `[ ] CFG-001/T2` — Change validates against the key's type and bounds, refusing rather than clamping
  - `[ ] CFG-001/T3` — Change and revert are one transaction each, audited with both values
  - `[ ] CFG-001/T4` — Revert is one action with no confirmation, and is itself recorded
  - `[ ] CFG-001/T5` — One cached accessor with a short refresh; an empty table yields a working application
  - `[ ] CFG-001/T6` — The accessor refuses a secret-shaped key

- **CMS-003** · Media library — 0/7 closed · depth 5
  - `[ ] CMS-003/T1` — Upload sniffs the type from the bytes, and refuses anything outside the accepted set
  - `[ ] CMS-003/T2` — Raster images are re-encoded, so EXIF and its location do not survive
  - `[ ] CMS-003/T3` — SVG is parsed and stripped to shape and text, or refused
  - `[ ] CMS-003/T4` — Storage keyed by content hash, so a duplicate upload is one row
  - `[ ] CMS-003/T5` — Serving joins through references and composes the audience predicate, answering `404` on no match
  - `[ ] CMS-003/T6` — Cache headers follow the audience; nothing gated is cacheable
  - `[ ] CMS-003/T7` — Deletion is refused while a reference exists, and is audited when it is not

- **CMS-005** · Locale variants and translation state — 0/6 closed · depth 5
  - `[ ] CMS-005/T1` — Locale rows per revision, with a state a query filters on rather than infers
  - `[ ] CMS-005/T2` — A `machine` row is never reachable by any reader path
  - `[ ] CMS-005/T3` — Drafting translates block text and reassembles marks by span, never by offset arithmetic
  - `[ ] CMS-005/T4` — The review screen shows source beside translation, editable, marked one locale at a time
  - `[ ] CMS-005/T5` — Serving falls back to the authored language and says so to the reader
  - `[ ] CMS-005/T6` — A new revision starts with no locale rows, and the grid shows it

- **CMS-006** · Audience and access — 0/6 closed · depth 5
  - `[ ] CMS-006/T1` — One predicate builder from a reader, with the published check inside it
  - `[ ] CMS-006/T2` — Reader and author read paths as separate functions, so admin-sees-all cannot leak into a shared one
  - `[ ] CMS-006/T3` — The grant subquery, and the admin surface that writes and revokes grants
  - `[ ] CMS-006/T4` — A refusal is a `404`, and it is the same `404` for an item that does not exist
  - `[ ] CMS-006/T5` — A CI gate refuses SQL naming `content_items` outside the repository module
  - `[ ] CMS-006/T6` — Narrowing an audience is audited, and public content carries a short cache lifetime

- **OPS-002** · Logging and monitoring — 0/6 closed · depth 5
  - `[ ] OPS-002/T1` — One JSON logger to stdout, with a closed event vocabulary and no `console.log` anywhere
  - `[ ] OPS-002/T2` — A request id generated at the edge and carried through every line of that request
  - `[ ] OPS-002/T3` — Explicit fields, never serialised objects, plus a scrubber on the way out
  - `[ ] OPS-002/T4` — A scrubber hit raises an alert naming the event, so the caller is fixed rather than the scrubber
  - `[ ] OPS-002/T5` — `/health` runs a real query and reports the build version, and nothing else
  - `[ ] OPS-002/T6` — Three alerts, each with its action written beside it

- **CMS-002** · Authoring surface — 0/7 closed · depth 6
  - `[ ] CMS-002/T1` — A block list the author operates by keyboard, with each block's type visible
  - `[ ] CMS-002/T2` — The seven block types, each with the fields its schema requires
  - `[ ] CMS-002/T3` — An image block cannot be saved without alternative text
  - `[ ] CMS-002/T4` — Marks by selection, stored as offsets, with the editor's model the block array and not the DOM
  - `[ ] CMS-002/T5` — Paste imports plain text plus recognised structure and nothing else
  - `[ ] CMS-002/T6` — Explicit save, a visible unsaved state, and a local copy offered back after a closed tab
  - `[ ] CMS-002/T7` — One schema module validates in the browser and on the server, and the server's error names the block and the field

- **CMS-004** · Preview, publish and withdraw — 0/6 closed · depth 6
  - `[ ] CMS-004/T1` — Preview renders through the reader's own components and evaluates the audience rule as the chosen role
  - `[ ] CMS-004/T2` — Preview is admin-only, with no token and no shareable link
  - `[ ] CMS-004/T3` — Publish validates, moves the pointer and audits, in one transaction, taking an explicit revision
  - `[ ] CMS-004/T4` — The confirmation names what is replaced and how many locales will fall back
  - `[ ] CMS-004/T5` — Withdraw returns to the previous published revision, or states plainly that nothing will be visible
  - `[ ] CMS-004/T6` — A public item's cache is purged on publish and on withdraw

- **CMS-007** · Search and filter in the room — 0/6 closed · depth 6
  - `[ ] CMS-007/T1` — A generated `tsvector` over flattened block text, so the index cannot drift from the content
  - `[ ] CMS-007/T2` — The search query composes `CMS-006`'s predicate as its first clause, and lives in the repository module
  - `[ ] CMS-007/T3` — Kind, product, period and type filters, composing into one statement
  - `[ ] CMS-007/T4` — Only the published revision is findable; a draft is not, including by its author
  - `[ ] CMS-007/T5` — The empty state names what narrowed the result and offers to widen it
  - `[ ] CMS-007/T6` — The field is labelled, keyboard-operable, and announces its result count

- **DATA-002** · Erasure and retention — 0/5 closed · depth 6
  - `[ ] DATA-002/T1` — The manifest: every table, what it holds, and what erasure does to it
  - `[ ] DATA-002/T2` — One erasure function driven by the manifest, with the schema's `on delete` matching it
  - `[ ] DATA-002/T3` — A gate comparing the manifest against the live schema, with exemptions written rather than patterns loosened
  - `[ ] DATA-002/T4` — Scheduled deletion enforcing each retention window
  - `[ ] DATA-002/T5` — Content authored by an erased account survives with a null author

## W3 — What is written

_The three content types, and the compliance posture that governs what is held about the people reading them. Updates come before decks, and not only because they are the simpler shape of the same problem: they are what the room is for. An investor signs in to find out what has happened since they last looked._

_0/45 closed (0%) · 45 outstanding — 45 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **DECK-001** · Deck authoring — 0/5 closed · depth 7
  - `[ ] DECK-001/T1` — Sections derived from level-2 headings, with the block array the single source
  - `[ ] DECK-001/T2` — An overview of section cards in order, showing heading, first line and what each carries
  - `[ ] DECK-001/T3` — Reordering by drag and by keyboard, writing back to the block array
  - `[ ] DECK-001/T4` — Section, word and figure counts in the overview
  - `[ ] DECK-001/T5` — Speaker context per section, stripped in the investor read path and proven by a test

- **LEGAL-SG-001** · PDPA posture — 0/6 closed · depth 7
  - `[ ] LEGAL-SG-001/T1` — The privacy notice: what is held, why, how long, who to write to, in twenty locales
  - `[ ] LEGAL-SG-001/T2` — The notice is linked from the sign-in page and the room's footer
  - `[ ] LEGAL-SG-001/T3` — The four rights answered within thirty days, with the admin path for each written down
  - `[ ] LEGAL-SG-001/T4` — A named DPO recorded, and published in the notice
  - `[ ] LEGAL-SG-001/T5` — A breach runbook with the assessment steps and both notification paths
  - `[ ] LEGAL-SG-001/T6` — The backup window disclosed in the notice rather than omitted

- **POST-001** · Update authoring — 0/6 closed · depth 7
  - `[ ] POST-001/T1` — A composer that opens with the cursor in the body and fits without scrolling
  - `[ ] POST-001/T2` — Kind is required and chosen before writing; three kinds, no more
  - `[ ] POST-001/T3` — An optional product tag from the six, plus the company
  - `[ ] POST-001/T4` — The title derives from the first line until it is edited separately
  - `[ ] POST-001/T5` — A soft length marker that offers to move the text into the current draft report
  - `[ ] POST-001/T6` — The tagged product's current progress value is shown beside the composer

- **RPT-001** · Investor report authoring — 0/5 closed · depth 7
  - `[ ] RPT-001/T1` — Create a report against a period, with the period fixed at creation
  - `[ ] RPT-001/T2` — A new report is prefilled with the previous period's structure and none of its text
  - `[ ] RPT-001/T3` — Metrics are `figure` blocks carrying their numbers as data
  - `[ ] RPT-001/T4` — The progress board's current values are shown beside the section that narrates them
  - `[ ] RPT-001/T5` — Making a report public states in words what that means

- **DECK-002** · Deck versioning and publishing — 0/6 closed · depth 8
  - `[ ] DECK-002/T1` — A monotonic version assigned at publication, never reused, holes kept
  - `[ ] DECK-002/T2` — An optional pinned version on a grant; unpinned readers get the current one
  - `[ ] DECK-002/T3` — An unpinned reader is told once when the version changed, with what changed by section
  - `[ ] DECK-002/T4` — A read record per account per version, deleted with the account
  - `[ ] DECK-002/T5` — The publish confirmation names every investor who will see the new version
  - `[ ] DECK-002/T6` — Withdrawal does not break a pin to the withdrawn version

- **LEGAL-GLOBAL-001** · GDPR posture for EU investors — 0/5 closed · depth 8
  - `[ ] LEGAL-GLOBAL-001/T1` — The notice carries the additional GDPR statements, in twenty locales
  - `[ ] LEGAL-GLOBAL-001/T2` — An admin-generated JSON export of everything held about one person
  - `[ ] LEGAL-GLOBAL-001/T3` — An objection flag that stops read-tracking and deletes the existing rows
  - `[ ] LEGAL-GLOBAL-001/T4` — The breach runbook uses the 72-hour clock for everyone
  - `[ ] LEGAL-GLOBAL-001/T5` — A one-page record of processing, and a written statement of what is deliberately not claimed

- **POST-002** · Update publishing and audience — 0/6 closed · depth 8
  - `[ ] POST-002/T1` — Audience on the item, with the predicate from `CMS-006` on every read
  - `[ ] POST-002/T2` — The stream pages by keyset on `(published_at, id)`, never by offset
  - `[ ] POST-002/T3` — Ordered by publication rather than creation
  - `[ ] POST-002/T4` — The gateway's public news is the same query with an anonymous reader
  - `[ ] POST-002/T5` — Narrowing states what it cannot recall; widening states what becomes public
  - `[ ] POST-002/T6` — Unread marking from the per-account read state, and a paging control rather than infinite scroll

- **RPT-002** · Report periods and archive — 0/6 closed · depth 8
  - `[ ] RPT-002/T1` — A partial unique index gives one published report per period, and drafts are exempt
  - `[ ] RPT-002/T2` — Publishing into a taken period fails with the report that holds it and the two real choices
  - `[ ] RPT-002/T3` — The archive lists by period, groups by year, and shows a period with no report as a gap
  - `[ ] RPT-002/T4` — The room's current report is the most recent period the reader may read, not the most recent publication
  - `[ ] RPT-002/T5` — Withdrawal states that the period becomes a gap and which report becomes current
  - `[ ] RPT-002/T6` — A per-account read state, used only in the list, and deleted with the account

## W4 — The room

_The reading surfaces, the room they sit in, and the gateway served by the application — which is what finally makes the gate on the two hidden chapters real rather than a stylesheet. This wave ends with the product complete and still unpublished; what publishes it is outside the waves, waiting on the owner._

_0/38 closed (0%) · 38 outstanding — 38 buildable now · 0 waiting on the owner · 0 external residue · 0 parked to a later wave._

- **DECK-003** · Deck reading — 0/5 closed · depth 9
  - `[ ] DECK-003/T1` — One column with sections in order, the version and date on the page
  - `[ ] DECK-003/T2` — A contents list that marks the current section by reading position, not by a threshold
  - `[ ] DECK-003/T3` — A next-section control that moves the reading position and nothing else
  - `[ ] DECK-003/T4` — The change notice for an unpinned reader whose version moved
  - `[ ] DECK-003/T5` — The print stylesheet shared with `RPT-003` where the rules are the same

- **DECK-004** · Deck access grants — 0/6 closed · depth 9
  - `[ ] DECK-004/T1` — Grant and revoke, audited, with the pinned version optional
  - `[ ] DECK-004/T2` — The confirmation states in words what the person will be able to read, including the version
  - `[ ] DECK-004/T3` — A grant to a suspended account is refused with the reason; to an invited one it is allowed
  - `[ ] DECK-004/T4` — The from-the-deck view, showing pin, granter, date and when last opened
  - `[ ] DECK-004/T5` — The from-the-account view, listing every deck a person may read
  - `[ ] DECK-004/T6` — Bulk grant with the names shown before it commits, and no bulk revoke

- **INV-001** · Investor room shell — 0/5 closed · depth 9
  - `[ ] INV-001/T1` — The landing surface: what is new, where things stand, the current report, your decks
  - `[ ] INV-001/T2` — Empty and error states are different renderings, each saying which it is
  - `[ ] INV-001/T3` — Flat navigation over four destinations, with the current one marked
  - `[ ] INV-001/T4` — The room's chrome is the gateway's, with no scene
  - `[ ] INV-001/T5` — An expired session returns the reader to where they were going

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
  - `[!] INV-002/T1` — The gated components are not called for a reader who may not see them  · _in-graph_ · **Blocked by:** AUTH-002/T3

- **INV-003** · Portfolio progress — 0/5 closed · depth 10
  - `[ ] INV-003/T1` — Six rows, a constrained product and a closed four-word stage vocabulary
  - `[ ] INV-003/T2` — Editing one product at a time, audited with the previous stage and headline
  - `[ ] INV-003/T3` — A changed stage offers a prefilled progress update, and can be declined
  - `[ ] INV-003/T4` — All six always render, including paused, with an absent row filled rather than dropped
  - `[ ] INV-003/T5` — Stage is carried by a word as well as by colour, and the board states when it last changed

## Outside the waves

_A design whose status is `pending-decision`, `pending-external` or `deprecated` takes no wave, so a feature waiting on the owner cannot hold a wave open. Its tasks stay claimable the moment the blocker clears._

- **LEGAL-GLOBAL-002** · Cookie and analytics posture — status `pending-decision` · 0/3 closed · 3 outstanding
- **MAIL-001** · Investor mail — status `pending-decision` · 0/7 closed · 7 outstanding
- **MAIL-002** · Mail log and unsubscribe — status `pending-decision` · 0/6 closed · 6 outstanding
- **OPS-001** · Hosting and deploy — status `pending-decision` · 0/6 closed · 6 outstanding
