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
  Blocked by: INV-002/T1 — the enforcement is that task's, and this row closes when the served page stops shipping the gated markup to a visitor.

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

- [x] DATA-001/T1 — Choose and wire the migration tool; one command applies and one rolls back
  Evidence: apps/web/package.json — node-pg-migrate wired (docs/decisions-log.md#INFRA-DEC-06); `make migrate` prints the target then applies, `make migrate-down` rolls one back, verified against PostgreSQL 17.11.
- [x] DATA-001/T2 — Accounts table: identity, role, state, created and updated
  Evidence: apps/web/migrations/1788744617066_accounts.sql — the accounts table per DATA-001 with the citext e-mail, the role and state checks, and a `BEFORE UPDATE` trigger that maintains `updated_at` (verified: after an update it exceeds created_at). apps/web/src/db/db.test.ts holds the hand-written Kysely types to the migration column for column, mutation-proved to catch a drift in type, nullability, default, or uniqueness.
- [x] DATA-001/T3 — Sessions table, or the session store the auth library needs
  Evidence: apps/web/migrations/1788758032000_auth_store.sql — the sessions table: the cookie carries a random token and the row stores only its token_hash (unique), so a database dump is not a set of live sessions (AUTH-002); account_id cascades on erasure, and an index on account_id serves both the privilege-change 'delete every session for this account' and the cascade. Verified against PostgreSQL 17.11 (cascade deletes the sessions, token_hash refuses a duplicate); DATA-001 §3 reconciled to this token-hash scheme, and the choice of a hand-rolled store over the auth library is docs/decisions-log.md#AUTH-DEC-01. Held column for column by apps/web/src/db/db.test.ts.
- [x] DATA-001/T4 — Content items and their revisions, with the published revision named by a pointer
  Evidence: apps/web/migrations/1788749077541_content.sql — content_items and content_revisions per DATA-001, the circular current_revision_id FK made fail-closed (no on-delete: a published revision cannot be deleted while current), a CMS-R01 trigger that refuses editing a published revision's blocks while allowing publish and re-publish, and checks binding kind to updates and period to reports; verified against PostgreSQL 17.11 and mutation-proved by apps/web/src/db/db.test.ts.
- [x] DATA-001/T5 — Content grants and the audience constraint
  Evidence: apps/web/migrations/1788749077541_content.sql — content_grants with a composite PK, item and account cascading on erasure and granted_by set null, and the audience check on content_items; the on-delete behaviours verified against docs/designs/data/data-002-erasure-and-retention.md by a four-way erasure run.
- [x] DATA-001/T6 — Locale rows carrying a review state a query can filter on
  Evidence: apps/web/migrations/1788749077541_content.sql — content_locales with a composite (revision_id, locale) PK, a state check, a reviewed row required to carry reviewed_at, and reviewed_by set null on erasure; the generalized drift guard apps/web/src/db/db.test.ts holds every content table's Kysely types to the migration column for column.
- [x] DATA-001/T7 — Mail log and unsubscribe state
  Evidence: apps/web/migrations/1788752441424_platform.sql — mail_log keyed by account_id (cascade on erasure), a kind and a state check with no 'delivered' value that SMTP cannot honour, and an index on account_id; unsubscribes keyed by account with a source that names how it was set, the link token for a one-click unsubscribe and the admin reason for a manual stop-sending bound to their source by two checks (MAIL-002). Verified against PostgreSQL 17.11 and held column for column by apps/web/src/db/db.test.ts.
- [x] DATA-001/T8 — Audit table, append-only, with a database-level guard against update and delete
  Evidence: apps/web/migrations/1788752441424_platform.sql — audit with a caller-proof identity key (GENERATED ALWAYS refuses a supplied id), an at forced to now() by a BEFORE INSERT trigger so it cannot be backdated, a closed fifteen-action vocabulary, and a bare actor_id that survives erasure; append-only enforced by a BEFORE UPDATE OR DELETE row trigger and a BEFORE TRUNCATE statement trigger (SEC-R04). UPDATE, DELETE and TRUNCATE all refused and the id and at proven caller-proof against PostgreSQL 17.11. What before and after may record is the personal-data policy filed as docs/decisions-log.md#SEC-DEC-01, which blocks SEC-002/T4, not this table.
- [x] DATA-001/T9 — Configuration table with a recorded prior value
  Evidence: apps/web/migrations/1788752441424_platform.sql — config keyed by key, with value, the previous_value the CFG-001 undo reads, changed_by set null on erasure and changed_at; the table ships empty because each key's default lives beside its declaration in code. Held column for column by apps/web/src/db/db.test.ts.
- [x] DATA-001/T10 — Every migration has a down-migration that has been run
  Evidence: apps/web/scripts/migrate-roundtrip.mjs — the round trip runs the down step with count Infinity, so every migration's down is exercised on a throwaway database each run, not just the newest; `make migrate-roundtrip` completes up then down then up, verified against PostgreSQL 17.11.
- [x] DATA-001/T11 — Media and its references, with the audience reached by join
  Evidence: apps/web/migrations/1788752441424_platform.sql — media with a unique sha256 that deduplicates identical bytes, the bytes as bytea, a stored byte_size and uploaded_by set null on erasure; media_refs a composite (media_id, item_id) key with both sides cascading and an index on item_id, so a file is served to a reader by joining to the item that uses it (CMS-R06). Held column for column by apps/web/src/db/db.test.ts.
- [x] DATA-001/T12 — The portfolio state table
  Evidence: apps/web/migrations/1788752441424_platform.sql — portfolio keyed by a six-product check, a four-stage check including paused, a 140-character headline check and updated_by set null on erasure; the updated_at trigger carries a WHEN so it restamps only on a stage or headline change and an erasure nulling updated_by does not silently re-date the investor board (INV-003). Verified against PostgreSQL 17.11: a real change restamps, an erasure does not.
- [x] DATA-001/T13 — The invitations table: single-use token, expiry, and an atomic consume
  Evidence: apps/web/migrations/1788758032000_auth_store.sql — invitations with id, account_id (cascade on erasure), token_hash (unique; the token itself is never stored), expires_at not null and a nullable consumed_at, plus an index on account_id for 'invalidate every outstanding invitation for this account' (AUTH-003). The atomic consume `UPDATE invitations SET consumed_at = now() WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()` gives exactly one winner under two concurrent transactions, measured against PostgreSQL 17.11. Held column for column by apps/web/src/db/db.test.ts.

## AUTH-001 · Sign-in
Design: [docs/designs/auth/auth-001-sign-in.md](designs/auth/auth-001-sign-in.md) · PRD: `AUTH-001`, `SEC-R01`, `SEC-R03`

- [x] AUTH-001/T1 — Password hashing at the current cost, verified against a known vector
  Evidence: apps/web/src/auth/password.ts — Argon2id via the library chosen at docs/decisions-log.md#AUTH-DEC-03, at the OWASP first configuration (19 MiB, two iterations, one lane, version pinned), the cost in one const the sign-in and the invitation share so it cannot diverge. hashPassword, verifyPassword and needsRehash (rehash-on-sign-in when the stored cost is below target). verifyPassword takes a nullable hash and normalises a null or unreadable one to DUMMY_HASH inside the module, so an invited account with no password and a wrong password cost the same argon2 milliseconds and the call site cannot reintroduce a timing oracle (SEC-R03) — deep-review measured the equalisation sound (AUC 0.4881) and the pre-fix short-circuit 300x cheaper. Verified by apps/web/src/auth/password.test.ts (known-answer on the encoding, the non-throwing unreadable path, and a floor proving the null path pays the hash cost).
- [x] AUTH-001/T2 — Sign-in route: identical failure for an unknown account and a wrong password
  Evidence: apps/web/src/app/api/auth/sign-in/route.ts — POST verifies a hash on every path (DUMMY_HASH when the account or its password is absent), so an unknown address, a wrong password, a suspended account and an invited one return a byte-identical 401 at the same argon2 cost; 204 with the session cookie on success, 429 before any query when limited, 403 for a cross-origin POST (login CSRF), 400 for a malformed body. Verified against PostgreSQL 17.11 and mutation-proved (seven of seven mutants) by apps/web/src/app/api/auth/sign-in/route.test.ts.
- [x] AUTH-001/T3 — Rate limit per account and per address, with the limit stated in config
  Evidence: apps/web/src/app/api/auth/sign-in/route.ts — the route calls the config-driven limiter (apps/web/src/auth/rate-limit.ts) for the account key and the address key before any query, and refuses with 429 and the larger of the two Retry-Afters when either is over the limit; the address key is length-bounded so an over-long X-Forwarded-For cannot mint unbounded counters, and which forwarded hop is the client is docs/decisions-log.md#OPS-DEC-02. Verified against PostgreSQL 17.11 that spraying one account from many addresses hits the account limit and one address across many accounts hits the address limit (apps/web/src/app/api/auth/sign-in/route.test.ts).
- [!] AUTH-001/T4 — The sign-in form, in twenty languages, keyboard-reachable, with an accessible name on every field
  Blocked by: pending-decision: I18N-DEC-02 — the form must render in the reader's locale across twenty, and the application has no i18n framework yet; which one it uses is the owner's to settle.
- [x] AUTH-001/T5 — Regression test: a wrong password and an unknown account are indistinguishable in status, body and timing
  Evidence: apps/web/src/app/api/auth/sign-in/route.test.ts — the four failing states (unknown, wrong password, suspended, invited) return an identical 401 in status and body, and each is held above an argon2 timing floor derived from a warmed reference verification, so a short circuit on any path fails the test; a 429 is proved never to touch the database. Mutation-proved seven of seven against PostgreSQL 17.11.

## AUTH-002 · Session and role gate
Design: [docs/designs/auth/auth-002-session-and-role-gate.md](designs/auth/auth-002-session-and-role-gate.md) · PRD: `AUTH-002`, `SEC-R02`, `DATA-R05`

- [x] AUTH-002/T1 — Session cookie: httpOnly, SameSite=Lax, Secure, rotated on sign-in
  Evidence: apps/web/src/auth/session.ts — issue() writes a fresh sessions row storing sha256 of a 32-byte CSPRNG token (never the token) and returns the cookie: `__Host-valotech` outside development and `valotech` in it, HttpOnly, SameSite=Lax, Secure outside development, Path=/, Max-Age from SESSION_TTL_SECONDS; a fresh row per call is the rotation that keeps a planted cookie from becoming a session. Verified against PostgreSQL 17.11 (row token_hash equals sha256 of the cookie and not the raw token); apps/web/src/auth/session.test.ts pins the production __Host- cookie's Secure and Path attributes, which the route suite under development cannot reach. The bare-token vs signed cookie is docs/decisions-log.md#AUTH-DEC-02.
- [x] AUTH-002/T2 — Server-side invalidation, so a stolen cookie dies on sign-out
  Evidence: apps/web/src/auth/session.ts:invalidateSession deletes the `sessions` row whose `token_hash` is the SHA-256 of the presented token, and apps/web/src/auth/session.ts:invalidateAllForAccount deletes every row an account holds — a delete rather than a flag, because revocation that takes effect at the next natural expiry is not revocation. Both are account-scoped and caller-agnostic, so ADMIN-001's privilege-change path calls the same function on somebody else's behalf. apps/web/src/auth/session.ts:expiredCookie carries the issued cookie's name, path, SameSite, HttpOnly and Secure with `Max-Age=0`, so the browser drops exactly the cookie `issue` set. Verified against PostgreSQL 17.11 by apps/web/src/auth/sign-out.test.ts (18 tests): the row is gone, `resolveSession` then answers null, a second session for the same account survives, and a token no row holds resolves to a successful no-op. Mutation-proved — a delete that runs nothing, one keyed on the raw token rather than its hash, an account-wide delete that runs nothing, a live `Max-Age`, and an expiry sent under another path were each killed.
- [x] AUTH-002/T3 — Role gate at the query, not the template; a helper that cannot be forgotten
  Evidence: apps/web/src/auth/gate.ts:resolveSession — one `UPDATE sessions ... FROM accounts ... RETURNING` turns a cookie into an `Actor` (id and role) and slides `last_seen_at` and `expires_at` in the same statement, so the predicate that refuses an expired session or a suspended account is the predicate that withholds the slide and no ordering mistake can resurrect a session; apps/web/src/auth/gate.ts:requireInvestor and apps/web/src/auth/gate.ts:requireAdmin answer that actor or the response the caller returns — 303 to the form with no reader, 404 and never 403 for a signed-in investor at an admin surface, both `no-store`. Verified against PostgreSQL 17.11 by apps/web/src/auth/gate.test.ts: 21 tests, skipping cleanly with no `DATABASE_URL` and running with one, and mutation-proved eleven of eleven — the expiry predicate dropped, the active-account predicate dropped, the admin check dropped, 403 for 404, `no-store` dropped, the slide stopped, the raw token compared instead of its hash, the cookie name ignored, 307 for 303, the sign-in path changed, and every reader refused.
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
Design: [docs/designs/auth/auth-004-sign-out.md](designs/auth/auth-004-sign-out.md) · PRD: `AUTH-004`

- [x] AUTH-004/T1 — POST sign-out deletes the session row, then expires the cookie
  Evidence: apps/web/src/app/api/auth/sign-out/route.ts — `POST /api/auth/sign-out` reads the cookie through apps/web/src/auth/gate.ts:presentedToken, awaits `invalidateSession`, and only then returns apps/web/src/auth/sign-out.ts:signedOut, a `303` to `/` carrying the expiring cookie and `no-store`. The order is the feature: a cookie cleared before the row is deleted leaves a live session nobody references, so a failed delete raises rather than answering a sign-out that did not happen. `POST` is the only export, so a `GET` — which any embedded image or link checker performs — is answered `405`. Measured against the built server (`next build` then `next start`, Next 16.3.4, PostgreSQL 17.11): `303`, `location: /`, `set-cookie: valotech=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`, `cache-control: no-store`, the account's session count 3 → 2, and `GET /api/auth/sign-out` → `405` leaving the count unchanged. Pinned by apps/web/src/auth/sign-out.test.ts against PostgreSQL 17.11.
- [!] AUTH-004/T2 — The session list shows this account's live sessions and marks the current one
  Blocked by: pending-decision: I18N-DEC-02 — the list is a localised page and the application has no i18n framework yet; which one it uses is the owner's to settle. The design's own §6 question rides with it: `sessions` carries no address or user-agent column, and whether the list shows them is a personal-data choice (`DATA-R01`) rather than a schema oversight.
- [x] AUTH-004/T3 — Ending every session, including this one, in one action
  Evidence: apps/web/src/app/api/account/sessions/all/route.ts — `POST /api/account/sessions/all` resolves the presented cookie through apps/web/src/auth/gate.ts:accountForToken — the gate's non-sliding sibling — and calls `invalidateAllForAccount(actor.id)`, so the resolution is the authorisation: an expired cookie and a suspended account both end nothing and both still redirect. Resolving without sliding is the property: a sliding resolve followed by a delete that failed would leave the session live with a fresh full lifetime, worse than doing nothing, so this path reads the account rather than extending the session it is about to end. Measured against the built server: `303` to `/` with the expiring cookie and `no-store`, and the account's two live sessions — the one that asked and one it had never seen — both gone; pinned by apps/web/src/auth/sign-out.test.ts, whose delete-fails probe asserts the session is neither dropped nor slid when the delete raises. The `session.invalidate_all` audit row `SEC-R04` requires is not written: the insert function is SEC-002/T3 and is unbuilt, and the call site carries a `Deferred:` marker rather than a call that logs nowhere.
- [~] AUTH-004/T4 — Every authenticated response is `no-store`, verified by pressing the back button
  Note: The mechanism ships and is header-verified; the acceptance the row names — pressing Back — is owed, so this is in-progress rather than closed. apps/web/src/proxy.ts marks a response `Cache-Control: no-store` when the request presented a session cookie, read through the gate's own parser — the cookie is what makes a response authenticated, so a surface added later is covered by the commit that mounts it rather than by an edit to a prefix list. Measured against the built server: `GET /` with a session cookie answered `cache-control: no-store`, while the same request without one answered an `s-maxage` of a year, and a `/_next/static/chunks` bundle stayed publicly cacheable and `immutable` with the cookie present, so the matcher's exemption holds; the header is pinned by apps/web/src/proxy.test.ts (14 tests, four mutations killed). What is not done is the browser step: pressing Back and getting the sign-in path rather than a rendered gated page exercises the back-forward cache, a mechanism separate from the HTTP cache whose `no-store` treatment differs by browser, so the header assertion does not stand in for it. It needs a gated surface, which arrives with INV-002, and is recorded as owed in docs/runbooks/auth-004-sign-out.md.
- [x] AUTH-004/T5 — Signing out twice succeeds; there is no already-signed-out error
  Evidence: apps/web/src/auth/session.ts:invalidateSession treats deleting nothing as success and neither handler branches on what it found, so a second sign-out with the same cookie, a cookie whose row never existed, and no cookie at all all answer the same `303` with the same expiring cookie. Measured against the built server (a second `POST` with an already-deleted cookie → `303`, `location: /`, `Max-Age=0`) and pinned by apps/web/src/auth/sign-out.test.ts, whose mutation run kills a handler that raises when it finds no session.

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
  Blocked by: SITE-005/T1 — the gateway is still the static file, so there is no server response to withhold the gated chapters from; the gate they would be withheld by stands.
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
- [!] SEC-002/T4 — Only changed fields are recorded, and no personal data reaches the trail
  Blocked by: pending-decision: SEC-DEC-01 — whether a changed field records its name or an allow-listed value is the trail's personal-data policy, and it is the user's to settle (special-category data).
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

- [x] INFRA-001/T1 — PostgreSQL 17 on 5434 under docker-compose, with a named volume and a health check
  Evidence: docker-compose.yml — `make infra-up` brought up `postgres:17-alpine` (PostgreSQL 17.11), the `pg_isready` health check reached `healthy` at t+16s, the host port mapped 5434→5432, and the named volume `valotech-postgres` was created; `make infra-reset` tore it all down with no residue. Verified by running, not asserting. The task's text is the Postgres side alone; bringing the application up against it is `INFRA-001/T3`.
- [x] INFRA-001/T2 — `env.example` names every variable the application reads, with what its absence means
  Evidence: env.example declares all twelve variables the application reads, each with whether it is required and what its absence does; apps/web/src/config/index.ts exposes the reader's own list as `DECLARED_VARIABLES`, and apps/web/src/config/index.test.ts asserts that list equals the set env.example declares, so the file and the reader cannot drift.
- [x] INFRA-001/T3 — Make targets for up, down, reset, and the three migration commands
  Evidence: `make migrate`, `make migrate-down`, `make migrate-roundtrip`, `make infra-up`, `make infra-down`, `make infra-reset` — the connecting targets print the target before they act; verified end to end.
- [x] INFRA-001/T4 — `make migrate-roundtrip` applies, rolls back and re-applies against a throwaway database
  Evidence: apps/web/scripts/migrate-roundtrip.mjs — `make migrate-roundtrip` creates a scratch database beside the target, runs up then down then up on it, and drops it; verified the developer's own database is left untouched (DATA-R06).
- [x] INFRA-001/T5 — A first-run path that works from a fresh clone with no prior state
  Evidence: scripts/setup.sh (run by `make setup`) takes a checkout with no `.env`, no node_modules and no database to an up-and-migrated stack: it creates `.env` from env.example without clobbering one, installs apps/web dependencies, starts PostgreSQL, waits for it to report healthy, and applies every migration — each step idempotent. Verified end to end against a fresh state (twelve tables applied) and re-run clean (`No migrations to run!`); it names `SESSION_SECRET` as the owner's to set (CRED-001) rather than inventing one.

## CRED-001 · Credential handling
PRD: `CRED-001`, `SEC-R05`

- [x] CRED-001/T1 — One module reads the environment once, validates it, and exports a frozen object
  Evidence: apps/web/src/config/index.ts — the sole reader of `process.env`; `loadConfig` reads every variable `env.example` declares, validates the set, and returns a deep-frozen typed `Config`, and `getConfig` reads once and caches. Verified by apps/web/src/config/index.test.ts (a valid environment yields a frozen object whose mutation throws).
- [x] CRED-001/T2 — A required variable that is absent stops the application before it listens, naming the variable
  Evidence: apps/web/src/config/index.ts — `loadConfig` collects every problem and throws `ConfigError` naming each absent or unparseable required variable, not the first only; apps/web/src/instrumentation.ts calls `getConfig` in Next's `register`, so a misconfiguration aborts startup before the server listens. Verified by apps/web/src/config/index.test.ts (`names every missing required variable`; `refuses to load when X alone is missing`).
- [x] CRED-001/T3 — An absent optional credential disables its feature with a stated reason, and the system stays up
  Evidence: apps/web/src/config/index.ts — an absent `SMTP_URL` or `BACKUP_TARGET` yields `{ available: false, unavailable: <reason> }` and `loadConfig` still returns, so the feature is disabled and the system is not. Verified by apps/web/src/config/index.test.ts (mail and backups each disable with a reason while the config loads).
- [x] CRED-001/T4 — A credential never reaches a log, an error message or a response, including through generic serialisation
  Evidence: apps/web/src/config/index.ts — every secret is a `Secret` whose `toString`, `toJSON` and `util.inspect` hook redact, so a value survives explicit `.value` access and nothing else. Verified by apps/web/src/config/index.test.ts: `JSON.stringify` and `util.inspect` of the whole config, a lone secret, a spread sub-object, and an `Error` built from the config all omit the secret bytes while `.value` returns them.
- [x] CRED-001/T5 — `credentials/README.md` says what the owner sets, and the local input form writes `.env` without the value crossing a chat
  Evidence: credentials/README.md states the rule and the three secrets the owner sets; credentials/credential-input.html generates `SESSION_SECRET` in the browser with `crypto.getRandomValues`, takes the two it cannot generate, and emits a `.env` block with no network call — the value never crosses a chat window.

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

- [x] DATA-003/T1 — A daily dump, encrypted before it leaves the host, to a target from the environment
  Evidence: scripts/backup.py (make backup) — pg_dump --format=custom piped through openssl aes-256-cbc so the plaintext never touches disk, written to BACKUP_TARGET with a UTC-stamped name that says nothing of its contents (DATA-R02). BACKUP_KEY is the passphrase, in config beside BACKUP_TARGET (CRED-001); absent either, no backup is taken and it says so (SEC-R05). Verified against PostgreSQL 17.11: a 37 KB Salted__ file with no plaintext PGDMP.
- [x] DATA-003/T2 — Seven daily, four weekly, twelve monthly, enforced rather than intended
  Evidence: scripts/backup.py keep_set — the newest backup in each of the last seven days, four ISO weeks and twelve months is kept and the rest are pruned on every run, so the retention is enforced by the same command that writes, not by a schedule nobody checks.
- [x] DATA-003/T3 — `make restore-rehearsal` into a throwaway database, asserting schema and row counts, printing the elapsed time
  Evidence: scripts/restore-rehearsal.py (make restore-rehearsal) — fetches the newest backup, decrypts it, restores into a throwaway database (never a live one), asserts the table set equals the current migration head and every row count is within tolerance of live, prints the elapsed time, and drops the scratch database. Verified against PostgreSQL 17.11: fourteen tables match, restore OK in 2.4s.
- [x] DATA-003/T4 — `make doctor` reports the last successful backup and the last successful rehearsal, and fails the second after two months
  Evidence: scripts/doctor.py — a Backups section reports the newest backup and the last rehearsal from BACKUP_TARGET, and doctor exits non-zero when the rehearsal is over two months old or has never run, so a stale restore is a failure of the feature rather than a missing chore. Verified: exit 1 on a rehearsal dated over two months back, exit 0 on a fresh one.
- [x] DATA-003/T5 — A restore runbook whose every command was executed in the rehearsal, with measured timings
  Evidence: docs/runbooks/data-003-restore.md — the production restore, owner present and application stopped, whose decrypt and pg_restore commands are the ones make restore-rehearsal runs and whose 2.4s timing is the one it measured; restoring over live data is deliberately left to this document rather than given a target of its own.

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
