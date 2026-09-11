# VALO Tech — Decision register

> **Not for `main`.** This document lives on `development` only (`.claude/CLAUDE.md` §1.1).

Every choice that shapes the product and is not settled by the code alone is filed here, once, with a stable anchor. Every other artifact links to the entry by its anchor and restates nothing: when an answer lands, only this file is edited and every reference is correct by construction.

An entry is filed the moment the choice surfaces, not when it is answered. Nothing blocks on an open decision — each ships a fail-closed safe default named on its `Status:` line.

---

## Open decisions

<a id="SEC-DEC-01"></a>
### `SEC-DEC-01` — What a changed field records in the audit: its name, or its value — OPEN

- **Decision:** The audit's `before`/`after` hold the fields a privileged write changed. Do they record the field **names** only, or the field **values** — and if values, how is a name or an e-mail kept out of a trail retained for seven years past an erasure?
- **Options:** **A** Names only — universally safe, but `INV-003` reads the audit as the portfolio's own history, and a field name tells a reader that a headline changed, not what it changed to · **B** Values, under a per-action allow-list of recordable fields — `portfolio.change` records the previous stage and headline, `config.change` the previous value, `account.role_change` the role and state, and no action may record `name` or `email`, so `DATA-R02`'s "no personal data" holds by construction rather than by the care of whoever writes the next call.
- **Recommendation:** **B**. Only **B** can express the portfolio history `INV-003` rests on and the undo context `CFG-001` reads, and it keeps `DATA-R02` mechanical: the allow-list is a fixed table checked at the one insert site (`SEC-002/T3`), so a field the list does not name cannot reach the trail. **A** is simpler but would force `INV-003` to grow the portfolio-history table the schema was deliberately built without. The cost of **B** is that the allow-list must be complete before the first audited write — which is why it is settled now, not discovered when `account.create` first records a row into a seven-year table.
- **Decision owner:** user
- **Blocks:** SEC-002/T4
- **Revises:** MAIL-001/T5 — the `mail.send` audit ships this decision's safe default (`before`/`after` null), recording that a send happened and by whom; a resolution to **B** records the subject and the recipient count in `after` under the allow-list
- **Status:** OPEN. Safe default: `apps/web/src/audit/record.ts:recordAudit` writes `before: null` and `after: null` on every audited write — the trail records that a privileged act happened and by whom, and holds no changed field until this settles. So the seven-year trail cannot hold a personal value it has no code to write, and the allow-list can be added at the one insert site when it lands.

<a id="AUTH-DEC-02"></a>
### `AUTH-DEC-02` — Is the session cookie signed with `SESSION_SECRET` — OPEN

- **Decision:** The session cookie carries a random token whose hash the `sessions` row stores (`AUTH-002` §3). Is that token additionally signed with `SESSION_SECRET`, so a tampered cookie is rejected before the row lookup and rotating the secret signs every live session out — or is the cookie the bare token, with `SESSION_SECRET` used for nothing on this path?
- **Options:** **A** Sign it — the cookie is `<token>.<HMAC(SESSION_SECRET, token)>`; rotating `SESSION_SECRET` becomes a real emergency sign-out lever and a tampered cookie fails before it reaches the database · **B** Leave it bare — validity is the `token_hash` lookup alone, `SESSION_SECRET` has no consumer on the session path, and the emergency lever is deleting the session rows (`AUTH-004`'s `session.invalidate_all`).
- **Recommendation:** **A**. It makes the emergency lever `env.example` and `CRED-001` document real, adds tamper rejection before a database round-trip, and gives `SESSION_SECRET` — a required credential — an actual consumer rather than leaving it orphaned. **B** is simpler but orphans a required credential and turns a documented security lever into a false statement, which is the defect this entry was opened on.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** AUTH-002/T1, AUTH-002/T3 — the cookie ships the bare-token safe default and the gate resolves it by lookup alone; a resolution to **A** signs the token with `SESSION_SECRET` on issue and verifies the HMAC in the gate before the lookup
- **Status:** OPEN. Safe default: the store validates by `token_hash` lookup and `SESSION_SECRET` is unused on the session path; `env.example` and `config` name the lever that works today — deleting the session rows — rather than claiming rotation signs sessions out, so no fail-open lever is documented while this waits.

<a id="OPS-DEC-02"></a>
### `OPS-DEC-02` — Which `X-Forwarded-For` hop is the client, for the sign-in rate limit — OPEN

- **Decision:** The per-address half of the sign-in rate limit (`AUTH-001` §3) keys on the client's network address. Behind Cloudflare and an ALB (`OPS-001` §3) the address arrives in `X-Forwarded-For`, which the client writes the left of and each proxy appends to. Which hop is the real client, and how many rightmost hops are trusted?
- **Options:** **A** The leftmost hop (as built) — the real client when nothing is bypassed, but forgeable, so an attacker sets any address and slips the per-address counter · **B** The rightmost hop — unforgeable, but it is the ALB's own address, which collapses all traffic onto one key and turns the per-address limit into a lockout of everyone at once · **C** The hop a fixed offset from the right equal to the number of trusted proxies (Cloudflare + ALB is two), which is correct but only once the chain is fixed by the deploy.
- **Recommendation:** **C**, once `OPS-001` fixes the proxy count; until then **A**, because the per-account counter is the binding protection — an attacker who forges addresses still meets the per-account limit, and the per-address limit is a best-effort second bound.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** AUTH-001/T2 — the route's `clientAddress` ships the leftmost-hop safe default; the answer changes which hop it reads
- **Status:** OPEN. Safe default: the leftmost `X-Forwarded-For` hop, with the trust boundary documented in the route. The per-account limit is unaffected and is the real protection against stuffing one account; the per-address limit is best-effort until the trusted-proxy count is known.

<a id="AUTH-DEC-04"></a>
### `AUTH-DEC-04` — Does a reset request invalidate a pending invitation, or are the two token kinds independent — OPEN

- **Decision:** Invitation and reset share one `invitations` table and one "one outstanding token per account" rule (`AUTH-003/T6`), so issuing a reset for an account deletes its outstanding invitation. For an account still `invited` — one that holds only its seven-day invitation link and no password — a reset request would therefore destroy the only way that person can get in, and until `AUTH-003/T3` mails a reset link it replaces it with a token nobody is told; anyone who knows an invited address could do this, unauthenticated. Should the two token kinds stay one-outstanding-together, or become independent so a reset never touches an invitation?
- **Options:** **A** Keep one mechanism and one outstanding token, and make a reset act only on an account that is already `active`, so a reset request against an `invited` account is a no-op and its invitation stands — the safe default shipped here. No schema change; the residual is that an active account which was somehow re-invited would still lose that invitation to its next reset. **B** Separate the kinds — a `kind` column (`invitation` | `reset`) on `invitations` and a one-outstanding index per `(account_id, kind)`, so a reset only ever deletes a prior reset and an invitation only a prior invitation. Fully independent, at the cost of a migration and the two mechanisms the design deliberately avoided.
- **Recommendation:** **A**. A reset is meaningless for an account with no password, so refusing it there costs nothing and closes the denial-of-access with no schema change; the residual **B** would address — an active account losing an invitation to a reset — is not reachable by any flow that exists, because no flow re-invites an active account. Reopen for **B** if such a flow is ever built.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** AUTH-003/T5 — `requestReset` ships the safe default (it conditions its delete and insert on `state = 'active'`, so an invited account's invitation is never destroyed); a resolution to **B** separates the token kinds in the schema instead
- **Status:** OPEN. Safe default: `requestReset` conditions its delete and its insert on `state = 'active'`, so a reset against an invited or suspended account writes nothing and leaves the invitation intact — fail-closed, and anti-enumeration-safe because the condition is a SQL predicate keyed by the address that matches nothing for a non-active account exactly as it matches nothing for a non-existent one.

<a id="ADMIN-DEC-01"></a>
### `ADMIN-DEC-01` — May an admin suspend or demote the last active admin, or themselves — OPEN

- **Decision:** `suspendAccount` and `changeRole` (`ADMIN-001/T3`, `T7`) mutate an account's state and role. Suspending or demoting the last admin who can sign in leaves the room with no admin able to act, and `suspendAccount` is a one-way door in code — nothing sets `state` back to `active` — with no account-creation caller and no first-admin bootstrap, so a zero-admin state is recoverable only from the database. The delete guard (`ADMIN-001/T5`) is specified to refuse deleting the last admin and yourself; do suspend and role-change refuse the same, and may an admin suspend or demote themselves while another admin remains?
- **Options:** **A** Suspend and role-change refuse the last active admin and refuse self, mirroring the delete guard — the fail-closed default shipped here. It makes the two unguarded one-click acts as safe as the guarded delete; the open edge is a self-suspend or self-demote while another admin remains, which A refuses and which is arguably legitimate. **B** Refuse only the last active admin, and allow acting on self while another admin exists — more permissive, at the cost of a second rule to keep right.
- **Recommendation:** **A** for now. Refusing self unconditionally costs an admin nothing they cannot do by asking the other admin, and the room has two admins by design; the edge **B** opens is not worth a second predicate until a real workflow needs it. The reinstate act (`suspended → active`) and the first-admin bootstrap are owed regardless of A or B, and are filed as their own work rather than blocked on this.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** ADMIN-001/T2, ADMIN-001/T3, ADMIN-001/T7 — all ship the safe default: `T3` and `T7` refuse before mutating when the subject is the actor, or the last admin who can sign in, counted `active` rather than by role alone — a suspended admin cannot sign in to undo anything, and reinstating one is itself an admin act, so counting the role would let a room with one active and one suspended admin be stranded (the count is race-safe under a `SELECT … WHERE role = 'admin' AND state = 'active' ORDER BY id FOR UPDATE` taken inside the transaction); and `T2`'s page hides the suspend control on the actor's own account rather than offer one the service would refuse. A resolution to **B** relaxes the self rule and lets the page offer that control.
- **Status:** OPEN. Safe default: `suspendAccount` and `changeRole` refuse when the subject is the last active admin or is the actor, returning the same `false` a no-op returns, so no single act can leave the room with no admin who can sign in or let an admin act on their own access — fail-closed, since the alternative is a one-click unrecoverable lockout behind an ordinary control.

<a id="ADMIN-DEC-02"></a>
### `ADMIN-DEC-02` — Is the account list sortable by a control, or served already sorted by last sign-in — OPEN

- **Decision:** `ADMIN-001` §3 says the list is "sortable by last sign-in, because that column is what makes a stale account visible." The list ships served in that order — stalest first, the never-signed-in above them (`ADMIN-001/T1`). Does "sortable" ask for a control the admin re-sorts with, or is a fixed order by last sign-in — which puts exactly what the column is for at the top — what the word asks for here?
- **Options:** **A** The served order, as shipped — the design names one sort key and one reason, the fixed order serves that reason directly, and with six to fifty accounts (§6) the whole list is one screen; a control would re-sort a list that already answers its one question · **B** A column-header control that re-sorts — the plain reading of "sortable," and once there is one it plausibly sorts the other columns too, at the cost of client interactivity on a server-rendered page and sort keys the design names no reason for.
- **Recommendation:** **A**. The design gives the column one purpose — making a stale account visible — and the served order delivers it with the stalest account above the fold; a re-sort control over a list already ordered by its one stated key adds a mechanism without adding an answer, and §1.10 cautions against building it with no second sort reason named. **B** is the literal reading of the word, which is why this is filed rather than decided silently: a re-sort would be a `searchParams` sort the existing `/admin` pages already shape, with no schema or API change.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** ADMIN-001/T1 — the list ships the fixed served order; a resolution to **B** adds a re-sort control to the page
- **Status:** OPEN. Safe default: the list is served `last_sign_in asc nulls first`, tie-broken by address, so the stalest and never-signed-in accounts are at the top and the design's stated reason for the column is met without a control — not fail-open in any sense, and superseded by a `searchParams` sort with no migration if **B** is chosen.

<a id="CMS-DEC-03"></a>
### `CMS-DEC-03` — Which library re-encodes an uploaded image, and whether SVG is sanitised or refused — OPEN

- **Decision:** `CMS-003` accepts raster images and must re-encode them so EXIF — including the GPS of where a screenshot was taken — does not survive (`CMS-003/T2`, `DATA-R02`), and accepts SVG, which it must sanitise to shape and text or refuse (`CMS-003/T3`). Node has no image re-encoder and no SVG sanitiser built in, so each needs a dependency, and a new dependency is the owner's (`§14`). Which raster re-encoder, and is SVG sanitised with a library or refused outright?
- **Options:** **A** Raster through `jimp` (pure JavaScript — no native build, so the Docker and serverless targets stay simple; slower, which a few dozen admin uploads never feel) and **refuse SVG** (no sanitiser to trust, the design's own stated fallback, `CMS-003` §6) · **B** Raster through `sharp` (native libvips — fast and ubiquitous, at the cost of a platform-specific build on every deploy target and a larger attack surface) and SVG sanitised through a library (`DOMPurify` over `jsdom`, or an SVG-specific sanitiser) · **C** some other split of the two.
- **Recommendation:** **A**. The volume is a few dozen images (`CMS-003` §6), so `sharp`'s native throughput buys nothing the room needs while adding a libvips build to every target; `jimp` re-encodes and drops EXIF in pure JavaScript with no native step. And the design already states that the honest move on SVG is to drop it rather than keep patching a sanitiser (`CMS-003` §6) — refusing it adds no dependency and removes the format most likely to carry script, at the cost of a logo arriving as PNG. This holds `CMS-003` to one pure-JavaScript dependency and no sanitiser. Reopen for **B** if a real SVG need arrives or the image volume outgrows what `jimp` serves.
- **Decision owner:** user
- **Blocks:** CMS-003/T2, CMS-003/T3
- **Status:** OPEN. Safe default: `CMS-003`'s upload is unbuilt, and when it lands it refuses every type it cannot yet process safely — raster images, for want of a re-encoder, and SVG, for want of a sanitiser — so no image can ship with its EXIF or a script intact. `CMS-003/T1` (sniff and refuse by type) and `CMS-003/T4` (content-hash storage) are buildable without this; only the processing waits.

<a id="CMS-DEC-04"></a>
### `CMS-DEC-04` — What carries a locale draft's translation: a self-hosted service, or an admin translating it in review — OPEN

- **Decision:** `CMS-005/T3` drafts a locale by translating each block's text and reassembling its marks span by span (`CMS-005` §3), which requires translating a marked span as a unit — a programmatic, per-span translator, not a whole-paragraph paste. The design leaves the carrier open and the product forbids an external general-purpose model (`.claude/CLAUDE.md` §1.5). Is the carrier a self-hosted translation service, or does drafting seed the target locale from the source for an admin to translate in the review screen, with no service? The two answers build different mechanisms, which is why `T3` cannot proceed until this settles.
- **Options:** **A** A self-hosted translation service (e.g. LibreTranslate) behind a `Translator` port — an automatic machine draft across twenty locales, at the cost of a service to deploy, secure and keep running and a per-span call path; this is what `T3`'s span-by-span reassembly is for · **B** No service: drafting seeds each target locale with the source blocks, their marks intact, and the admin writes the translation in the review screen (`CMS-005/T4`) before marking it reviewed — no new dependency, the human does the translation the state machine already routes through review, at the cost of no automatic first draft and a `T3` that seeds rather than translates.
- **Recommendation:** **B**. The room's investors are named people who mostly read English or Vietnamese (`CMS-005` §6), so the volume that would justify a translation service is not there; **B** ships the whole state machine (a `machine` row served to nobody, a `reviewed` row served — `CMS-R05`) with no new infrastructure, and `CMS-005/T4`'s review screen already exists to be where a human translates. The span-by-span reassembly `T3` specifies is only needed by **A**'s programmatic path; under **B** the seed carries the source marks unchanged and the reviewer edits text within them. The cost is honest — **B** has no automatic first draft, so twenty locales are twenty human translations — which is why the recommendation is not certain: if the room's content genuinely goes multilingual beyond English and Vietnamese, **A** pre-fills what the reviewer would otherwise type, and the reassembly becomes worth building. Reopen on that signal.
- **Decision owner:** user
- **Blocks:** CMS-005/T3
- **Status:** OPEN. Safe default: `CMS-005/T3` is unbuilt — drafting a machine locale is not yet a route — so no machine-drafted or untranslated text can reach a reader: `apps/web/src/content/locales.ts:localeFor` serves only a `reviewed` row (`CMS-005/T1,T2,T5`, built), and the authored language is served until a locale is reviewed (`I18N-R04`), which is correct with or without this decision.

<a id="MAIL-DEC-02"></a>
### `MAIL-DEC-02` — How a retry of the failed recipients stays idempotent — OPEN

- **Decision:** `MAIL-001/T6` re-sends to the recipients whose last attempt failed, and must never reach one who already received the message — a re-send that does is how a person receives investor mail twice, the one act this product cannot withdraw. `mail_log` records each attempt as its own row and never supersedes an earlier one, so a failed row stays `failed` after a later attempt succeeds and a second retry keyed on the same rows sends again. What mechanism makes the retry idempotent?
- **Options:** **A** A `retry_of` column on `mail_log` — a re-send row names the failed row it supersedes, and a failed row that has a successor is never eligible again, whatever the caller passes; the idempotency lives in the data, and the migration is additive · **B** An idempotency key per `(send, recipient)` that a re-send reuses, so a second attempt with the same key is refused at the log — more general, a larger build, and it must define what "the same send" is across a retry · **C** No column — the retry excludes a failed row when a later `accepted` row exists for the same account and subject; no migration, but two genuine sends with the same subject to one account collide, and the guarantee rests on subjects being unique · **D** No stored guarantee — the caller threads the new row ids forward each time, so an accepted row is never in the next retry set; correct only while every caller does so, which is the fragility the other three remove.
- **Recommendation:** **A**. It is the smallest change that puts the guarantee in the data rather than in a caller or a subject heuristic: `retry_of uuid REFERENCES mail_log(id)` is additive, and "a failed row with a successor is spent" is one predicate the retry reads. **C** is cheapest but wrong for two same-subject campaigns to one investor, which a fundraise produces; **D** rests the guarantee on the caller threading ids forward, the fragility the other three remove; **B** is the most general and the most to build for a send list of a few dozen. Filed rather than loop-settled because it is the first idempotency mechanism of its kind in this repository and it shapes `MAIL-002`'s table (`.claude/CLAUDE.md` §1.11).
- **Decision owner:** user
- **Blocks:** MAIL-001/T6
- **Status:** OPEN. Safe default: `MAIL-001/T6` is not built, so no automated retry exists and no path re-sends by naming prior rows — a double send is not reachable through a retry that is absent. `apps/web/src/mail/send.ts:send` writes each recipient's terminal state, so the mechanism this settles has the per-attempt record it will read; until then a failed recipient is re-reached only by composing a fresh send, a deliberate act whose recipient count is typed again (`MAIL-001/T4`), so a second delivery takes two deliberate sends rather than one button.

<a id="ADMIN-DEC-03"></a>
### `ADMIN-DEC-03` — Is an admin's resend or reset an audited act, and is the reset control offered before its mail exists — OPEN

- **Decision:** The person page (`ADMIN-001/T2`) lets an admin resend an invitation and start a password reset, and neither writes an audit row — the `audit.action` CHECK names no value for them, and `SEC-R04`'s enumerated set is create, suspend, role-change, delete and grant. Resend is narrowed to an `invited` account and hands back a single-use link; once `AUTH-003/T4` builds the page that accepts it, an admin could open that link and set the account's password — the takeover `ADMIN-001` §3 names — while the trail shows only the original `account.create`. Two questions on one surface: should resend (and reset) be audited; and should the reset control be offered before `AUTH-003/T3` mails the link, when the press reaches nobody yet?
- **Options:** **A** Audit the resend as a new `audit.action` value folded into the CHECK (the `ADMIN-001/T8` precedent folded `account.reinstate` in), with a `recordAudit` call inside `resendInvitation`'s transaction, and keep the reset control with the sentence it already carries. **B** Leave both unaudited, consistent with the letter of `SEC-R04`, and either keep or withhold the reset control until its mail exists.
- **Recommendation:** **A**. A link that can set a password is a privileged write the trail should hold; the narrowing to `invited` bounds the takeover but does not record it, and the fold is a known move. Reset is lower weight — it hands back nothing, so no capability is misattributed — but auditing it alongside costs one more CHECK value. Keep the reset control offered: the sentence it carries names exactly what did and did not happen, which is more honest than an absent control that leaves the admin guessing whether the console can reset at all.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** ADMIN-001/T2 — the page ships the safe default (resend and reset unaudited, resend narrowed to `invited`, the reset control offered with a sentence naming the gap); a resolution to **A** folds a new `audit.action` value and adds the `recordAudit` call inside `resendInvitation`'s transaction.
- **Status:** OPEN. Safe default: resend and reset write no audit row, `resendInvitation` acts only on an `invited` account so no existing password is overwritten, and the takeover is unreachable until `AUTH-003/T4` builds the accept page; the reset link is never handed to the admin — `requestReset` discards the plaintext token as it mints it — so there is no capability to misattribute today. The fold that would audit a resend waits on this decision.

---

## Resolved decisions

<a id="I18N-DEC-02"></a>
### `I18N-DEC-02` — The Next.js application's own i18n framework — RESOLVED 2026-09-11

- **Decision:** The gateway localises through a static dictionary (`I18N-001`: `assets/i18n.js` + `data-i18n`), which suits a file served without a build. The application under `apps/web` renders server-side, has no i18n runtime and no design for one, yet `AUTH-001/T4` and every gated surface must render in the reader's locale across twenty (`I18N-R01`, `I18N-R02`). What framework does the application localise through, and where do its dictionaries come from?
- **Options:** **A** `next-intl` — the App Router standard: server components, locale negotiation, message catalogues; the twenty gateway locales become its content, adapted to the catalogue shape · **B** A thin custom loader that reads the gateway's existing `assets/i18n.js` dictionaries directly, so one dictionary serves both surfaces and no dependency is added · **C** Another library (`@lingui`, `react-i18next`).
- **Recommendation:** **A**. `next-intl` is built for this rendering model and carries the locale routing, negotiation and pluralisation the application would otherwise hand-roll; the gateway's twenty locales become its message content, so the translation already done is reused rather than redone. **B** adds no dependency but reimplements what the library solves, against a dictionary shaped for a static page. The cost of **A** is one dependency and a catalogue format, which is the shape the translation skills already target.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-11 — **A**, `next-intl`. The owner chose the App Router standard: the application localises through next-intl's server-component message catalogues, and the gateway's twenty locales become that catalogue's content rather than being re-translated. `AUTH-001/T4` and `AUTH-004/T2` are unblocked; the localised surfaces the application owes — the auth forms, the reading views, the room shell, and the gateway served by the application — build on this framework.

<a id="SEC-DEC-02"></a>
### `SEC-DEC-02` — Whether every route renders on demand, to reach the policy's nonce — RESOLVED 2026-09-07 · loop-settled

- **Decision:** `SEC-001` §3 fixes a Content-Security-Policy with no `unsafe-inline`, and Next writes the rendered tree into inline `<script>` tags on every page, so the policy must admit those tags by a nonce. Next stamps a nonce only while rendering a request. Does every route therefore render on demand, or does the application keep build-time prerendering and reach the same protection another way?
- **Options:** **A** Every route renders on demand, declared once in the root layout · **B** Keep prerendering and admit `'unsafe-inline'` · **C** Keep prerendering and use Next's experimental subresource-integrity mode in place of the nonce.
- **Decision owner:** user — settled by the loop under §1.11, reversible at any time
- **Settled by:** loop
- **Forcing source:** MEASUREMENT — under `script-src 'self'` with no nonce, `next start` served `/` from the build's prerender (`x-nextjs-cache: HIT`) and Chrome reported "Executing inline script violates the following Content Security Policy directive 'script-src 'self''" twice, then "Minified React error #412": the page painted and never hydrated. Putting the nonce in the header alone changed nothing, because the served HTML's `<script>` tags carried no `nonce` attribute — a prerendered page is rendered before any request exists to mint one. **C** was built and measured rather than reasoned about: `experimental.sri` added `integrity` to the six external chunk tags and left both inline tags exactly as they were, so it cannot satisfy this policy. **B** is refused by doctrine, `.claude/CLAUDE.md` §5 Z-axis — "a Content-Security-Policy without `unsafe-inline` in the app". Under **A** all eight tags carried the nonce, `main` carried a React fiber, and the console was empty. **B**'s strongest case is that it alone keeps page HTML cacheable at an edge; it loses because `SEC-001` §3 already states the trade in the other direction — an `unsafe-inline` added to make one page work removes the protection from every page.
- **Overturned by:** Next stamping nonces into prerendered output, or this application ceasing to emit inline script — at which point the root layout's `dynamic` export is deleted and prerendering resumes with nothing else changed.
- **Status:** RESOLVED 2026-09-07 — **A**. `export const dynamic = 'force-dynamic'` is declared once, in `apps/web/src/app/layout.tsx`, so a route added later inherits it instead of having to remember it. Every route the application renders is then dynamic and nonced. The one exception is Next's internal `/_global-error` fallback: the framework prerenders it static (it does not extend a layout's `dynamic` to that route, `next/dist/build/utils.js`) and serves it with `s-maxage=31536000`, and its built-in body carries no nonce — so a direct request to that URL is CSP-degraded, while a real root-layout crash renders the custom `apps/web/src/app/global-error.tsx` dynamically, nonced and styled (measured: styles apply, no CSP violation). The consequence — a CDN must front the assets and not cache the documents, `/_global-error` above all — is **raised for `OPS-001`**, not settled here: whether and how a CDN sits in front of this application is a hosting decision that task and the owner own, and no forcing source here reaches it.

<a id="AUTH-DEC-03"></a>
### `AUTH-DEC-03` — The Argon2id implementation library — RESOLVED 2026-09-07 · loop-settled

- **Decision:** `AUTH-001` §3 mandates Argon2id (memory 19 MiB, iterations 2, parallelism 1); Node ships no Argon2id, so a library is needed. Which?
- **Options:** **A** `@node-rs/argon2` — Rust via napi-rs, prebuilt binaries · **B** `argon2` (node-argon2) — a C binding built at install by node-gyp · **C** `hash-wasm` — pure WebAssembly, no native code.
- **Decision owner:** user — settled by the loop under §1.11, reversible at any time
- **Settled by:** loop
- **Forcing source:** MEASUREMENT — `npm install @node-rs/argon2@2.0.2` on this Node 24 Windows box reported `added 2 packages` with no node-gyp step, and a round-trip produced `$argon2id$v=19$m=19456,t=2,p=1$…` and verified a correct password true and a wrong one false. **B** needs a C toolchain at install, which this box and a slim CI image may lack; **C** is portable but slower, with no offsetting benefit at a handful of sign-ins. **A** installs prebuilt on win32-x64 and linux-x64 — dev and the AWS deploy. Option **C**'s strongest case is zero native code in the tree; it loses only because **A** ships no build step here either, so portability does not separate them, and **A** is the faster of the two.
- **Overturned by:** `@node-rs/argon2` dropping a prebuilt binary for a target this deploys to, or the hashing moving off Node — at which point the algorithm and parameters (fixed by `AUTH-001`) move to another library unchanged.
- **Status:** RESOLVED 2026-09-07 — **A**. `@node-rs/argon2` is a dependency of `apps/web`; the hashing lives in one module both `AUTH-001` and `AUTH-003` call, so the parameters cannot diverge between sign-in and invitation.

<a id="AUTH-DEC-01"></a>
### `AUTH-DEC-01` — The session store: the auth library's, or the schema's own — RESOLVED 2026-09-07 · loop-settled

- **Decision:** `INFRA-DEC-01` named Auth.js as the expected shape and `AUTH-002` §6 left the library-or-hand-rolled choice to the build, requiring a register entry rather than a silent substitution. `DATA-001/T3` built the store; which shape did it take?
- **Options:** **A** Auth.js with its database adapter · **B** A hand-rolled `sessions` table the application's own middleware resolves.
- **Decision owner:** user — settled by the loop under §1.11, reversible at any time
- **Settled by:** loop
- **Forcing source:** MEASUREMENT `docs/designs/auth/auth-002-session-and-role-gate.md` — the store must support server-side invalidation ("every session for that account is deleted") and must not hold a presentable credential ("stores only the token's hash ... a database dump is then not a set of live sessions"). Auth.js's Credentials provider cannot use database sessions, so that invalidation is unbuildable on it, and Auth.js's session model stores the raw session token, the exact property `token_hash` exists to deny. Option **A**'s strongest case is one operational surface across the family; it fails because the two behavioural guarantees `AUTH-002` already fixed are unbuildable on Auth.js's session model, so adopting it would mean rewriting them rather than inheriting them.
- **Overturned by:** Auth.js gaining a database-session Credentials path that stores only a token hash — at which point the store could move onto it with no change above `AUTH-002`.
- **Status:** RESOLVED 2026-09-07 — **B**. `sessions` and `invitations` are hand-rolled tables (`apps/web/migrations/1788758032000_auth_store.sql`); `next-auth`/`@auth/*` is not a dependency, and `AUTH-002`'s middleware resolves the cookie to an account.

<a id="INFRA-DEC-06"></a>
### `INFRA-DEC-06` — The application's data stack: migration tool, query layer, test runner — RESOLVED 2026-09-07

- **Decision:** `INFRA-DEC-01` settled Next.js + App Router + PostgreSQL + Auth.js but not the three foundational pieces everything in `DATA-001` and above is built on: the migration tool, the query layer, and the test runner. `DATA-001`'s design fixes the shape they must fit — the migration is the source of truth for the schema, no ORM generates it, and the types are written against it.
- **Options:** **A** node-pg-migrate + Kysely + Vitest/Playwright · **B** plain `.sql` + a custom runner + raw `pg` + hand-written types · **C** Drizzle ORM + drizzle-kit.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-07 — **A**. `node-pg-migrate` gives real up-and-down SQL migrations, which `DATA-R06` requires be run rather than written. **Kysely** is the query layer `DATA-001` already describes without naming: it owns no schema, it is a typed surface over the one the migrations built, and every query is checked at compile time against types written against that schema. **Vitest** for unit and integration, **Playwright** (already vendored for the gateway) for end to end. **C** was rejected on the merits — it defines the schema in TypeScript and inverts the one principle the data layer is built on — and **B** was the fallback if no query-layer dependency were wanted, at the cost of hand-maintained types that drift from the schema silently. The consequence: the app is scaffolded on this set, and `DATA-001`'s migrations are node-pg-migrate SQL with the types under a hand-written Kysely schema whose agreement with the migration is proved by `apps/web/src/db/db.test.ts`, run in CI, column by column.

<a id="INFRA-DEC-03"></a>
### `INFRA-DEC-03` — Where the application runs, and how valotech.org reaches it — RESOLVED 2026-09-07

- **Decision:** Which host runs the Next.js application, and how the domain is pointed at it without the gateway going dark.
- **Options:** **A** A small VPS running the app and PostgreSQL under Docker, with Cloudflare in front as it is today · **B** A managed platform (Vercel, Fly, Railway) with a managed PostgreSQL, keeping Cloudflare for the domain · **C** AWS, matching where the products run.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-07 — **C**. The ecosystem runs on AWS and the owner wants this on the same ground: one account, one identity model, one place to look when something is wrong, and no second operational vocabulary to learn for the smallest product in the family. The cost is a higher floor of things that must be right for a page with a dozen readers, and `OPS-001` is written to keep that floor as low as AWS allows.

<a id="INFRA-DEC-05"></a>
### `INFRA-DEC-05` — Which AWS shape, given that `INFRA-DEC-03` chose AWS — RESOLVED 2026-09-07 · loop-settled

- **Decision:** AWS is not one thing. Within it: join the ecosystem's EKS cluster, run ECS Fargate, run App Runner, or run EC2 with Docker — and which managed database.
- **Options:** **A** ECS Fargate + RDS PostgreSQL + ALB + Route 53 + ACM, described in Terraform under `deploy/` · **B** The ecosystem's EKS cluster, as VALO Ads and VALO Pocket are designed for · **C** EC2 with Docker Compose + RDS · **D** App Runner + RDS.
- **Decision owner:** user — settled by the loop under §1.11, reversible at any time
- **Settled by:** loop
- **Forcing source:** MEASUREMENT `VALOAds/docs/decisions-log.md` — *"no EKS cluster is provisioned, so nothing is failing today; this decides what the first one does"*. **B**'s premise is false as filed: there is no cluster to join, so choosing it means provisioning the ecosystem's first EKS cluster to serve a corporate homepage, and the cluster's shape would then be decided by the smallest workload that will ever run on it. DOCTRINE §1.10 — build only what serves a real caller — then separates the remaining three: **C** puts host patching back on the owner, which is the one thing AWS was chosen to remove; **D** has no VPC-attached database path without extra work; **A** is the smallest shape that is genuinely AWS, genuinely managed, and genuinely operable by one person. The rejected option's strongest case is **B**'s: one operational surface for the whole family is worth real money, and it becomes right the day the cluster exists for another product — at which point moving is a deployment change and not an application change, because nothing above `OPS-001` knows what runs it.
- **Overturned by:** the ecosystem provisioning an EKS cluster for another product. When that lands, this repository's deployment moves onto it and this entry is superseded rather than argued with.
- **Status:** RESOLVED 2026-09-07 — **A**. ECS Fargate, RDS PostgreSQL, an ALB, Route 53 and ACM, all in Terraform under `deploy/`, with the EKS path named so it is a move rather than a rewrite.

<a id="MAIL-DEC-01"></a>
### `MAIL-DEC-01` — Which service carries mail to investors — RESOLVED 2026-09-07

- **Decision:** How a message an admin composes actually reaches an investor's inbox.
- **Options:** **A** A transactional mail provider (Resend, Postmark, SES) over API · **B** SMTP against the company's existing mailbox · **C** No sending at all — the admin console composes and the admin sends from their own client.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-07 — **B**. SMTP against the company's own mailbox: no third party holds an investor's address, no processor agreement is needed, and the credential is one environment variable. What is given up is the bounce signal — SMTP answers once, at hand-off, and says nothing afterwards — so `MAIL-002` cannot mark an address dead and the suppression list is entirely ours. That consequence is written into both mail designs rather than left to be discovered, and it is the honest reason to revisit this if a send ever goes to more than a few dozen people.

<a id="OPS-DEC-01"></a>
### `OPS-DEC-01` — Whether the site measures anything about visitors — RESOLVED 2026-09-07

- **Decision:** Does valotech.org collect analytics, and if so of what kind.
- **Options:** **A** Nothing at all · **B** Cookieless server-side counts of page views and languages · **C** A conventional analytics product with a consent banner · **D** Whatever the rest of the ecosystem does on its own public pages.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-07 — **D**, and what that resolves to was read from the siblings rather than assumed. Every VALO web surface carries `legal/privacy`, `legal/cookies` and `legal/terms`, and a consent banner with three categories — `necessary`, fixed on; `analytics`, default **off**; `marketing`, default **off** — whose choice is stored per visitor under a versioned key and can be withdrawn. VALO Tech adopts the same surface and the same defaults, so a person arriving from any product page meets the same posture. Analytics is therefore **permitted and off**: nothing non-essential loads until a visitor turns it on, and which analytics is loaded when one does is a later choice with no compliance weight, because the consent surface that governs it is the part being adopted now. `LEGAL-GLOBAL-002` carries the posture and `SITE-006` builds the pages and the banner.

<a id="CMS-DEC-01"></a>
### `CMS-DEC-01` — Whether the gateway and the investor room share one content system — RESOLVED 2026-09-07

- **Decision:** The investor room needs a content system an admin can write in. The gateway's own words are also content. One system for both, or two?
- **Options:** **A** Two systems — the content system manages what an investor reads (reports, updates, achievements, decks), and the gateway's words stay in the page and its dictionary, changed by commit; the two share the audit trail and the locale catalogue · **B** One system for every word the company publishes.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-07 — **A**. The two carry different risk and therefore want different processes: a wrong word on the gateway is the company's face, in twenty languages, behind a CDN, read by people deciding whether to make contact at all; a wrong word in an update is seen by a dozen people who already know us and is corrected in a minute. One system would have to pick a single process, and both choices are bad — either an update waits on twenty reviewed locales, or the gateway publishes as loosely as an update. The direction this can move is towards merging, which is why it starts apart: splitting a merged store means dividing rows that already exist.

<a id="CMS-DEC-02"></a>
### `CMS-DEC-02` — Whether a third role appears with the content system — RESOLVED 2026-09-07

- **Decision:** A content system usually separates who writes from who publishes. Does VALO Tech add an editor role, or does the admin do both?
- **Options:** **A** Exactly two roles: an admin writes and publishes; an investor reads · **B** A third `editor` role that drafts and cannot publish, with an admin approving.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-07 — **A**. The team is small enough that the writer and the approver are the same person, so the second role would be held by nobody while still having to be honoured by every query, every screen and every access test that ships. `CMS-004`'s preview is what the approval step was actually for, and it costs one role instead of two. If a person is hired who should draft and not publish, the role is added then — with a name attached to it, which is the condition PRD §4 sets.

<a id="I18N-DEC-01"></a>
### `I18N-DEC-01` — What happens to a string that exists in English and nowhere else — RESOLVED 2026-09-07

- **Decision:** Two principles in this repository disagree. `P-05` says twenty languages or none, and calls an English-only string unfinished. `I18N-R04` says a missing key falls back to English rather than showing a raw key. When new copy is written, which governs?
- **Options:** **A** A machine draft is produced for every locale and shown to nobody; an admin reads and marks each locale reviewed; until then the reader sees the authored language · **B** Publication is blocked until all twenty locales are reviewed · **C** The machine draft is published immediately and reviewed afterwards.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-07 — **A**, and the two principles are reconciled rather than ranked: `P-05` governs what may be *published as a translation*, and `I18N-R04` governs what a reader sees when one does not exist yet. A machine draft is not a translation, so publishing one would breach `P-05`; showing the authored language is exactly the fallback `I18N-R04` describes. **B** was rejected because an urgent correction that waits on twenty reviews is a correction people route around through code, which is worse than the gap it was meant to prevent. **C** was rejected because a machine translation reads grammatically and lifelessly, and no mechanical check in this repository can see the difference — the eleven locales at `I18N-001/T4` are open for exactly that reason. `CMS-005` carries the per-locale state this requires.

<a id="INFRA-DEC-04"></a>
### `INFRA-DEC-04` — Whether this repository is public while the app is built — RESOLVED 2026-09-06

- **Decision:** The GitHub repository is public, so every branch is readable by anyone without authentication — `raw.githubusercontent.com/VALOTech/VALOTech/development/docs/PRD.md` returns 200 and its content. The planning documents are therefore not hidden by living on `development`, whatever `main` carries.
- **Options:** **A** Accept it for now and make the repository private when the application replaces the static site · **B** Make it private immediately, which requires a paid plan for GitHub Pages to keep serving valotech.org · **C** Move the planning documents to a separate private repository.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-06 — **A**. A technically-minded reader digging through the repository is not a problem the owner wants solved today, and the repository goes private when the application takes over from the static page — at which point Pages is no longer serving from it and the plan requirement disappears. What was done anyway is narrower and independent: `main` now carries only the site, so the material is not served by the website itself and is not indexed with it.

<a id="INFRA-DEC-01"></a>
### `INFRA-DEC-01` — The architecture of the application — RESOLVED 2026-09-06

- **Decision:** What shape the product takes once it stops being a static site.
- **Options:** **A** Next.js full-stack, one application: App Router, route handlers, PostgreSQL, Auth.js, SMTP · **B** A Go API plus a Next.js web application, matching VALO Ads · **C** Keep the public page static and build a separate application for the gated area only.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-06 — **A**. The reference design is already a Next.js App Router tree, so the scene and the content port across almost unchanged; the domain is roughly six tables and two roles, which a separate API service would be built for and never need. The cost accepted is that the ecosystem's Go-side gate scripts do not transfer and their equivalents are written here, and that a future mobile client would force the API out into its own service.

<a id="INFRA-DEC-02"></a>
### `INFRA-DEC-02` — Where the work happens, and what serves the site meanwhile — RESOLVED 2026-09-06

- **Decision:** Whether to bootstrap the project in this repository or start a new one, and what happens to the live site during the build.
- **Options:** **A** Bootstrap in place; `main` keeps serving the static site until the application replaces it · **B** A new `valotech-app` repository, this one staying a static site · **C** Convert immediately and take the site down.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-06 — **A**, with the full three-branch model created: `development`, `staging`, `production` alongside `main`. One repository means the content and its twenty translations are never held in two places that can drift. The consequence, which turned out to matter more than the process argument, is that `main` publishes: everything on it is readable at valotech.org, so the planning documents this decision is filed in must never land there. `.githooks/pre-push` encodes the rest — this side may push `main` and `development`; `staging` and `production` are creatable once and never updatable, because promotion is the owner's.

<a id="SITE-DEC-01"></a>
### `SITE-DEC-01` — What the public page carries and what moves behind the sign-in — RESOLVED 2026-09-06

- **Decision:** The gateway was a hybrid: it carried How-we-deliver and the product portfolio, which the reference release puts behind its sign-in, and it put the reader's own place in the story after the reasons to believe it rather than before.
- **Options:** **A** Follow the reference exactly — move How-we-deliver, the portfolio and Pricing behind the sign-in · **B** Follow it but keep Pricing public · **C** Keep Pricing and How-we-deliver public, move only the portfolio.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-06 — **A**. Chapters now run in the reference's order and the two gated ones are hidden from a visitor. Nothing was deleted: the copy and its twenty translations stay in the document, because they are what the investor deck will carry and a chapter cut to hide it is a chapter to write again. What "Pricing" turned out to mean is recorded separately at `#SITE-DEC-03`.

<a id="SITE-DEC-02"></a>
### `SITE-DEC-02` — How the page behaves on a very large screen — RESOLVED 2026-09-06

- **Decision:** On a 4K frame the world was an eighth of the width and the type was capped at its 1440-tuned sizes, so the whole page read as the same page seen from further away.
- **Options:** **A** Widen the reading column and the type scale above 2000px as well as the world · **B** Enlarge only the world · **C** Defer both until the application is rebuilt.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-06 — **A**. One factor, `--up`, grows the fixed type sizes, the reading column and the cover's column together: 1 below 2000px, 1.32 at 3840. Verified byte-identical at 1920 and clean at 2560 and 3840.

<a id="SITE-DEC-03"></a>
### `SITE-DEC-03` — What the section labelled Pricing actually is — RESOLVED 2026-09-06 · loop-settled

- **Decision:** `SITE-DEC-01` moves "Pricing" behind the sign-in. Does the section the nav called Pricing go with it?
- **Options:** **A** Keep the section as the public contact close and remove only the nav item that misnames it · **B** Gate the whole section, as the instruction reads · **C** Gate the prose and keep the call to action, writing a new heading for it in twenty languages.
- **Decision owner:** user — settled by the loop under `.claude/CLAUDE.md` §1.11, reversible at any time
- **Settled by:** loop
- **Forcing source:** MEASUREMENT `index.html:#engage` — the section is not a price list. Its own lede reads `"Pricing is part of the design conversation, not a published menu."` and the block contains the page's only closing call to action, `data-i18n="cta.start"`. Option **B**, restated as what shipping it requires, removes the gateway's closing invitation to make contact — which is the opposite of what the instruction was for. **B**'s strongest case is that the owner said Pricing moves and the loop is second-guessing a plain instruction; it does not survive, because the instruction's own purpose was to stop the public page reading as an investor deck, and a contact close is the least investor-facing thing on it.
- **Overturned by:** the section beginning to publish actual prices, or the closing call to action moving somewhere else on the page.
- **Status:** RESOLVED 2026-09-06 — **A**. The section stays; the nav item that called it Pricing is gone.

<a id="SCENE-DEC-01"></a>
### `SCENE-DEC-01` — Whether the satellites' paths are drawn — RESOLVED 2026-09-06

- **Decision:** The scene drew no orbital rings. A drawn path is a promise about where a body will be, and an earlier version broke that promise by drawing two rings for three bodies.
- **Options:** **A** One ring per body, each being that body's own path · **B** No rings, as before · **C** Two rings, as the reference has them.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-06 — **A**, on the CEO's instruction, reversing the earlier no-rings call. Each ring is the path of the body that rides it, drawn before the bodies so a label's plate covers it, revealed with its body, and running on a duration coprime with the other two so the three do not read as one blinking figure.
