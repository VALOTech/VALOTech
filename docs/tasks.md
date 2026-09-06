# VALO Tech — Tasks

> **Not for `main`.** This document lives on `development` only (`.claude/CLAUDE.md` §1.1).
> **Purpose:** track every implementation task that realizes [docs/PRD.md](PRD.md). A task closes only with concrete `Evidence:`.
> **Companions:** [docs/PRD.md](PRD.md) · [docs/decisions-log.md](decisions-log.md) · [docs/designs/](designs/) · [.claude/CLAUDE.md](../.claude/CLAUDE.md) §3.6 and §4.

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

## SITE-001 · The gateway page
Design: [docs/designs/site/site-001-the-gateway-page.md](designs/site/site-001-the-gateway-page.md) · PRD: `SITE-001`, `SITE-003`, `SITE-004`

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
- [x] SITE-001/T6 — A frame past 2000px shows a larger page rather than a further one, in every element the frame carries
  Evidence: assets/site.css:@media (min-width: 2000px) · docs/decisions-log.md#SITE-DEC-02 — measured at 3840 x 2160: `.sun` 739px, `.hero-aside .marker` 422px, `#people .chapter-head` 686px, all previously flat at their 1440-tuned widths while the display face grew 32%
- [x] SITE-001/T8 — Gateway is defined as a theme: two panel families, the type roles, and every deviation from the reference named with its measurement
  Evidence: brand/GUIDELINES.md — ground, panels, accent, text, type, scale, space, motion and contrast, with the three opacity deviations from the reference stated in one table
- [x] SITE-001/T7 — The brand kit cannot publish a value the stylesheet has stopped using, and cannot omit one it declares
  Evidence: scripts/check-brand-tokens.py — 39 tokens verified against `assets/site.css`, wired into `make check`; proved able to fail on a drifted value, on a token the kit invents, and on a name one kit file publishes and the other does not

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

## SITE-003 · Chapter sequence
Design: [docs/designs/site/site-003-chapter-sequence.md](designs/site/site-003-chapter-sequence.md) · PRD: `SITE-003`

- [x] SITE-003/T1 — Nine sections in the reference order, each declaring the side its argument holds
  Evidence: index.html — problem, approach, deliver, people, trust, workforce, valostack, outcome, ecosystem
- [x] SITE-003/T2 — Two chapters gated, and the journey spans them when they are folded
  Evidence: assets/scene/boot.js:CHAPTER_SPINE — a station whose chapter has no layout box is dropped from the route, so the world does not stop at a section the reader cannot see

## SITE-004 · The contact close
Design: [docs/designs/site/site-004-contact-close.md](designs/site/site-004-contact-close.md) · PRD: `SITE-004`

- [x] SITE-004/T1 — The close carries the offer, the call to action, and the reason prices are not published
  Evidence: index.html:engage · docs/decisions-log.md#SITE-DEC-03
- [x] SITE-004/T2 — Company, contact and ecosystem links, with the legal line beneath
  Evidence: index.html:footer-legal

## SCENE-001 · The world and its journey

Design: [docs/designs/scene/scene-001-world-and-journey.md](designs/scene/scene-001-world-and-journey.md) · PRD: `SCENE-001`

- [x] SCENE-001/T1 — A lunar sphere becomes Earth across one scroll scrub, with a lit frontier
  Evidence: assets/scene/planet.js:TRANSITION_GLSL
- [x] SCENE-001/T2 — The journey is measured in chapters, not page fractions
  Evidence: assets/scene/boot.js:CHAPTER_SPINE
- [x] SCENE-001/T3 — The journey is read ahead of the reader so each chapter's disc is standing when its heading arrives
  Evidence: assets/scene/boot.js:LEAD_EASE
- [x] SCENE-001/T4 — A jump is placed rather than eased
  Evidence: commit e180555
- [x] SCENE-001/T5 — The world's size follows the frame, with no flat ceiling and a floor that cannot shrink a tuned size
  Evidence: assets/site.css:--planet · docs/decisions-log.md#SITE-DEC-02 — 994px at 3840 x 2160 and 432px at 1440 x 900, 46% and 48% of the frame height; satellites re-measured over the larger disc at three points of the orbit stage, minimum pairwise gap 8px, none off-frame
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

## SCENE-004 · Annotation chips
Design: [docs/designs/scene/scene-004-annotation-chips.md](designs/scene/scene-004-annotation-chips.md) · PRD: `SCENE-004`

- [x] SCENE-004/T1 — Fifteen chips across five chapters, each pinned to one body
  Evidence: assets/site.js:chips-showing
- [x] SCENE-004/T2 — Only one chapter names the bodies at a time, chosen by the reading line
  Evidence: assets/site.js — the chapter containing the reading line wins, rather than the first one intersecting the viewport, so a long chapter cannot hold the labels while the reader is in the next
- [x] SCENE-004/T3 — A chip opens away from the disc, and never clamps
  Evidence: assets/site.js:discRadius

## SCENE-006 · The mapping stage
Design: [docs/designs/scene/scene-006-mapping-stage.md](designs/scene/scene-006-mapping-stage.md) · PRD: `SCENE-006`

- [x] SCENE-006/T1 — A sticky three-column stage with a centre channel the world stands in
  Evidence: assets/site.css:--fit-channel
- [x] SCENE-006/T2 — Five pairs arriving one at a time, each side from its own edge
  Evidence: assets/site.css:.fit-row

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
  Evidence: assets/i18n.js — coverage, brand preservation, register, typography, script, product-term consistency and English function-word leakage; `ko`, `ur`, `hi`, `bn`, `fr` and `de` corrected
- [!] I18N-001/T4 — Eleven locales read as prose, sentence by sentence, by someone who speaks them
  Blocked by: pending-external: a native reader for `es`, `pt`, `ru`, `tr`, `id`, `ms`, `tl`, `th`, `ar`, `ja` and `zt`. All eleven pass every mechanical class in `I18N-001/T3`; what no mechanical pass can see is a sentence that is correct and lifeless. Unblocks when a reader is available per locale — the eleven are independent, so the task closes locale by locale.

---

## I18N-002 · Served-copy parity gate
Design: [docs/designs/i18n/i18n-002-served-copy-parity-gate.md](designs/i18n/i18n-002-served-copy-parity-gate.md) · PRD: `I18N-002`

- [x] I18N-002/T1 — The check fails on markup drift, on locale parity loss, and on a moved node count
  Evidence: scripts/sync-static-copy.mjs — 245 localized nodes in index.html and twenty locales in 404.html, all three failure modes exercised
- [x] I18N-002/T2 — It runs in the pre-push hook and in CI
  Evidence: .githooks/pre-push · .github/workflows/ci.yml

## A11Y-001 · Accessibility baseline
Design: [docs/designs/a11y/a11y-001-accessibility-baseline.md](designs/a11y/a11y-001-accessibility-baseline.md) · PRD: `A11Y-001`

- [x] A11Y-001/T1 — Keyboard reach and a focus ring measured against the panel, not the void
  Evidence: assets/site.css:focus-visible — a ring tuned against the page ground disappears the moment the control sits on a panel, which is where most of them are
- [x] A11Y-001/T2 — Contrast measured against the painted pixel across five label chapters
  Evidence: assets/site.css — panel fill is opaque enough that the planet never reads through the right-hand side of a paragraph
- [x] A11Y-001/T3 — Reduced motion slows the scene and shows every chapter as a stacked list
  Evidence: assets/site.css:prefers-reduced-motion · assets/scene/boot.js
- [x] A11Y-001/T4 — Reveals and the nav mark read position directly rather than waiting for a threshold
  Evidence: assets/site.js — an IntersectionObserver is notified only when a ratio crosses a threshold, so a flick that carries a block from below the fold to above it in one frame crosses nothing and the block never appears
- [x] A11Y-001/T5 — A print stylesheet in black on white
  Evidence: assets/site.css:@media print

## DATA-001 · Schema and migrations

Design: [docs/designs/data/data-001-schema-and-migrations.md](designs/data/data-001-schema-and-migrations.md) · PRD: `DATA-001`

- [ ] DATA-001/T1 — Choose and wire the migration tool; one command applies and one rolls back
- [ ] DATA-001/T2 — Accounts table: identity, role, state, created and updated
- [ ] DATA-001/T3 — Sessions table, or the session store the auth library needs
- [ ] DATA-001/T4 — Content items and their revisions, with the published revision named by a pointer
- [ ] DATA-001/T5 — Content grants and the audience constraint
- [ ] DATA-001/T6 — Locale rows carrying a review state a query can filter on
- [ ] DATA-001/T7 — Mail log and unsubscribe state
- [ ] DATA-001/T8 — Audit table, append-only, with a database-level guard against update and delete
- [ ] DATA-001/T9 — Configuration table with a recorded prior value
- [ ] DATA-001/T10 — Every migration has a down-migration that has been run
- [ ] DATA-001/T11 — Media and its references, with the audience reached by join
- [ ] DATA-001/T12 — The portfolio state table

## AUTH-001 · Sign-in
Design: [docs/designs/auth/auth-001-sign-in.md](designs/auth/auth-001-sign-in.md) · PRD: `AUTH-001`, `SEC-R01`, `SEC-R03`

- [ ] AUTH-001/T1 — Password hashing at the current cost, verified against a known vector
- [ ] AUTH-001/T2 — Sign-in route: identical failure for an unknown account and a wrong password
- [ ] AUTH-001/T3 — Rate limit per account and per address, with the limit stated in config
- [ ] AUTH-001/T4 — The sign-in form, in twenty languages, keyboard-reachable, with an accessible name on every field
- [ ] AUTH-001/T5 — Regression test: a wrong password and an unknown account are indistinguishable in status, body and timing

## AUTH-002 · Session and role gate
Design: [docs/designs/auth/auth-002-session-and-role-gate.md](designs/auth/auth-002-session-and-role-gate.md) · PRD: `AUTH-002`, `SEC-R02`, `DATA-R05`

- [ ] AUTH-002/T1 — Session cookie: httpOnly, SameSite=Lax, Secure, rotated on sign-in
- [ ] AUTH-002/T2 — Server-side invalidation, so a stolen cookie dies on sign-out
- [ ] AUTH-002/T3 — Role gate at the query, not the template; a helper that cannot be forgotten
- [ ] AUTH-002/T4 — Isolation test: an investor request for another investor's deck returns nothing, not a redirect

## AUTH-003 · Invitation and password reset
PRD: `AUTH-003`

- [ ] AUTH-003/T1 — Token generation, hashing, and storage that never holds a usable token
- [ ] AUTH-003/T2 — Single-use consumption in one atomic statement, with expiry in the same predicate
- [ ] AUTH-003/T3 — The mail that carries the link, in the invitee's locale
- [ ] AUTH-003/T4 — The set-password form, its policy, and the sign-in that follows
- [ ] AUTH-003/T5 — Reset answers identically for an address that exists and one that does not
- [ ] AUTH-003/T6 — A new invitation invalidates every outstanding one for that account
- [ ] AUTH-003/T7 — With no mail credential, the invitation is still created and its link is shown to the admin

## AUTH-004 · Sign-out
PRD: `AUTH-004`

- [ ] AUTH-004/T1 — POST sign-out deletes the session row, then expires the cookie
- [ ] AUTH-004/T2 — The session list shows this account's live sessions and marks the current one
- [ ] AUTH-004/T3 — Ending every session, including this one, in one action
- [ ] AUTH-004/T4 — Every authenticated response is `no-store`, verified by pressing the back button
- [ ] AUTH-004/T5 — Signing out twice succeeds; there is no already-signed-out error

## ADMIN-001 · Account management
PRD: `ADMIN-001`, `SEC-R04`

- [ ] ADMIN-001/T1 — The list, sortable by last sign-in, with role and state
- [ ] ADMIN-001/T2 — The person page: identity, access, sessions, actions
- [ ] ADMIN-001/T3 — Suspending ends every live session in the same transaction
- [ ] ADMIN-001/T4 — Deletion is a real delete; the confirmation lists what goes and what remains, and takes the typed name
- [ ] ADMIN-001/T5 — Deleting the last admin, or yourself, is refused
- [ ] ADMIN-001/T6 — Creation issues an invitation; no admin ever sets another person's password
- [ ] ADMIN-001/T7 — A role change rotates the session and is audited

## ADMIN-002 · Admin console shell
PRD: `ADMIN-002`

- [ ] ADMIN-002/T1 — A `/admin` segment layout whose role check every page inherits, answering `404` to a non-admin
- [ ] ADMIN-002/T2 — The seven destinations, with the landing surface listing what needs attention
- [ ] ADMIN-002/T3 — One destructive-action component, naming the subject, with a typed confirmation for the three that cannot be undone
- [ ] ADMIN-002/T4 — An environment bar wherever `APP_ENV` is not production
- [ ] ADMIN-002/T5 — Console chrome in English, with the exception stated where a reader will find it

## INV-001 · Investor room shell
PRD: `INV-001`

- [ ] INV-001/T1 — The landing surface: what is new, where things stand, the current report, your decks
- [ ] INV-001/T2 — Empty and error states are different renderings, each saying which it is
- [ ] INV-001/T3 — Flat navigation over four destinations, with the current one marked
- [ ] INV-001/T4 — The room's chrome is the gateway's, with no scene
- [ ] INV-001/T5 — An expired session returns the reader to where they were going

## INV-002 · Gated gateway chapters, served
PRD: `INV-002`, `SEC-R01`

- [!] INV-002/T1 — The gated components are not called for a reader who may not see them
  Blocked by: AUTH-002/T3
- [ ] INV-002/T2 — A test requests the page with no cookie and proves a gated sentence is absent from the body
- [ ] INV-002/T3 — The nav's gated links are not rendered rather than hidden
- [ ] INV-002/T4 — The dictionary splits, and the gated catalogue is sent only to an entitled reader
- [ ] INV-002/T5 — The parity gate counts both catalogues
- [ ] INV-002/T6 — The invitation block, in twenty locales, carrying no fragment of what it invites to

## INV-003 · Portfolio progress
PRD: `INV-003`

- [ ] INV-003/T1 — Six rows, a constrained product and a closed four-word stage vocabulary
- [ ] INV-003/T2 — Editing one product at a time, audited with the previous stage and headline
- [ ] INV-003/T3 — A changed stage offers a prefilled progress update, and can be declined
- [ ] INV-003/T4 — All six always render, including paused, with an absent row filled rather than dropped
- [ ] INV-003/T5 — Stage is carried by a word as well as by colour, and the board states when it last changed

## DECK-001 · Deck authoring
PRD: `DECK-001`

- [ ] DECK-001/T1 — Sections derived from level-2 headings, with the block array the single source
- [ ] DECK-001/T2 — An overview of section cards in order, showing heading, first line and what each carries
- [ ] DECK-001/T3 — Reordering by drag and by keyboard, writing back to the block array
- [ ] DECK-001/T4 — Section, word and figure counts in the overview
- [ ] DECK-001/T5 — Speaker context per section, stripped in the investor read path and proven by a test

## DECK-002 · Deck versioning and publishing
PRD: `DECK-002`

- [ ] DECK-002/T1 — A monotonic version assigned at publication, never reused, holes kept
- [ ] DECK-002/T2 — An optional pinned version on a grant; unpinned readers get the current one
- [ ] DECK-002/T3 — An unpinned reader is told once when the version changed, with what changed by section
- [ ] DECK-002/T4 — A read record per account per version, deleted with the account
- [ ] DECK-002/T5 — The publish confirmation names every investor who will see the new version
- [ ] DECK-002/T6 — Withdrawal does not break a pin to the withdrawn version

## DECK-003 · Deck reading
PRD: `DECK-003`

- [ ] DECK-003/T1 — One column with sections in order, the version and date on the page
- [ ] DECK-003/T2 — A contents list that marks the current section by reading position, not by a threshold
- [ ] DECK-003/T3 — A next-section control that moves the reading position and nothing else
- [ ] DECK-003/T4 — The change notice for an unpinned reader whose version moved
- [ ] DECK-003/T5 — The print stylesheet shared with `RPT-003` where the rules are the same

## DECK-004 · Deck access grants
PRD: `DECK-004`

- [ ] DECK-004/T1 — Grant and revoke, audited, with the pinned version optional
- [ ] DECK-004/T2 — The confirmation states in words what the person will be able to read, including the version
- [ ] DECK-004/T3 — A grant to a suspended account is refused with the reason; to an invited one it is allowed
- [ ] DECK-004/T4 — The from-the-deck view, showing pin, granter, date and when last opened
- [ ] DECK-004/T5 — The from-the-account view, listing every deck a person may read
- [ ] DECK-004/T6 — Bulk grant with the names shown before it commits, and no bulk revoke

## POST-001 · Update authoring
PRD: `POST-001`

- [ ] POST-001/T1 — A composer that opens with the cursor in the body and fits without scrolling
- [ ] POST-001/T2 — Kind is required and chosen before writing; three kinds, no more
- [ ] POST-001/T3 — An optional product tag from the six, plus the company
- [ ] POST-001/T4 — The title derives from the first line until it is edited separately
- [ ] POST-001/T5 — A soft length marker that offers to move the text into the current draft report
- [ ] POST-001/T6 — The tagged product's current progress value is shown beside the composer

## POST-002 · Update publishing and audience
PRD: `POST-002`

- [ ] POST-002/T1 — Audience on the item, with the predicate from `CMS-006` on every read
- [ ] POST-002/T2 — The stream pages by keyset on `(published_at, id)`, never by offset
- [ ] POST-002/T3 — Ordered by publication rather than creation
- [ ] POST-002/T4 — The gateway's public news is the same query with an anonymous reader
- [ ] POST-002/T5 — Narrowing states what it cannot recall; widening states what becomes public
- [ ] POST-002/T6 — Unread marking from the per-account read state, and a paging control rather than infinite scroll

## MAIL-001 · Investor mail
PRD: `MAIL-001`

- [ ] MAIL-001/T1 — The `Mailer` port, and the composer that renders the exact bytes the send will use
- [ ] MAIL-001/T2 — Recipients are a confirmed list of names, never a criterion re-evaluated at send time
- [ ] MAIL-001/T3 — Suspended and unsubscribed accounts are excluded and shown as excluded, with the reason
- [ ] MAIL-001/T4 — The send requires the recipient count to be typed, and re-resolves every recipient first
- [ ] MAIL-001/T5 — One row per recipient written before the attempt; a failure leaves the row and the send continues
- [ ] MAIL-001/T6 — Retry sends only to the ones that failed
- [ ] MAIL-001/T7 — With no credential the composer works, the list resolves, and the send control is disabled with the reason
- [ ] MAIL-001/T8 — One SMTP connection per send, TLS required, and a connection that cannot be secured fails rather than falling back

## MAIL-002 · Mail log and unsubscribe
PRD: `MAIL-002`, `DATA-R04`

- [ ] MAIL-002/T1 — Rows written before the attempt, keyed by account and never by address
- [ ] MAIL-002/T2 — An unsubscribe that works in one click without signing in, and a preference inside the room
- [ ] MAIL-002/T3 — Transactional mail is never suppressed, enforced by the `kind` set at send time
- [ ] MAIL-002/T4 — A manual `stop sending` control with its reason, and the send view naming the mailbox bounces arrive in
- [ ] MAIL-002/T5 — Two-year retention, and immediate removal with the account
- [ ] MAIL-002/T6 — The admin log, filtered by recipient and date, showing state and error

## CFG-001 · Runtime configuration
PRD: `CFG-001`

- [ ] CFG-001/T1 — The table with a previous-value column, and defaults declared in code beside the keys
- [ ] CFG-001/T2 — Change validates against the key's type and bounds, refusing rather than clamping
- [ ] CFG-001/T3 — Change and revert are one transaction each, audited with both values
- [ ] CFG-001/T4 — Revert is one action with no confirmation, and is itself recorded
- [ ] CFG-001/T5 — One cached accessor with a short refresh; an empty table yields a working application
- [ ] CFG-001/T6 — The accessor refuses a secret-shaped key

## SEC-001 · Security baseline
PRD: `SEC-001`

- [ ] SEC-001/T1 — One middleware sets every header on every response, with no route exempt
- [ ] SEC-001/T2 — The CSP carries no `unsafe-inline`, and the page is verified in a browser under it
- [~] SEC-001/T3 — Every route parses its input with a schema, and the handler sees only the parsed value
  Note: secret scanning runs on every push and pull request — gitleaks over full history, the binary pinned to release 8.30.0 rather than the published action, which refuses to run for an organisation without a paid licence and would therefore stop working the day this repository goes private. Dependency scanning waits on there being a dependency: the one library shipped, three.js 0.166, is vendored and pinned on purpose, and `.github/dependabot.yml.disabled` says what turns it on.
- [ ] SEC-001/T4 — Rate limits on sign-in, reset and invitation, per account and per address, refusing identically
- [ ] SEC-001/T5 — `gitleaks`, dependency audit and type check in CI, with every action pinned to a verified SHA

## SEC-002 · Audit log
PRD: `SEC-002`, `SEC-R04`

- [ ] SEC-002/T1 — The table, the closed action vocabulary, and the append-only trigger
- [ ] SEC-002/T2 — The application role holds no UPDATE or DELETE on it
- [ ] SEC-002/T3 — One insert function, called inside the caller's transaction, with no error discarded
- [ ] SEC-002/T4 — Only changed fields are recorded, and no personal data reaches the trail
- [ ] SEC-002/T5 — The admin view: newest first, filterable by actor, subject and action, with no edit or delete control

## OPS-001 · Hosting and deploy
PRD: `OPS-001`

- [ ] OPS-001/T1 — Terraform under `deploy/`: VPC, ECS Fargate, ALB, RDS in private subnets, ECR, Route 53, ACM, with remote state and a lock table
- [ ] OPS-001/T2 — The deploy sequence: migrate as a one-off task on the same image, then the new task set, health-checked before it takes traffic
- [ ] OPS-001/T3 — A short DNS TTL set a day before the cutover, and `main` left deployable for a month after
- [ ] OPS-001/T4 — Secrets from Secrets Manager by ARN; values set by the owner, never in Terraform state or the image
- [ ] OPS-001/T5 — The six post-deploy checks, run against the real deployment through Cloudflare
- [ ] OPS-001/T6 — A staging service carrying `APP_ENV=staging`, so the console says which one it is
- [ ] OPS-001/T7 — RDS unreachable from outside the VPC, proved by attempting it rather than by reading the security group

## OPS-002 · Logging and monitoring
PRD: `OPS-002`, `DATA-R02`

- [ ] OPS-002/T1 — One JSON logger to stdout, with a closed event vocabulary and no `console.log` anywhere
- [ ] OPS-002/T2 — A request id generated at the edge and carried through every line of that request
- [ ] OPS-002/T3 — Explicit fields, never serialised objects, plus a scrubber on the way out
- [ ] OPS-002/T4 — A scrubber hit raises an alert naming the event, so the caller is fixed rather than the scrubber
- [ ] OPS-002/T5 — `/health` runs a real query and reports the build version, and nothing else
- [ ] OPS-002/T6 — Three alerts, each with its action written beside it

## INFRA-001 · Local development stack
PRD: `INFRA-001`

- [~] INFRA-001/T1 — PostgreSQL 17 on 5434 under docker-compose, with a named volume and a health check
  Note: `make infra-up` starts PostgreSQL 17 on 5434 — the row this repository claimed in `docs/ECOSYSTEM.md`, not the engine's default, because two compose files reaching for 5432 is how a stack silently talks to a sibling's database. The health check waits for `pg_isready` rather than for the port, since Postgres accepts connections before it can answer them. The application half waits on there being an application.
- [~] INFRA-001/T2 — `env.example` names every variable the application reads, with what its absence means
  Note: written and complete for the variables the designs name — app, database, session, rate limit — each with whether it is required and what a missing one does. It cannot close until code reads them, because the check that matters is that the list and the reader agree, and there is no reader yet. The mail block is deliberately empty and says why: `docs/decisions-log.md#MAIL-DEC-01`.
- [ ] INFRA-001/T3 — Make targets for up, down, reset, and the three migration commands
- [ ] INFRA-001/T4 — `make migrate-roundtrip` applies, rolls back and re-applies against a throwaway database
- [ ] INFRA-001/T5 — A first-run path that works from a fresh clone with no prior state

## CRED-001 · Credential handling
PRD: `CRED-001`, `SEC-R05`

- [~] CRED-001/T1 — One module reads the environment once, validates it, and exports a frozen object
  Note: the rule and the three credentials are written in `credentials/README.md`, and `credentials/credential-input.html` generates what can be generated and takes what cannot, sending nothing anywhere. The behaviour half — that a missing credential degrades its own feature rather than the system — is a property of code that does not exist yet.
- [ ] CRED-001/T2 — A required variable that is absent stops the application before it listens, naming the variable
- [ ] CRED-001/T3 — An absent optional credential disables its feature with a stated reason, and the system stays up
- [ ] CRED-001/T4 — A credential never reaches a log, an error message or a response, including through generic serialisation
- [ ] CRED-001/T5 — `credentials/README.md` says what the owner sets, and the local input form writes `.env` without the value crossing a chat

## LEGAL-SG-001 · PDPA posture
PRD: `LEGAL-SG-001`

- [ ] LEGAL-SG-001/T1 — The privacy notice: what is held, why, how long, who to write to, in twenty locales
- [ ] LEGAL-SG-001/T2 — The notice is linked from the sign-in page and the room's footer
- [ ] LEGAL-SG-001/T3 — The four rights answered within thirty days, with the admin path for each written down
- [ ] LEGAL-SG-001/T4 — A named DPO recorded, and published in the notice
- [ ] LEGAL-SG-001/T5 — A breach runbook with the assessment steps and both notification paths
- [ ] LEGAL-SG-001/T6 — The backup window disclosed in the notice rather than omitted

## LEGAL-GLOBAL-001 · GDPR posture for EU investors
PRD: `LEGAL-GLOBAL-001`

- [ ] LEGAL-GLOBAL-001/T1 — The notice carries the additional GDPR statements, in twenty locales
- [ ] LEGAL-GLOBAL-001/T2 — An admin-generated JSON export of everything held about one person
- [ ] LEGAL-GLOBAL-001/T3 — An objection flag that stops read-tracking and deletes the existing rows
- [ ] LEGAL-GLOBAL-001/T4 — The breach runbook uses the 72-hour clock for everyone
- [ ] LEGAL-GLOBAL-001/T5 — A one-page record of processing, and a written statement of what is deliberately not claimed

## LEGAL-GLOBAL-002 · Cookie and analytics posture
PRD: `LEGAL-GLOBAL-002`

- [ ] LEGAL-GLOBAL-002/T1 — The three categories, with `necessary` fixed on and both others off until a visitor says otherwise
- [ ] LEGAL-GLOBAL-002/T2 — The notice states the three storages, when each is set, and that nothing else is set on arrival
- [ ] LEGAL-GLOBAL-002/T3 — A test proves a visitor who answers nothing, signs in to nothing and chooses no language leaves with an empty cookie jar and empty storage
- [ ] LEGAL-GLOBAL-002/T4 — Nothing non-essential is present in the page until consent, rather than present and inert
- [ ] LEGAL-GLOBAL-002/T5 — The stored choice is versioned, and a bump re-asks rather than extending an old answer

## CMS-001 · Content model and revisions
Design: [docs/designs/cms/cms-001-content-model-and-revisions.md](designs/cms/cms-001-content-model-and-revisions.md) · PRD: `CMS-001`

- [ ] CMS-001/T1 — Items, revisions, and a published pointer that is the only thing a reader query consults
- [ ] CMS-001/T2 — The closed block vocabulary and its validator, rejecting an unknown block on write
- [ ] CMS-001/T3 — Marks as offsets over plain text, so a paragraph stays one translatable string
- [ ] CMS-001/T4 — `saveDraft` replaces the open draft rather than accumulating a revision per save
- [ ] CMS-001/T5 — `publish` and `withdraw` as pointer moves, with the previous revision intact
- [ ] CMS-001/T6 — Every read function takes the reader; none exists that does not

## CMS-002 · Authoring surface
Design: [docs/designs/cms/cms-002-authoring-surface.md](designs/cms/cms-002-authoring-surface.md) · PRD: `CMS-002`

- [ ] CMS-002/T1 — A block list the author operates by keyboard, with each block's type visible
- [ ] CMS-002/T2 — The seven block types, each with the fields its schema requires
- [ ] CMS-002/T3 — An image block cannot be saved without alternative text
- [ ] CMS-002/T4 — Marks by selection, stored as offsets, with the editor's model the block array and not the DOM
- [ ] CMS-002/T5 — Paste imports plain text plus recognised structure and nothing else
- [ ] CMS-002/T6 — Explicit save, a visible unsaved state, and a local copy offered back after a closed tab
- [ ] CMS-002/T7 — One schema module validates in the browser and on the server, and the server's error names the block and the field

## CMS-003 · Media library
Design: [docs/designs/cms/cms-003-media-library.md](designs/cms/cms-003-media-library.md) · PRD: `CMS-003`

- [ ] CMS-003/T1 — Upload sniffs the type from the bytes, and refuses anything outside the accepted set
- [ ] CMS-003/T2 — Raster images are re-encoded, so EXIF and its location do not survive
- [ ] CMS-003/T3 — SVG is parsed and stripped to shape and text, or refused
- [ ] CMS-003/T4 — Storage keyed by content hash, so a duplicate upload is one row
- [ ] CMS-003/T5 — Serving joins through references and composes the audience predicate, answering `404` on no match
- [ ] CMS-003/T6 — Cache headers follow the audience; nothing gated is cacheable
- [ ] CMS-003/T7 — Deletion is refused while a reference exists, and is audited when it is not

## CMS-004 · Preview, publish and withdraw
Design: [docs/designs/cms/cms-004-preview-publish-and-withdraw.md](designs/cms/cms-004-preview-publish-and-withdraw.md) · PRD: `CMS-004`

- [ ] CMS-004/T1 — Preview renders through the reader's own components and evaluates the audience rule as the chosen role
- [ ] CMS-004/T2 — Preview is admin-only, with no token and no shareable link
- [ ] CMS-004/T3 — Publish validates, moves the pointer and audits, in one transaction, taking an explicit revision
- [ ] CMS-004/T4 — The confirmation names what is replaced and how many locales will fall back
- [ ] CMS-004/T5 — Withdraw returns to the previous published revision, or states plainly that nothing will be visible
- [ ] CMS-004/T6 — A public item's cache is purged on publish and on withdraw

## CMS-005 · Locale variants and translation state
Design: [docs/designs/cms/cms-005-locale-variants-and-translation-state.md](designs/cms/cms-005-locale-variants-and-translation-state.md) · PRD: `CMS-005`

- [ ] CMS-005/T1 — Locale rows per revision, with a state a query filters on rather than infers
- [ ] CMS-005/T2 — A `machine` row is never reachable by any reader path
- [ ] CMS-005/T3 — Drafting translates block text and reassembles marks by span, never by offset arithmetic
- [ ] CMS-005/T4 — The review screen shows source beside translation, editable, marked one locale at a time
- [ ] CMS-005/T5 — Serving falls back to the authored language and says so to the reader
- [ ] CMS-005/T6 — A new revision starts with no locale rows, and the grid shows it

## CMS-006 · Audience and access
Design: [docs/designs/cms/cms-006-audience-and-access.md](designs/cms/cms-006-audience-and-access.md) · PRD: `CMS-006`

- [ ] CMS-006/T1 — One predicate builder from a reader, with the published check inside it
- [ ] CMS-006/T2 — Reader and author read paths as separate functions, so admin-sees-all cannot leak into a shared one
- [ ] CMS-006/T3 — The grant subquery, and the admin surface that writes and revokes grants
- [ ] CMS-006/T4 — A refusal is a `404`, and it is the same `404` for an item that does not exist
- [ ] CMS-006/T5 — A CI gate refuses SQL naming `content_items` outside the repository module
- [ ] CMS-006/T6 — Narrowing an audience is audited, and public content carries a short cache lifetime

## CMS-007 · Search and filter in the room
Design: [docs/designs/cms/cms-007-search-and-filter.md](designs/cms/cms-007-search-and-filter.md) · PRD: `CMS-007`

- [ ] CMS-007/T1 — A generated `tsvector` over flattened block text, so the index cannot drift from the content
- [ ] CMS-007/T2 — The search query composes `CMS-006`'s predicate as its first clause, and lives in the repository module
- [ ] CMS-007/T3 — Kind, product, period and type filters, composing into one statement
- [ ] CMS-007/T4 — Only the published revision is findable; a draft is not, including by its author
- [ ] CMS-007/T5 — The empty state names what narrowed the result and offers to widen it
- [ ] CMS-007/T6 — The field is labelled, keyboard-operable, and announces its result count

## DATA-002 · Erasure and retention
Design: [docs/designs/data/data-002-erasure-and-retention.md](designs/data/data-002-erasure-and-retention.md) · PRD: `DATA-002`

- [ ] DATA-002/T1 — The manifest: every table, what it holds, and what erasure does to it
- [ ] DATA-002/T2 — One erasure function driven by the manifest, with the schema's `on delete` matching it
- [ ] DATA-002/T3 — A gate comparing the manifest against the live schema, with exemptions written rather than patterns loosened
- [ ] DATA-002/T4 — Scheduled deletion enforcing each retention window
- [ ] DATA-002/T5 — Content authored by an erased account survives with a null author

## DATA-003 · Backup and restore
Design: [docs/designs/data/data-003-backup-and-restore.md](designs/data/data-003-backup-and-restore.md) · PRD: `DATA-003`

- [ ] DATA-003/T1 — A daily dump, encrypted before it leaves the host, to a target from the environment
- [ ] DATA-003/T2 — Seven daily, four weekly, twelve monthly, enforced rather than intended
- [ ] DATA-003/T3 — `make restore-rehearsal` into a throwaway database, asserting schema and row counts, printing the elapsed time
- [ ] DATA-003/T4 — `make doctor` reports the last successful backup and the last successful rehearsal, and fails the second after two months
- [ ] DATA-003/T5 — A restore runbook whose every command was executed in the rehearsal, with measured timings

## RPT-001 · Investor report authoring
Design: [docs/designs/rpt/rpt-001-investor-report-authoring.md](designs/rpt/rpt-001-investor-report-authoring.md) · PRD: `RPT-001`

- [ ] RPT-001/T1 — Create a report against a period, with the period fixed at creation
- [ ] RPT-001/T2 — A new report is prefilled with the previous period's structure and none of its text
- [ ] RPT-001/T3 — Metrics are `figure` blocks carrying their numbers as data
- [ ] RPT-001/T4 — The progress board's current values are shown beside the section that narrates them
- [ ] RPT-001/T5 — Making a report public states in words what that means

## RPT-002 · Report periods and archive
Design: [docs/designs/rpt/rpt-002-report-periods-and-archive.md](designs/rpt/rpt-002-report-periods-and-archive.md) · PRD: `RPT-002`

- [ ] RPT-002/T1 — A partial unique index gives one published report per period, and drafts are exempt
- [ ] RPT-002/T2 — Publishing into a taken period fails with the report that holds it and the two real choices
- [ ] RPT-002/T3 — The archive lists by period, groups by year, and shows a period with no report as a gap
- [ ] RPT-002/T4 — The room's current report is the most recent period the reader may read, not the most recent publication
- [ ] RPT-002/T5 — Withdrawal states that the period becomes a gap and which report becomes current
- [ ] RPT-002/T6 — A per-account read state, used only in the list, and deleted with the account

## RPT-003 · Report reading
Design: [docs/designs/rpt/rpt-003-report-reading.md](designs/rpt/rpt-003-report-reading.md) · PRD: `RPT-003`

- [ ] RPT-003/T1 — One column at a reading measure, with the period, title and date on the page itself
- [ ] RPT-003/T2 — Previous and next by period, skipping gaps, absent rather than disabled at the ends
- [ ] RPT-003/T3 — A print stylesheet: black on white, repeating header, figures as tables, links with their targets
- [ ] RPT-003/T4 — The phone layout is the default; only figures scroll horizontally, never the page
- [ ] RPT-003/T5 — The locale fallback notice sits above the content

## SITE-005 · The gateway served by the application
Design: [docs/designs/site/site-005-gateway-served-by-the-application.md](designs/site/site-005-gateway-served-by-the-application.md) · PRD: `SITE-005`

- [ ] SITE-005/T1 — The page is server-rendered from the same dictionary, at the same URLs, with the same asset paths
- [ ] SITE-005/T2 — The parity gate is pointed at the rendered output and counts both catalogues, for both readers
- [ ] SITE-005/T3 — Node-for-node comparison of the rendered page against the static one, at three viewports
- [ ] SITE-005/T4 — Edge caching for anonymous readers, `Vary` on the session cookie, verified through the CDN with and without one
- [ ] SITE-005/T5 — First paint measured before and after, at the same viewport on the same machine
- [ ] SITE-005/T6 — `main` stays deployable as the fallback until the owner answers `INFRA-DEC-03`

## SITE-006 · Legal pages and the consent surface
Design: [docs/designs/site/site-006-legal-pages-and-consent.md](designs/site/site-006-legal-pages-and-consent.md) · PRD: `SITE-006`

- [ ] SITE-006/T1 — Three legal pages in twenty locales, through the parity gate, linked in a footer row of their own
- [ ] SITE-006/T2 — The banner: three categories, `necessary` fixed, three controls of equal weight, no dismissal without an answer
- [ ] SITE-006/T3 — The banner is not first in the tab order, does not trap focus, and carries state without relying on colour
- [ ] SITE-006/T4 — The stored choice read in a `try`/`catch`; an unreadable store means no answer, and nothing non-essential loads
- [ ] SITE-006/T5 — A control on `legal/cookies` that changes the answer, and a footer link that reaches it
- [ ] SITE-006/T6 — The legal pages print in black on white
