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
- **Status:** OPEN. Safe default: no audit writer exists yet — `SEC-002/T3` is unbuilt and `grep -rn audit apps/web/src` finds only the types and the drift guard — so nothing is written into `before`/`after` until this settles; the trail cannot hold a personal value it has no code to write.

<a id="AUTH-DEC-02"></a>
### `AUTH-DEC-02` — Is the session cookie signed with `SESSION_SECRET` — OPEN

- **Decision:** The session cookie carries a random token whose hash the `sessions` row stores (`AUTH-002` §3). Is that token additionally signed with `SESSION_SECRET`, so a tampered cookie is rejected before the row lookup and rotating the secret signs every live session out — or is the cookie the bare token, with `SESSION_SECRET` used for nothing on this path?
- **Options:** **A** Sign it — the cookie is `<token>.<HMAC(SESSION_SECRET, token)>`; rotating `SESSION_SECRET` becomes a real emergency sign-out lever and a tampered cookie fails before it reaches the database · **B** Leave it bare — validity is the `token_hash` lookup alone, `SESSION_SECRET` has no consumer on the session path, and the emergency lever is deleting the session rows (`AUTH-004`'s `session.invalidate_all`).
- **Recommendation:** **A**. It makes the emergency lever `env.example` and `CRED-001` document real, adds tamper rejection before a database round-trip, and gives `SESSION_SECRET` — a required credential — an actual consumer rather than leaving it orphaned. **B** is simpler but orphans a required credential and turns a documented security lever into a false statement, which is the defect this entry was opened on.
- **Decision owner:** user
- **Blocks:** — none — (`AUTH-002/T1` builds the safe default and a resolution to **A** revises it; the tables are unaffected either way)
- **Status:** OPEN. Safe default: the store validates by `token_hash` lookup and `SESSION_SECRET` is unused on the session path; `env.example` and `config` name the lever that works today — deleting the session rows — rather than claiming rotation signs sessions out, so no fail-open lever is documented while this waits.

---

## Resolved decisions

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
