# VALO Tech — Decision register

> **Not for `main`.** This document lives on `development` only (`.claude/CLAUDE.md` §1.1).

Every choice that shapes the product and is not settled by the code alone is filed here, once, with a stable anchor. Every other artifact links to the entry by its anchor and restates nothing: when an answer lands, only this file is edited and every reference is correct by construction.

An entry is filed the moment the choice surfaces, not when it is answered. Nothing blocks on an open decision — each ships a fail-closed safe default named on its `Status:` line.

---

## Open decisions

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

- **Decision:** Invitation and reset share one `invitations` table and one "one outstanding token per account" rule (`AUTH-003/T6`), so issuing a reset for an account deletes its outstanding invitation. For an account still `invited` — holding only its seven-day invitation link and no password — a reset request would destroy the only way that person can get in, replacing it with a token nobody is told until `AUTH-003/T3` mails one. Today `requestReset`'s only caller is the admin-gated person page, so the act is an admin's; it becomes reachable unauthenticated when the public `/forgot` ships (`AUTH-DEC-05` kept self-service reset). Should the two token kinds stay one-outstanding-together, or become independent so a reset never touches an invitation?
- **Options:** **A** Keep one mechanism and one outstanding token, and make a reset act only on an account that is already `active`, so a reset request against an `invited` account is a no-op and its invitation stands — the safe default shipped here. No schema change; the residual is that an active account which was somehow re-invited would still lose that invitation to its next reset. **B** Separate the kinds — a `kind` column (`invitation` | `reset`) on `invitations` and a one-outstanding index per `(account_id, kind)`, so a reset only ever deletes a prior reset and an invitation only a prior invitation. Fully independent, at the cost of a migration and the two mechanisms the design deliberately avoided.
- **Recommendation:** **A**. A reset is meaningless for an account with no password, so refusing it there costs nothing and closes the denial-of-access with no schema change; the residual **B** would address — an active account losing an invitation to a reset — is not reachable by any flow that exists, because no flow re-invites an active account. Reopen for **B** if such a flow is ever built.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** AUTH-003/T5 — `requestReset` ships the safe default (it conditions its delete and insert on `state = 'active'`, so an invited account's invitation is never destroyed); a resolution to **B** separates the token kinds in the schema instead
- **Status:** OPEN. Safe default: `requestReset` conditions its delete and its insert on `state = 'active'`, so a reset against an invited or suspended account writes nothing and leaves the invitation intact — fail-closed, and anti-enumeration-safe because the condition is a SQL predicate keyed by the address that matches nothing for a non-active account exactly as it matches nothing for a non-existent one.

<a id="ADMIN-DEC-01"></a>
### `ADMIN-DEC-01` — May an admin suspend or demote the last active admin, or themselves — OPEN

- **Decision:** `suspendAccount` and `changeRole` (`ADMIN-001/T3`, `T7`) mutate an account's state and role. Suspending or demoting the last admin who can sign in leaves the room with no admin able to act — and reinstating a suspended admin is itself an admin act (`ADMIN-001/T8`), so once the last active admin is gone no one left in the application can bring one back, and a zero-active-admin state is recoverable only from the database. The delete guard (`ADMIN-001/T5`) refuses deleting the last admin and yourself; do suspend and role-change refuse the same, and may an admin suspend or demote themselves while another admin remains?
- **Options:** **A** Suspend and role-change refuse the last active admin and refuse self, mirroring the delete guard — the fail-closed default shipped here. It makes the two unguarded one-click acts as safe as the guarded delete; the open edge is a self-suspend or self-demote while another admin remains, which A refuses and which is arguably legitimate. **B** Refuse only the last active admin, and allow acting on self while another admin exists — more permissive, at the cost of a second rule to keep right.
- **Recommendation:** **A** for now. Refusing self unconditionally costs an admin nothing they cannot do by asking the other admin, and the room has two admins by design; the edge **B** opens is not worth a second predicate until a real workflow needs it. The reinstate act (`suspended → active`) and the first-admin bootstrap are owed regardless of A or B, and are filed as their own work rather than blocked on this.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** ADMIN-001/T2, ADMIN-001/T3, ADMIN-001/T7 — all ship the safe default: `T3` and `T7` refuse before mutating when the subject is the actor, or the last admin who can sign in, counted `active` rather than by role alone — a suspended admin cannot sign in to undo anything, and reinstating one is itself an admin act, so counting the role would let a room with one active and one suspended admin be stranded (the count is race-safe under a `SELECT … WHERE role = 'admin' AND state = 'active' ORDER BY id FOR UPDATE` taken inside the transaction); and `T2`'s page hides the suspend control on the actor's own account rather than offer one the service would refuse. A resolution to **B** relaxes the self rule and lets the page offer that control.
- **Status:** OPEN. Safe default: `suspendAccount` and `changeRole` refuse when the subject is the last active admin or is the actor, returning the same `false` a no-op returns, so no single act can leave the room with no admin who can sign in or let an admin act on their own access — fail-closed, since the alternative is a one-click unrecoverable lockout behind an ordinary control.

---

<a id="SEC-DEC-03"></a>
### `SEC-DEC-03` — Whether text an admin wrote may enter the seven-year trail — OPEN

- **Decision:** `SEC-DEC-01` keeps a person out of the audit by naming fields: no action may record `name` or `email`. Three fields it does name carry text an admin typed rather than a value the system chose — `config.change` records the value of `room.banner` and `room.signin_message`, `mail.send` records the subject an admin wrote, and `portfolio.change` will record the 140-character `headline` once `INV-003` builds the board that writes it. Either can contain a person’s name, so the field-name rule holds while the row still carries a person into a table kept seven years past an erasure. Does the trail keep those values as written, or does something narrower stand in for them?
- **Options:** **A** As written (as built) — the values are staff’s own words about the company, and what a setting said when it changed is the question the row exists to answer · **B** Record the key and omit the value for the free-text setting types, keeping it for `int` and `bool`, and record the mail subject’s and the headline’s length rather than their text — no free text reaches the trail, at the cost of a `config.change` row that cannot say what the banner became, a `mail.send` row that cannot be matched to the message and a portfolio history that cannot say what the headline said · **C** Record a digest of the free text, which matches a row to a message without holding it and answers nothing else.
- **Recommendation:** **A**. These values are written by staff about the company rather than collected about a person, so `DATA-R01`’s minimisation is not engaged the way it is for an investor’s row, and the residue is bounded by who can write it — two admins, whose own rows already name them. **B** removes exactly the thing a reader months later is asking about, and **C** keeps a row nobody can read. Reopen if a free-text setting is ever filled from something a visitor or an investor writes, which would turn staff prose into collected data.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** SEC-002/T4 — the allow-list ships `value` for `config.change`, `subject` for `mail.send` and `headline` for `portfolio.change`; the answer changes what those rows hold, and what `DATA-002`’s erasure manifest says the trail is retained for
- **Status:** OPEN. Safe default: the values as written, which is what `SEC-DEC-01` names. `DATA-R02` holds by construction for every field the system itself fills; what is at issue is only text a named admin typed, and no path today lets anybody else fill it.

---
<a id="SEC-DEC-04"></a>
### `SEC-DEC-04` — Whether a grant’s audit row names the item it gave or took away — OPEN

- **Decision:** `grant.add` and `grant.remove` record the account whose access changed and nothing else (`apps/web/src/content/grants.ts`), and `SEC-DEC-01`’s allow-list gives them no recordable field. A revocation therefore says access was taken away without saying from what — the `content_grants` row that would answer it is the row the revocation deletes. `DECK-004` §1’s own scenario is somebody who left a process eighteen months ago still being able to read; the question it raises is *which deck*, and the trail cannot answer it. Should both actions record the item?
- **Options:** **A** Record `item_id` on both — a uuid, so no person enters the trail, and an access change stays answerable years later without a database restore · **B** Leave both empty as shipped, and treat `content_grants` as the record of who may read what, accepting that a removed grant is gone from it · **C** Record `item_id` on `grant.remove` alone, since an addition is still readable from the live row and only a removal destroys its own evidence.
- **Recommendation:** **A**. `SEC-R04` holds a privileged write so it can be answered for later, and an access change nobody can attribute to a document answers half the question; the field is a uuid, so `DATA-R02` is untouched. **C** saves one field and leaves a reader unable to pair a removal with the addition it reverses. **B** is the shipped safe default and is defensible only while nothing has been revoked from anybody.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** CMS-006/T3 — the grant and revoke writes ship auditing the account alone; the answer adds a field to the allow-list and to both call sites
- **Status:** OPEN. Safe default: both lists empty and the account as the subject, as shipped — which records that access changed and is the fail-closed choice for `DATA-R02`, since a field not recorded cannot carry anything. Nothing is lost while grants are only being added; what a removal destroys is recoverable only until the first revocation.

---
<a id="DATA-DEC-01"></a>
### `DATA-DEC-01` — Whether widening a shipped migration’s CHECK counts as a fold — OPEN

- **Decision:** `DATA-R07` defines a fold as rewriting the baseline so a fresh database reaches **the same final schema**, proved by applying the old chain and the new baseline to two throwaway databases and diffing the catalogues. Eight shipped rows — `ADMIN-001/T1`, `ADMIN-001/T8`, `ADMIN-001/T9`, `DECK-002/T1`, `DECK-002/T2`, `CMS-006/T5`, `CMS-007/T1`, `RPT-002/T1` — instead edit `1788752441424_platform.sql` in place to add a column or widen a CHECK, reaching a **different** final schema on purpose, on the reasoning that `node-pg-migrate` stores no checksum and a fresh database is what deploys. By `DATA-R07`’s own words that is a re-stamp, and the proof it prescribes cannot pass. It is safe exactly while every database that matters can be dropped and recreated. Is the convention right and the rule’s wording wrong, or the reverse?
- **Options:** **A** Amend `DATA-R07` to name this second, narrower move — a schema-widening edit is permitted while no database outside a developer’s machine has applied the file, ends at `OPS-001`, and every such edit carries a recreate-your-database line in its ledger row · **B** Hold the rule as written: a change to a shipped migration is always a new numbered migration, which costs one file per change and makes the baseline a chain nobody reads whole · **C** Keep editing but add a checksum gate that fails when a tracked migration’s bytes move, turning a silent divergence into a red build.
- **Recommendation:** **A** with **C** after it. The convention is right for this repository today — nothing is deployed, the baseline stays readable, and eight rows already depend on it — but the rule does not license it, so a reader cannot tell a sanctioned edit from a mistake. **C** is what makes **A** safe once anything is deployed, and `OPS-001` is where it stops being optional. **B** is correct for any repository with a live database and wrong for the cost it charges here.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** ADMIN-001/T9 — the newest edit made under the convention, and the first whose new values production code reads at request time: on a database that applied the file before it, a resend and an admin reset raise the CHECK inside their transaction
- **Status:** OPEN. Safe default: the convention as practised, with `make migrate-roundtrip` proving the down-migration on a fresh database and the shared development database recreated by hand after each such edit. The exposure ends at `OPS-001`, which freezes migrations against a database nobody can recreate.

---
<a id="CMS-DEC-06"></a>
### `CMS-DEC-06` — Whether the library still accepts WebP, which its encoder cannot rewrite — OPEN

- **Decision:** `CMS-DEC-03` settled the raster re-encode on `jimp`, pure JavaScript and no native build. `jimp` decodes PNG, JPEG, BMP, GIF and TIFF and **no WebP**, while `CMS-003` §3 accepts `image/webp`. So the one accepted format the encoder cannot rewrite is the one whose metadata nothing strips: a WebP would keep its EXIF, and the GPS in it, all the way into storage (`DATA-R02`). Does the library keep WebP and gain a decoder for it, or stop accepting it?
- **Options:** **A** Refuse WebP, as SVG is refused — no dependency, and the cost is that a WebP is turned away and arrives as a PNG or a JPEG instead · **B** Keep WebP and add a decoder — `sharp` (native libvips, the build cost `CMS-DEC-03` declined) or a WebAssembly codec, which keeps the pure-JavaScript posture at the cost of a second image library · **C** Keep WebP and store it unre-encoded, which ships the leak knowingly.
- **Recommendation:** **A**. It is the move `CMS-DEC-03` already made for the format it could not handle safely, it adds nothing to the dependency tree, and the cost falls on an admin who can export a PNG. **B** is right only if WebP uploads turn out to be a real need — the room’s images come from screenshots and design tools, and both export PNG. **C** is refused for the reason `CMS-DEC-03` refused the same shape: it ships a `DATA-R02` leak in the one format nobody would think to check.
- **Decision owner:** user
- **Blocks:** — none —
- **Revises:** CMS-003/T1 — the sniff accepted a WebP when it shipped; the answer decides whether it does again
- **Status:** OPEN. Safe default: WebP is not an accepted type, so it sniffs to `null` and the upload turns it away like anything else — fail-closed, because the alternative is storing the one file whose metadata nothing here removes. Restoring it is one signature and one entry in the accepted set, once a decoder exists.

---
## Resolved decisions

<a id="INFRA-DEC-07"></a>
### `INFRA-DEC-07` — Whether the status enum carries a value for a build that is underway — RESOLVED 2026-09-13
- **Decision:** §3.4's enum runs `draft | under-review | design-ready | implemented | …` with nothing between the last two, so a feature with some task rows closed and others open can only read `design-ready`, which a reader takes as *nothing built*. Measured across the ecosystem on 2026-09-13: **302 designs in seven repositories were mid-build and read `design-ready`**, 19 of them here. Verdiq answered the same question for itself at `INFRA-DEC-06` (2026-08-12) by adding `in-progress`, and its own gate did not enforce it, which left 54 designs there in violation of doctrine that repository wrote. Should this repository carry the value, and enforce it?
- **Options:** **A** **Port `in-progress` and enforce it** — add the value to §3.4 and to the validator, move every mid-build design onto it by the mechanical rule (some rows closed, some open), and gate every direction. The token then tells the truth on its own, and an all-closed design that is built but inert declares `inert_until.{reason, unblocks_when}` so *built and waiting* is distinguishable from *forgotten*. · **B** **Add the value but sweep nothing** — lanes move a design when they next touch it. It is the smallest change to the tree, but Verdiq had been in exactly that state for a month with 54 designs still wrong, so it does not converge on its own. · **C** **Keep two values and redefine `design-ready`** to mean *not finished* rather than *nothing built*, dropping `in-progress` from Verdiq for symmetry. Cheapest of all and internally consistent, but it discards the distinction between nothing built and nearly everything built, which is the signal a lane picking its next feature actually reads.
- **Recommendation:** **A** — it is the shape already chosen for Verdiq at `INFRA-DEC-06`, the mid-build rule is mechanical rather than a judgement call, and the measurement taken the same day is that an ungated documentation rule drifts: the four repositories whose validator read the task ledger held within one design of agreement, while the four that did not held 234 between them. **C's strongest case, in its own terms:** a status is a coarse token and every extra value is one more thing eight repositories must keep straight, so the cheapest honest fix is to make the existing word mean what the tree already does — a real answer, which is why it was put rather than dismissed.
- **Decision owner:** user — §14 architecture: it changes design frontmatter, `.claude/CLAUDE.md` §3.4, and the validator every lane's commits pass through
- **Settled by:** user
- **Blocks:** — none —
- **Status:** RESOLVED 2026-09-13 — option A. `in-progress` joins the §3.4 enum, with `inert_until.{reason, unblocks_when}` required once every row has closed. `scripts/validate-designs.py` refuses `implemented` with an open row, `design-ready` with every row closed, `design-ready` with a build underway, and an all-closed `in-progress` that names no reason. 19 designs and their PRD catalogue rows move to `in-progress`, leaving 10 that read `design-ready` and mean it. The PRD catalogue gains `building` beside `live` / `design` / `planned` / `blocked`, because this catalogue's `design` is defined as *the design is written, no code* and a build underway is not that. Every enumeration of the status set moves with the enum — the cross-reference status table and the roadmap's status filter both spell the set out, and a list built from a word table goes blind rather than red when the set outgrows it.

<a id="ADMIN-DEC-04"></a>
### `ADMIN-DEC-04` — What standard the admin console’s front-end is held to — RESOLVED 2026-09-13

- **Decision:** `ADMIN-002` describes the console’s chrome and every admin surface describes what it must contain, and none of them says how good the front-end has to be. A staff tool is exactly where that silence gets read as permission: the surfaces are internal, the audience is two people, and each screen is easy to ship as a bare form that works. What standard do they hold?
- **Options:** **A** The quality bar is VALO Ads’ — its forms, buttons, motion and interaction patterns are the reference the console is built to, in VALO Tech’s own visual identity rather than its skin · **B** Functional-internal — correct, accessible, unstyled beyond the design tokens, on the grounds that two admins do not need polish.
- **Recommendation:** **A**, and this is the owner’s own instruction rather than a reading the loop derived.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-13 — **A**. The console is built to VALO Ads’ level of finish and learns its craft from that repository — how a form is composed and validated, how a button reads in each of its states, how motion is used and when it is not — which is readable in the VALO Ads checkout beside this one, under its web app's component tree and the animations stylesheet next to it. Those paths are that repository's and not this one's; nothing here is copied from them. What is borrowed is the method, never the identity: the console stays VALO Tech’s, on this repository’s own theme and tokens (`assets/site.css`, the brand kit the `check-brand` gate holds), so the two products do not become one another. Makeshift is the failure this names: a surface that works and looks unfinished does not meet the bar and is not done. `A11Y-R01` through `A11Y-R03` bind as they always did — finish is never bought with a control that cannot be reached by keyboard or a contrast that fails against the painted pixel — and `ADMIN-002/T5` keeps the console in English. The same bar governs the investor-facing surfaces from the other direction: `INV-DEC-01` says what those must show, this says how well the staff surfaces must be made.

---


<a id="INV-DEC-01"></a>
### `INV-DEC-01` — What standard the investor-facing surfaces hold their presentation to — RESOLVED 2026-09-13

- **Decision:** `INV-001`, `INV-003`, `RPT-003` and `DECK-003` are the surfaces an investor actually reads, and each design says what its surface must *contain* without saying what it must *be like to read*. Left there, the honest default is prose and a table — correct, and the thing an investor closes. What standard do these surfaces hold themselves to?
- **Options:** **A** Presentation-grade — a figure an investor is asked to judge is shown as well as stated, each surface is scannable before it is read, and no surface is an undifferentiated block of text · **B** Content-first — ship the facts in the plainest form and treat the visual work as a later polish pass.
- **Recommendation:** **A**, and this is the owner’s own instruction rather than a reading the loop derived.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-13 — **A**. Every investor-facing surface is presented visually rather than as text; its figures are clear and grounded, so a reader can see where a number comes from; and it is easy to read, easy to follow, and easy to trust. The crude, the monotone and the repetitive are defects on these surfaces, not matters of taste. A surface that states its facts correctly and still reads as a wall of text does not meet this and is not finished. It binds `INV-001` (the room’s landing), `INV-003` (portfolio progress), `RPT-003` (reading a report) and `DECK-003` (reading a deck), and the public gateway holds the same line. It is not a licence to decorate: a figure is shown because showing it answers the question faster than saying it, never because a page looked plain — and `A11Y-R01` through `A11Y-R03` still bind, so nothing may rest on colour alone, every control stays reachable by keyboard, and contrast is measured against the painted pixel.

---


<a id="AUTH-DEC-02"></a>
### `AUTH-DEC-02` — Is the session cookie signed with `SESSION_SECRET` — RESOLVED 2026-09-12

- **Decision:** The session cookie carries a random token whose hash the `sessions` row stores (`AUTH-002` §3). Is that token additionally signed with `SESSION_SECRET`, so a tampered cookie is rejected before the row lookup and rotating the secret signs every live session out — or is the cookie the bare token, with `SESSION_SECRET` used for nothing on this path?
- **Options:** **A** Sign it — the cookie is `<token>.<HMAC(SESSION_SECRET, token)>`; rotating `SESSION_SECRET` becomes a real emergency sign-out lever and a tampered cookie fails before it reaches the database · **B** Leave it bare — validity is the `token_hash` lookup alone, `SESSION_SECRET` has no consumer on the session path, and the emergency lever is deleting the session rows (`AUTH-004`'s `session.invalidate_all`).
- **Recommendation:** **A**. It makes the emergency lever `env.example` and `CRED-001` document real, adds tamper rejection before a database round-trip, and gives `SESSION_SECRET` — a required credential — an actual consumer rather than leaving it orphaned. **B** is simpler but orphans a required credential and turns a documented security lever into a false statement, which is the defect this entry was opened on.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-12 — **A**, the cookie is signed. `AUTH-002/T1` and `AUTH-002/T3` shipped the bare-token safe default (the store validates by `token_hash` lookup, `SESSION_SECRET` unused on the session path); the owner's choice revises them, so a future dev1 iteration signs the token with `SESSION_SECRET` on issue and verifies the HMAC in the gate before the row lookup — giving `SESSION_SECRET` a real consumer and making rotating it an emergency sign-out lever. That build is filed as `AUTH-002/T5`; the shipped tasks stay closed and no code lands in this documentation pass.

<a id="ADMIN-DEC-02"></a>
### `ADMIN-DEC-02` — Is the account list sortable by a control, or served already sorted by last sign-in — RATIFIED 2026-09-12

- **Decision:** `ADMIN-001` §3 says the list is "sortable by last sign-in, because that column is what makes a stale account visible." The list ships served in that order — stalest first, the never-signed-in above them (`ADMIN-001/T1`). Does "sortable" ask for a control the admin re-sorts with, or is a fixed order by last sign-in — which puts exactly what the column is for at the top — what the word asks for here?
- **Options:** **A** The served order, as shipped — the design names one sort key and one reason, the fixed order serves that reason directly, and with six to fifty accounts (§6) the whole list is one screen; a control would re-sort a list that already answers its one question · **B** A column-header control that re-sorts — the plain reading of "sortable," and once there is one it plausibly sorts the other columns too, at the cost of client interactivity on a server-rendered page and sort keys the design names no reason for.
- **Recommendation:** **A**. The design gives the column one purpose — making a stale account visible — and the served order delivers it with the stalest account above the fold; a re-sort control over a list already ordered by its one stated key adds a mechanism without adding an answer, and §1.10 cautions against building it with no second sort reason named. **B** is the literal reading of the word, which is why this is filed rather than decided silently: a re-sort would be a `searchParams` sort the existing `/admin` pages already shape, with no schema or API change.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RATIFIED 2026-09-12 — **A**, the fixed served order stands. `ADMIN-001/T1` serves the list `last_sign_in asc nulls first`, tie-broken by address, so the stalest and never-signed-in accounts are at the top — the design's one stated purpose for the column, met without a re-sort control (`§1.10`). Nothing changes and no task is filed.

<a id="ADMIN-DEC-03"></a>
### `ADMIN-DEC-03` — Is an admin's resend or reset an audited act, and is the reset control offered before its mail exists — RESOLVED 2026-09-12

- **Decision:** The person page (`ADMIN-001/T2`) lets an admin resend an invitation and start a password reset, and neither writes an audit row — the `audit.action` CHECK names no value for them, and `SEC-R04`'s enumerated set is create, suspend, role-change, delete and grant. Resend is narrowed to an `invited` account and hands back a single-use link; once `AUTH-003/T4` builds the page that accepts it, an admin could open that link and set the account's password — the takeover `ADMIN-001` §3 names — while the trail shows only the original `account.create`. Two questions on one surface: should resend (and reset) be audited; and should the reset control be offered before `AUTH-003/T3` mails the link, when the press reaches nobody yet?
- **Options:** **A** Audit the resend as a new `audit.action` value folded into the CHECK (the `ADMIN-001/T8` precedent folded `account.reinstate` in), with a `recordAudit` call inside `resendInvitation`'s transaction, and keep the reset control with the sentence it already carries. **B** Leave both unaudited, consistent with the letter of `SEC-R04`, and either keep or withhold the reset control until its mail exists.
- **Recommendation:** **A**. A link that can set a password is a privileged write the trail should hold; the narrowing to `invited` bounds the takeover but does not record it, and the fold is a known move. Reset is lower weight — it hands back nothing, so no capability is misattributed — but auditing it alongside costs one more CHECK value. Keep the reset control offered: the sentence it carries names exactly what did and did not happen, which is more honest than an absent control that leaves the admin guessing whether the console can reset at all.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-12 — **A**, resend and reset are audited. `ADMIN-001/T2` shipped them unaudited (a link that can set a password left only the original `account.create` in the trail); the owner's choice revises it, so a future dev1 iteration folds a new `audit.action` value (a migration — Critical tier) and adds the `recordAudit` call inside `resendInvitation`'s transaction, keeping the reset control offered with its sentence. That build is filed as `ADMIN-001/T9`; the shipped person page (`ADMIN-001/T2`) stays closed and no code lands in this documentation pass.

<a id="CMS-DEC-05"></a>
### `CMS-DEC-05` — Whether an uploaded PDF's metadata is stripped, and how — RESOLVED 2026-09-12

- **Decision:** The media library accepts `application/pdf` (`CMS-003` §3, `ACCEPTED_MIME`), but the EXIF-stripping re-encode (`CMS-DEC-03`, `CMS-003/T2`) runs over raster images only, so a PDF's metadata — the Info dictionary's author and producer, local file paths, the XMP packet, and the EXIF of images embedded in it — reaches storage untouched. That is the leak `CMS-DEC-03` was opened to close, surviving in the one accepted type it does not cover (`DATA-R02`). Is a PDF refused, or kept and stripped?
- **Options:** **A** Keep PDF and strip its metadata through a library — a new dependency (`§14`), the depth (the Info dictionary and XMP at least, embedded-image metadata where the library reaches it) and the specific library chosen at build · **B** Refuse PDF outright, as SVG is refused (`CMS-DEC-03`), adding no dependency at the cost of a report or deck arriving only as an image or as authored blocks · **C** Accept PDF with its metadata intact.
- **Recommendation:** **A** when a PDF upload is a real need, **B** when it is not; **C** is refused because it ships the `DATA-R02` leak knowingly. The room genuinely wants to carry investor-facing PDFs, so keeping and scrubbing them beats turning them away.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-12 — **A**, PDF is kept and its metadata stripped before storage through a library (a new dependency the owner approves, `§14`), so no stored PDF carries an author name, a local path or an embedded image's GPS (`DATA-R02`) — the guarantee `CMS-DEC-03` gives a raster, extended to the format it did not cover. `CMS-003/T8` builds the scrub, runs it before `storeMedia` on the same upload path as the raster re-encode, and chooses the library and the depth there by measurement, proven against a PDF seeded with metadata. The scrub lands with that task rather than after it, so an unscrubbed PDF never reaches storage.

<a id="CFG-DEC-01"></a>
### `CFG-DEC-01` — Whether the session lifetime and sign-in rate are runtime settings or environment-owned — RESOLVED 2026-09-12

- **Decision:** The runtime-settings registry (`CFG-001`, `apps/web/src/config/settings.ts`) declares `session.max_age_days` and `signin.rate_per_hour`, but no code reads either — the live session lifetime is `SESSION_TTL_SECONDS` (twelve hours) and the live sign-in limit is `AUTH_MAX_ATTEMPTS`/`AUTH_WINDOW_SECONDS` (five attempts in fifteen minutes), both environment-owned. The two registry keys are dead and disagree with what is in force, so an admin who edits them gets an audited change and a working undo that alter nothing — the opposite of what `CFG-001` promises, a value changed without a deploy. Do these two belong in the runtime registry, or to the environment?
- **Options:** **A** Remove both keys — the environment owns the session lifetime and the sign-in limit, which are security parameters that belong in a deploy review rather than a runtime toggle, and `CFG-001` keeps the three genuinely runtime keys (`room.banner`, `room.signin_message`, `mail.enabled`) · **B** Wire them — the limiter and the cookie's `Max-Age` read the setting, so an admin tightens the rate during a stuffing attempt with no deploy, at the cost of a cached database read on the sign-in path and a reconciliation of which value wins, since the registry defaults (thirty days, ten per hour) are looser than the environment's.
- **Recommendation:** **A**. The disagreement is the defect, and **A** removes it with the smallest change while keeping the two security parameters where a change is reviewed; **B** makes the control real but loosens two security values to do it and adds a read to the hottest path for a control a dozen-reader room rarely needs. Reopen for **B** if runtime-tightening the sign-in rate under attack becomes a real need.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-12 — **A**, the environment owns the session lifetime and the sign-in rate; the two dead keys leave the registry so it holds only what an admin truly changes at runtime (`room.banner`, `room.signin_message`, `mail.enabled`), and the "same value everywhere" disagreement (`§2`) is gone. The removal — the two keys, their bounds and their tests — takes the two security parameters off the runtime path, and `CFG-001`'s design is reconciled to the three-key registry. No runtime behaviour changes, because nothing read these keys. The removal is `CFG-001/T7`.

<a id="AUTH-DEC-05"></a>
### `AUTH-DEC-05` — Self-service password reset, or admin-initiated only — RESOLVED 2026-09-12

- **Decision:** `AUTH-003` §3 lists a public `/forgot` where anyone requests a reset, but it was never built — it cannot deliver a reset link without mail (SMTP, unbuilt), and for an invite-only room of named investors a public reset-request page is an enumeration surface the room may not need. Does the room keep self-service reset (a public `/forgot`), or is reset admin-initiated only?
- **Options:** **A** Admin-initiated only — no public `/forgot`; an investor asks an admin, who resets from the person page, and the link reaches them as an invitation's does. Removes a public surface and a mail dependency for reset, and `SEC-001/T4`'s reset-request clause is moot, so it completes at sign-in and acceptance. · **B** Self-service `/forgot` (the design's choice) — a public reset-request page, rate-limited and anti-enumeration, which needs mail delivery to send the link.
- **Recommendation:** **A**, for an invite-only room whose investors an admin already knows — the manual reset step is trivial at this scale and it drops a public surface. The owner chose **B**.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-12 — **B**, self-service `/forgot` is kept, as `AUTH-003` §3 specifies. It waits on mail delivery — `AUTH-003/T3` mails the link over the `MAIL-001/T8` adapter — so `SEC-001/T4`'s reset-request rate limit stays `[~]` until the page lands, and a future dev1 iteration builds the `/forgot` page, its rate limit and the mail together. The carrier is SMTP (`MAIL-DEC-01`), which reports no bounce, so a reset mail that never arrives signals nobody; the fallback is the admin resetting from the person page (`ADMIN-001/T2`), which stays reachable for exactly this. Reopen for admin-only if the investor base outgrows self-service's worth.

<a id="MAIL-DEC-03"></a>
### `MAIL-DEC-03` — The Node SMTP client library for the mail adapter — RESOLVED 2026-09-12

- **Decision:** `MAIL-DEC-01` settled the carrier as SMTP against the company's mailbox, and `MAIL-001` §3 puts one SMTP adapter behind the `Mailer` port. Node ships no SMTP client, so the adapter needs a library, and a new dependency is the owner's (`§14`). Which library opens the TLS-secured SMTP connection `MAIL-001/T8` describes?
- **Options:** **A** `nodemailer` — the standard Node SMTP client: TLS, authentication, one connection per send and error handling built in. · **B** A raw SMTP client over a TLS socket — no dependency, but the handshake, authentication and error handling are hand-written. · **C** A lighter third-party SMTP client — fewer features, its TLS and errors to check.
- **Recommendation:** **A**. `nodemailer` is the ubiquitous, stable choice and matches `MAIL-001/T8`'s shape exactly — one connection, TLS required, failing rather than falling back to plaintext — while the credential `SMTP_URL` stays the owner's to supply (`CRED-001`, PENDING).
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-12 — **A**, `nodemailer`. `MAIL-001/T8`'s SMTP adapter is to be built on `nodemailer` — one TLS-secured connection per send, failing rather than falling back to plaintext — with `SMTP_URL` supplied by the owner at deploy (PENDING). This unblocks a future dev1 iteration to build the adapter and, with it, the invitation mail (`AUTH-003/T3`), the reset link the self-service `/forgot` sends (`AUTH-DEC-05`), and the failed-recipient retry (`MAIL-001/T6`).

<a id="SEC-DEC-01"></a>
### `SEC-DEC-01` — What a changed field records in the audit: its name, or its value — RESOLVED 2026-09-12

- **Decision:** The audit's `before`/`after` hold the fields a privileged write changed. Do they record the field **names** only, or the field **values** — and if values, how is a name or an e-mail kept out of a trail retained for seven years past an erasure?
- **Options:** **A** Names only — universally safe, but `INV-003` reads the audit as the portfolio's own history, and a field name tells a reader that a headline changed, not what it changed to · **B** Values, under a per-action allow-list of recordable fields — `portfolio.change` records the previous stage and headline, `config.change` the previous value, `account.role_change` the role and state, and no action may record `name` or `email`, so `DATA-R02`'s "no personal data" holds by construction rather than by the care of whoever writes the next call.
- **Recommendation:** **B**. Only **B** can express the portfolio history `INV-003` rests on and the undo context `CFG-001` reads, and it keeps `DATA-R02` mechanical: the allow-list is a fixed table checked at the one insert site (`SEC-002/T3`), so a field the list does not name cannot reach the trail. **A** is simpler but would force `INV-003` to grow the portfolio-history table the schema was deliberately built without. The cost of **B** is that the allow-list must be complete before the first audited write — which is why it is settled now, not discovered when `account.create` first records a row into a seven-year table.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-12 — **B**, values under a per-action allow-list. The audit records the changed values a fixed table names for each action — `config.change` its previous and new value, `account.role_change` the role and state, `portfolio.change` the previous stage and headline — and no action's list may name `name` or `email`, so `DATA-R02` holds by construction at the one insert site rather than by the care of the next caller. `SEC-002/T4` builds the allow-list and records the values through it; `MAIL-001/T5`'s `mail.send` records the subject and recipient count under it, and `INV-003`'s portfolio history reads the trail rather than the separate table the schema was built without.

<a id="CMS-DEC-03"></a>
### `CMS-DEC-03` — Which library re-encodes an uploaded image, and whether SVG is sanitised or refused — RESOLVED 2026-09-12

- **Decision:** `CMS-003` accepts raster images and must re-encode them so EXIF — including the GPS of where a screenshot was taken — does not survive (`CMS-003/T2`, `DATA-R02`), and accepts SVG, which it must sanitise to shape and text or refuse (`CMS-003/T3`). Node has no image re-encoder and no SVG sanitiser built in, so each needs a dependency, and a new dependency is the owner's (`§14`). Which raster re-encoder, and is SVG sanitised with a library or refused outright?
- **Options:** **A** Raster through `jimp` (pure JavaScript — no native build, so the Docker and serverless targets stay simple; slower, which a few dozen admin uploads never feel) and **refuse SVG** (no sanitiser to trust, the design's own stated fallback, `CMS-003` §6) · **B** Raster through `sharp` (native libvips — fast and ubiquitous, at the cost of a platform-specific build on every deploy target and a larger attack surface) and SVG sanitised through a library (`DOMPurify` over `jsdom`, or an SVG-specific sanitiser) · **C** some other split of the two.
- **Recommendation:** **A**. The volume is a few dozen images (`CMS-003` §6), so `sharp`'s native throughput buys nothing the room needs while adding a libvips build to every target; `jimp` re-encodes and drops EXIF in pure JavaScript with no native step. And the design already states that the honest move on SVG is to drop it rather than keep patching a sanitiser (`CMS-003` §6) — refusing it adds no dependency and removes the format most likely to carry script, at the cost of a logo arriving as PNG. This holds `CMS-003` to one pure-JavaScript dependency and no sanitiser. Reopen for **B** if a real SVG need arrives or the image volume outgrows what `jimp` serves.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-12 — **A**, `jimp` and refuse SVG. A raster upload is re-encoded through `jimp` (pure JavaScript, no native build, so the Docker and deploy targets stay simple), dropping EXIF and its GPS by re-writing the pixels; SVG is refused, the design's own stated fallback (`CMS-003` §6), which adds no sanitiser and removes the format most likely to carry script, at the cost of a logo arriving as a raster. `CMS-003/T3` refuses SVG on this basis; `CMS-003/T2` builds the raster re-encode on this one pure-JavaScript dependency. A PDF carries metadata the raster path does not reach, and scrubbing it is a separate choice — `CMS-DEC-05`. Reopen for `sharp` and an SVG sanitiser if a real SVG need arrives or the image volume outgrows what `jimp` serves.

<a id="CMS-DEC-04"></a>
### `CMS-DEC-04` — What carries a locale draft's translation: a self-hosted service, or an admin translating it in review — RESOLVED 2026-09-12

- **Decision:** `CMS-005/T3` drafts a locale by translating each block's text and reassembling its marks span by span (`CMS-005` §3), which requires translating a marked span as a unit — a programmatic, per-span translator, not a whole-paragraph paste. The design leaves the carrier open and the product forbids an external general-purpose model (`.claude/CLAUDE.md` §1.5). Is the carrier a self-hosted translation service, or does drafting seed the target locale from the source for an admin to translate in the review screen, with no service? The two answers build different mechanisms, which is why `T3` cannot proceed until this settles.
- **Options:** **A** A self-hosted translation service (e.g. LibreTranslate) behind a `Translator` port — an automatic machine draft across twenty locales, at the cost of a service to deploy, secure and keep running and a per-span call path; this is what `T3`'s span-by-span reassembly is for · **B** No service: drafting seeds each target locale with the source blocks, their marks intact, and the admin writes the translation in the review screen (`CMS-005/T4`) before marking it reviewed — no new dependency, the human does the translation the state machine already routes through review, at the cost of no automatic first draft and a `T3` that seeds rather than translates.
- **Recommendation:** **B**. The room's investors are named people who mostly read English or Vietnamese (`CMS-005` §6), so the volume that would justify a translation service is not there; **B** ships the whole state machine (a `machine` row served to nobody, a `reviewed` row served — `CMS-R05`) with no new infrastructure, and `CMS-005/T4`'s review screen already exists to be where a human translates. The span-by-span reassembly `T3` specifies is only needed by **A**'s programmatic path; under **B** the seed carries the source marks unchanged and the reviewer edits text within them. The cost is honest — **B** has no automatic first draft, so twenty locales are twenty human translations — which is why the recommendation is not certain: if the room's content genuinely goes multilingual beyond English and Vietnamese, **A** pre-fills what the reviewer would otherwise type, and the reassembly becomes worth building. Reopen on that signal.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-12 — **B**, no service: drafting seeds the target locale from the source, marks intact, and the admin writes the translation in the review screen before marking it reviewed. No new infrastructure, which fits a room whose investors mostly read English or Vietnamese (`CMS-005` §6); the span-by-span reassembly `T3` specified is only `A`'s programmatic path, so under `B` the seed carries the source marks unchanged and the reviewer edits text within them. `CMS-005/T3` becomes the seed and `CMS-005/T4` the review screen where the human translates. The cost is honest — twenty locales are twenty human translations, no automatic first draft — so reopen for a self-hosted service if the room's content goes multilingual beyond English and Vietnamese.

<a id="MAIL-DEC-02"></a>
### `MAIL-DEC-02` — How a retry of the failed recipients stays idempotent — RESOLVED 2026-09-12

- **Decision:** `MAIL-001/T6` re-sends to the recipients whose last attempt failed, and must never reach one who already received the message — a re-send that does is how a person receives investor mail twice, the one act this product cannot withdraw. `mail_log` records each attempt as its own row and never supersedes an earlier one, so a failed row stays `failed` after a later attempt succeeds and a second retry keyed on the same rows sends again. What mechanism makes the retry idempotent?
- **Options:** **A** A `retry_of` column on `mail_log` — a re-send row names the failed row it supersedes, and a failed row that has a successor is never eligible again, whatever the caller passes; the idempotency lives in the data, and the migration is additive · **B** An idempotency key per `(send, recipient)` that a re-send reuses, so a second attempt with the same key is refused at the log — more general, a larger build, and it must define what "the same send" is across a retry · **C** No column — the retry excludes a failed row when a later `accepted` row exists for the same account and subject; no migration, but two genuine sends with the same subject to one account collide, and the guarantee rests on subjects being unique · **D** No stored guarantee — the caller threads the new row ids forward each time, so an accepted row is never in the next retry set; correct only while every caller does so, which is the fragility the other three remove.
- **Recommendation:** **A**. It is the smallest change that puts the guarantee in the data rather than in a caller or a subject heuristic: `retry_of uuid REFERENCES mail_log(id)` is additive, and "a failed row with a successor is spent" is one predicate the retry reads. **C** is cheapest but wrong for two same-subject campaigns to one investor, which a fundraise produces; **D** rests the guarantee on the caller threading ids forward, the fragility the other three remove; **B** is the most general and the most to build for a send list of a few dozen. Filed rather than loop-settled because it is the first idempotency mechanism of its kind in this repository and it shapes `MAIL-002`'s table (`.claude/CLAUDE.md` §1.11).
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-12 — **A**, a `retry_of uuid REFERENCES mail_log(id)` column: a re-send row names the failed row it supersedes, and a failed row that has a successor is never eligible again, whatever the caller passes, so the idempotency lives in the data and the migration is additive. `MAIL-001/T6` builds the retry on this and shapes `MAIL-002`'s table around it. The retry itself still waits on the SMTP send path — the adapter `MAIL-001/T8` and its credential (`MAIL-DEC-01` SMTP) — so `T6` stays blocked on that, not on this decision: it is a `Blocked by:` on the transport now rather than on an unmade choice.

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
- **Forcing source:** MEASUREMENT — each option tested against what it would actually require reduces the set to one. **B** (join the ecosystem's EKS cluster): `VALOAds/docs/decisions-log.md` records that no EKS cluster is provisioned, so **B** means standing up the ecosystem's first cluster to serve a corporate homepage, its shape decided by the smallest workload that will ever run on it. **D** (App Runner): AWS closed App Runner to new customers on 2026-04-30 and moved it to maintenance, and this is a new account, so **D** is unavailable — AWS's named successor is Amazon ECS Express Mode (launched 2025-11), which is ECS-on-Fargate with the ALB, TLS and autoscaling provisioned for you. (The earlier rejection of **D** for "no VPC-attached database path" was itself wrong — App Runner VPC connectors to a private RDS have been GA since 2022 — but the closure settles it regardless.) **C** (EC2 + Docker) puts host patching back on the owner, the one thing AWS was chosen to remove. DOCTRINE §1.10 then settles it: **A** — ECS on Fargate with a managed database — is the smallest shape that is genuinely AWS, genuinely managed, and operable by one person. **B**'s strongest case survives as the long-term trajectory (one operational surface for the whole family), which is why the EKS path is named as a move, not a rewrite.
- **Overturned by:** the ecosystem provisioning an EKS cluster for another product. When that lands, this repository's deployment moves onto it and this entry is superseded rather than argued with.
- **Status:** RESOLVED 2026-09-07, reviewed 2026-09-12 — **A**, ECS on Fargate with RDS PostgreSQL in Terraform under `deploy/`, the EKS path named so a later move is a deployment change not a rewrite. Whether the Fargate service is hand-rolled (ALB, target groups, security groups in Terraform) or uses Amazon ECS Express Mode — which provisions those for you and stays ECS, so the EKS bridge holds — is left to the `OPS-001` build, Express Mode the front-runner. `OPS-001` also owes the VPC egress a private-subnet task needs — a NAT gateway or VPC interface endpoints for ECR, Secrets Manager, CloudWatch and SMTP — which is the largest standing cost in this shape and which the design does not yet name.

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
- **Status:** RESOLVED 2026-09-07 — **A**, the two principles reconciled rather than ranked: `P-05` governs what may be *published as a translation*, and `I18N-R04` governs what a reader sees while none exists. A locale no human has reviewed is never served as its own language — the reader sees the authored language, the fallback `I18N-R04` describes — so `P-05` is not breached. **B** was rejected because an urgent correction waiting on twenty reviews is one people route around through code, worse than the gap it prevents. **C** — serving an unreviewed draft — was rejected because no mechanical check here tells a lifeless draft from a real translation. `CMS-005` carries the per-locale state, and `CMS-DEC-04` settles what a draft is: a source-language seed a human translates in review, not a machine's output, because the room runs no translation service. So nothing machine-made is ever served, and a locale is shown as its own language only once a person has reviewed it.

<a id="INFRA-DEC-04"></a>
### `INFRA-DEC-04` — Whether this repository is public while the app is built — RESOLVED 2026-09-06

- **Decision:** The GitHub repository is public, so every branch is readable by anyone without authentication — `raw.githubusercontent.com/VALOTech/VALOTech/development/docs/PRD.md` returns 200 and its content. The planning documents are therefore not hidden by living on `development`, whatever `main` carries.
- **Options:** **A** Accept it for now and make the repository private when the application replaces the static site · **B** Make it private immediately, which requires a paid plan for GitHub Pages to keep serving valotech.org · **C** Move the planning documents to a separate private repository.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-06, sharpened 2026-09-12 — **A**, with the trigger now concrete. The repository goes private when the application is served from the owner's AWS server rather than GitHub Pages (`INFRA-DEC-03`, `INFRA-DEC-05`, `OPS-001`), at which point Pages no longer needs a public repository; the owner has that server, so the cutover is the near-term path and not a hypothetical. What is readable until then is the whole planning corpus, and on four published branches, not two: `main` carries only the site, but `development`, `staging` and `production` publish `docs/`, `.claude/` and `scripts/` — including `docs/operator-checklist.md`'s inventory of controls designed and not yet applied. That is low-risk today because nothing is deployed, no investor data exists, and `env.example` holds no real value; it is nonetheless the reason the private switch is made at the AWS cutover and not left after it.

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

<a id="SCENE-DEC-02"></a>
### `SCENE-DEC-02` — What the world does on a phone — RESOLVED 2026-09-13

- **Decision:** `SCENE-001`'s journey moves the world between the side each chapter leaves open. A phone leaves no side — the reading column spans the frame — so the phone table gave it six stations of its own and dragged the disc 47%→63% across the frame, 52%→65% down it, and 99px→133px in drawn radius, across the words it was standing behind. A separate drift moved it 4.8px across and 4.0px down with nothing being scrolled at all. Does the world travel on a phone, and if it stops, does it stop turning as well?
- **Options:** **A** Hold one station at the centre of the visible frame and hold the scale, keep the self-rotation and keep the lunar-to-Earth scrub on scroll · **B** Hold the station and the rotation but drop the scrub, so the phone shows a living world from the first screen · **C** Freeze it entirely — a still image, no rotation and no scrub.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-13 — **A**, with the world drawn at 0.7 of full strength so the copy standing on it reads first. The disc holds **50% across and 50% down**, at a drawn radius of 122px on a 390px frame, measured identical at every point of the page and at 360 x 800 as well. A wide frame keeps its origin half a header below the window's centre, because the header covers the top of a composition the world stands beside; a phone takes the frame's own centre, because there the world is the subject and the header is a bar over it. The two are now one value in the scene rather than two — the world's transform and the star's placement each carried their own copy, and a vertical origin kept twice puts the star and the rings half a header off the disc the moment one is tuned (`SCENE-R02`). The idle drift is a wide-frame gesture and is off below 900px: measured at 0.00px over twelve samples with no scrolling, which is what `SCENE-R03` asks of a held station. **C** was refused because it contradicts `SCENE-R04`, and **B** because the scrub is the argument the page is built to make.

<a id="SITE-DEC-04"></a>
### `SITE-DEC-04` — How much of the world shows through the phone's grounds — RESOLVED 2026-09-13

- **Decision:** With the world held behind the copy (`#SCENE-DEC-02`) the grounds over it decide whether it can be seen at all. Three of them stack: the chapter scrim, the panels, and how brightly the world itself is drawn. The panels were at 0.93 and the phone scrim at 0.94, so the world was effectively invisible through them — and where a ground did not reach, running copy sat on the bare world at a measured 1.6:1. How transparent may they be?
- **Options:** **A** As transparent as WCAG AA allows, measured on the pixel painted behind the letterforms · **B** Further, with a blur and a narrow plate behind each line of text to hold AA · **C** Further still, accepting runs of copy below AA.
- **Decision owner:** user
- **Settled by:** user
- **Status:** RESOLVED 2026-09-13 — **A**, and the answer turned out to be **B**'s shape rather than a number. The grounds between the reader and the world *multiply*: a scrim dark enough to protect every word, with a panel over it, leaves `(1 − panel) × (1 − scrim)` of the world on the screen, and a first pass at 0.74 over 0.72 left **5%** — every run of copy at AA, and a world the owner could not see at all, which is the goal missed while the constraint was met. So the scrim became a wash (0.28) and the blocks standing on it carry their own plate, which means only two layers ever stack. The plate is glass rather than paint: what fights a letterform is the world's *detail*, not its brightness, so a blurred backdrop buys the same legibility at far less opacity. The small mono labels then bound the rest through their colour — the accent needs a card at 0.72 where the body text needs 0.55 — so they carry the bright accent and the cards stay open at 0.62. Measured: **27% of the world behind a card, 42% under a plate, 72% on the bare wash**, against 0.4% before this session, with **0 of 909 runs below AA** at 390, 360 and 320. **C** would have narrowed `A11Y-R03`, which §1.11 reserves.
