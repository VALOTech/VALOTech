# VALO Tech — Product Requirements Document

> **Not for `main`.** This document lives on `development` only. `main` is served at valotech.org and everything on it is public (`.claude/CLAUDE.md` §1.1).

---

## 1. How to read this document

§5 is the **Feature Catalogue**: every feature the product has or will have, each with a stable code. §6 is the **Rule Catalogue**: the invariants that hold across features. Everything else is context for those two.

A feature code never changes and never moves to another subject. A design under `docs/designs/<domain>/` expands one code; a task in `docs/tasks.md` implements one design; a test pins one task. That chain is what §5 of `.claude/CLAUDE.md` calls coherence, and a break anywhere in it is a defect whether or not anything is visibly wrong.

**Status** in the catalogue means: `live` — shipped and serving visitors today · `design` — the design is written, no code · `planned` — named, not yet designed · `blocked` — waiting on a decision or an external actor, with the blocker named.

---

## 2. Product overview

### 2.1 What this is

VALO Tech Pte. Ltd. is a Singapore company that builds an AI-native product family: VALO Ads, VALO Pocket, Shimmra, Amavo, Farola, and the GRC backbone Verdiq. It sells a governed AI workforce to regulated industries.

This product is **the company's own two rooms**:

- **The gateway** — the public page at valotech.org. It makes one argument to a corporate buyer: that an AI workforce is worth having, that it needs a clean data foundation underneath it, and that VALO Tech builds both in the buyer's own environment. It is the company's face and, for most people who ever encounter VALO Tech, the whole of it.
- **The investor room** — everything behind the sign-in, and its main job is **keeping an investor current**. What they come back for is progress: where each product stands, what the team announced this month, what it actually shipped. The deeper case — how delivery works, what the portfolio is, and the presentation an investor is asked to read — is there too, but it is read once; the updates are read repeatedly, and the room is designed around the thing that is read repeatedly rather than around the thing that is read once.

Behind the room is the thing that fills it: a **content system** (`CMS`) an admin uses to write, translate, preview, publish and withdraw everything an investor reads — periodic reports, announcements, achievements, progress notes and decks. The room is the reading surface; the content system is the writing one, and the product is not finished when the room renders, it is finished when somebody who is not a developer can put this month's update into it.

The gateway's own words are **not** in that system. They are in the page and its dictionary, changed by a commit, and the reason is in §7.6.

### 2.2 What it is not

It is not a product the company sells, it carries no payment, and it holds no customer data. Its only stored personal data is the identity of the investors who have been given access.

### 2.3 Where it is today

The gateway is **live and complete**: one static page, no build step, served by GitHub Pages from `main`, fronted by Cloudflare, translated into twenty languages, carrying a WebGL scene designed under `docs/designs/scene/`. Its investor split is real — two chapters and the detail under each of seven claims are hidden from a visitor — but the gate that hides them is CSS, and the material is in the page source. It is a demonstration of the design, not a control.

The investor room does not exist. Building it is what turns this repository from a page into a product, and it is the whole of the work ahead.

### 2.4 The transition

The gateway stays live on `main`, unchanged, until the app can serve it at least as well. The app is built on `development` and reaches visitors only when the owner promotes it. Nothing about the transition may leave valotech.org degraded for an hour, let alone a week.

---

## 3. Global principles

- **P-01 The public argument is complete on its own.** A visitor who never signs in must get a coherent case, not a teaser. The investor room adds depth; it does not withhold the point.
- **P-02 The gate is real or it is not claimed.** Until the server enforces access, nothing is described as protected.
- **P-03 Investor identity is personal data.** Every feature that touches it is designed as if a regulator will read it, because one may.
- **P-04 The scene serves the argument.** It is never decoration competing with the words, and it never costs a reader the ability to read them.
- **P-05 Twenty languages, or none.** A string that exists in English and nowhere else is an unfinished string.
- **P-06 The company's face is not a place to experiment.** Anything reaching the gateway is verified in a browser at the sizes real readers use.
- **P-07 Nothing internal is published.** The repository's own planning is not part of the product (`.claude/CLAUDE.md` §1.1).

---

## 4. Roles

There are exactly **two** authenticated roles, and one unauthenticated audience.

| Actor | Authenticated | What they can do |
|---|---|---|
| **visitor** | no | Read the gateway in any of twenty languages; start a conversation by e-mail |
| **investor** | yes | Everything a visitor can, plus the gated chapters, the deck they have been granted, and the posts marked for investors |
| **admin** | yes | Everything an investor can, plus manage accounts, posts, decks, mail and configuration |

An admin is staff. An investor is a named outside person whose access was granted deliberately. There is no self-registration: an account exists because an admin created it.

A third role — an editor who may draft but not publish, an analyst who may read but not manage, an observer with time-limited access — is not in scope and is not to be invented in code. The editor case was raised by the content system and settled against: see [`CMS-DEC-02`](decisions-log.md#CMS-DEC-02). A role exists here when a named person needs it, never in anticipation, because a role that nobody holds still has to be honoured by every query, every screen and every access test.

---

## 5. Feature Catalogue

### 5.1 The gateway — `SITE`, `SCENE`, `I18N`, `A11Y`

| Code | Feature | Status | What it is |
|---|---|---|---|
| `SITE-001` | The gateway page | live | One page, nine chapters, a fixed scene behind them, a sign-in entry, and a contact close |
| `SITE-002` | Public and investor chapter split | live | Two chapters and the mechanism detail under seven claims are hidden from a visitor; the nav names the hidden pair only to a signed-in reader |
| `SITE-003` | Chapter sequence | live | Problem, Answer, Your people, Why, Workforce, ValoStack, Yours-not-ours, Contact — the designer's order |
| `SITE-004` | Contact close | live | A short call, an e-mail CTA, and the reason pricing is not published |
| `SCENE-001` | The world and its journey | live | A lunar sphere that becomes Earth across the page; stations per chapter |
| `SCENE-002` | Satellites and their rings | live | Three bodies on three drawn paths; one moon carrying the people, two craft carrying the work |
| `SCENE-003` | The sky | live | A parallaxed star field with colour temperature, two kinds of twinkle, meteors with two endings, and a rare supernova |
| `SCENE-004` | Annotation chips | live | Fifteen labels across five chapters, each pinned to one body |
| `SCENE-005` | Orbit stages | live | Two chapters whose cards ride an ellipse about the world |
| `SCENE-006` | Mapping stage | live | The centre chapter, where five pairs arrive one at a time |
| `I18N-001` | Twenty-locale runtime dictionary | live | 303 keys per locale, authored translations, swapped without a reload |
| `I18N-002` | Served-copy parity gate | live | `scripts/sync-static-copy.mjs --check` refuses a push where markup and dictionary disagree |
| `SITE-005` | The gateway served by the application | design | The same page, the same twenty locales and the same measured scene, served by the app instead of GitHub Pages — with the gated chapters resolved server-side rather than hidden by a stylesheet |
| `A11Y-001` | Accessibility baseline | live | Keyboard reach, accessible names, AA contrast against the painted pixel, reduced motion, print |

### 5.2 Access — `AUTH`, `ADMIN`

| Code | Feature | Status | What it is |
|---|---|---|---|
| `AUTH-001` | Sign-in | design | E-mail and password against a server-side account; failures indistinguishable and rate-limited |
| `AUTH-002` | Session and role gate | design | httpOnly cookie, rotation on privilege change, server-side invalidation; every gated read scoped by role at the query |
| `AUTH-003` | Invitation and password reset | design | An admin invites; the invitee sets their own password from a single-use, expiring link |
| `AUTH-004` | Sign-out | design | Session destroyed server-side, not merely cleared client-side |
| `ADMIN-001` | Account management | design | Create, suspend and delete investor accounts; grant and revoke deck access; audited |
| `ADMIN-002` | Admin console shell | design | The staff surface the other admin features live in |

### 5.3 The content system — `CMS`

Everything an investor reads is written by an admin, and these are the machinery
every kind of writing shares. Splitting it this way is the difference between a
product and four half-built editors: a report, an announcement and a deck differ
in what they say and in how they are read, and not at all in how they are drafted,
translated, previewed, published, withdrawn or audited.

| Code | Feature | Status | What it is |
|---|---|---|---|
| `CMS-001` | Content model and revisions | design | One storage model behind every kind of content: an item, its type, its ordered revisions, the revision that is published, and the audience it is published to. Nothing is edited in place — an edit is a new revision, so what an investor read last month is still recoverable |
| `CMS-002` | Authoring surface | design | The editor an admin writes in: structured blocks — heading, paragraph, list, quote, image, figure — never raw markup from a form, because markup from a form is both an injection surface and a way to break a layout nobody can fix from the admin screen |
| `CMS-003` | Media library | design | The images and files content references: uploaded once, re-used, served under the same audience rule as the item that references them. An investor-only screenshot must not be readable by URL |
| `CMS-004` | Preview, publish and withdraw | design | An admin sees a draft exactly as an investor will, publishes a revision deliberately, and can return to the previously published revision in one action. A draft is visible to nobody else, ever |
| `CMS-005` | Locale variants and translation state | design | Per item, per locale: not started, machine draft, reviewed. A machine draft is never shown to a reader; an unreviewed locale falls back to the authored language — `docs/decisions-log.md#I18N-DEC-01` |
| `CMS-006` | Audience and access | design | Public, every investor, or named investors. Enforced in the query that fetches the item, never in the template that renders it — the template is where this rule has historically been broken |
| `CMS-007` | Search and filter in the room | design | Find an item by kind, by product, by period, or by its words. A room with two years of updates and no search is an archive nobody reads |

### 5.4 What is written — `RPT`, `POST`, `DECK`, `INV`, `MAIL`

Three kinds of content sit on the system above, and they are separate features
because an investor navigates each of them differently.

| Code | Feature | Status | What it is |
|---|---|---|---|
| `RPT-001` | Investor report authoring | design | A report for a named period — a quarter, a month — composed in sections. This is the document an investor expects on a schedule and files when it arrives |
| `RPT-002` | Report periods and archive | design | One published report per period, navigable by date, with the current one surfaced and the rest reachable. A period cannot carry two published reports, because "the Q3 report" must name one document |
| `RPT-003` | Report reading | design | The investor's view: sequential, readable on a phone, printable, and stating the period and publication date on the page itself |
| `POST-001` | Update authoring | design | A short update, of a stated kind: an announcement, an achievement, or a progress note. Kinds exist because the three are read differently and an investor scanning for one should not have to read the other two |
| `POST-002` | Update publishing and audience | design | An update is public, investor-only, or draft; audience is enforced at the query, and the stream is ordered newest first |
| `DECK-001` | Deck authoring | design | An admin composes a presentation as ordered sections |
| `DECK-002` | Deck versioning and publishing | design | A deck is published as a version; an investor reads the version they were granted; a draft is never visible |
| `DECK-003` | Deck reading | design | The investor's view: sequential, readable on a phone, printable |
| `DECK-004` | Deck access grants | design | Which investor may read which deck, granted and revoked by an admin, audited |
| `INV-001` | Investor room shell | design | What a signed-in investor lands on: the update stream first, with the progress board, the current report, the deck and the gated chapters reachable from it |
| `INV-002` | Gated gateway chapters, served | design | The two chapters and the seven mechanisms, delivered by the server to an authorised reader and to nobody else — this is what replaces the CSS demonstration |
| `INV-003` | Portfolio progress | design | Where each of the six products stands, and the milestones ahead of it — the thing an investor opens the room to check when they have no time to read |
| `MAIL-001` | Investor mail | blocked | An admin sends a message to selected investors; every send is recorded — carrier at `docs/decisions-log.md#MAIL-DEC-01` |
| `MAIL-002` | Mail log and unsubscribe | blocked | What was sent, to whom, when; a working unsubscribe that stops non-transactional mail — `docs/decisions-log.md#MAIL-DEC-01` |

### 5.5 Platform — `DATA`, `SEC`, `CFG`, `OPS`, `INFRA`, `CRED`

| Code | Feature | Status | What it is |
|---|---|---|---|
| `DATA-001` | Schema and migrations | design | Accounts, sessions, decks, deck sections, deck grants, posts, mail log, audit, configuration |
| `DATA-002` | Erasure and retention | design | A real delete for an investor's personal data; audit retained minimally; retention windows stated |
| `DATA-003` | Backup and restore | design | A restore that has been performed, not merely configured |
| `SEC-001` | Security baseline | design | CSP, HSTS, secure cookies, parameterised queries, dependency and secret scanning in CI |
| `SEC-002` | Audit log | design | Append-only record of every privileged write |
| `CFG-001` | Runtime configuration | design | The values an admin may change without a deploy, each with its prior value and a single-action undo |
| `OPS-001` | Hosting and deploy | blocked | Where the app runs, and how valotech.org points at it — see `docs/decisions-log.md#INFRA-DEC-03` |
| `OPS-002` | Logging and monitoring | design | Structured logs with a request id, no personal data, and an alert an operator can act on |
| `INFRA-001` | Local development stack | design | One command brings up PostgreSQL and the app against it |
| `CRED-001` | Credential handling | design | SMTP and database credentials from the environment; a missing one degrades its feature and leaves the system up |

### 5.6 Compliance — `LEGAL-SG`, `LEGAL-GLOBAL`

| Code | Feature | Status | What it is |
|---|---|---|---|
| `LEGAL-SG-001` | PDPA posture | design | Consent for the stated purpose, access and correction, breach notification, a named DPO |
| `LEGAL-GLOBAL-001` | GDPR posture for EU investors | design | Lawful basis, subject rights, and what crosses a border |
| `LEGAL-GLOBAL-002` | Cookie and analytics posture | blocked | Whether the site measures anything about visitors at all — see `docs/decisions-log.md#OPS-DEC-01` |

---

## 6. Rule Catalogue

These hold across every feature. A feature that breaks one is not finished, whatever else it does.

### Security — `SEC-R*`

- **SEC-R01** The investor room is gated at the server, never by CSS.
- **SEC-R02** Sessions are httpOnly and SameSite=Lax, rotated on sign-in and on any privilege change, and invalidated server-side on sign-out.
- **SEC-R03** A sign-in failure is indistinguishable between an unknown account and a wrong password, and is rate-limited per account and per address.
- **SEC-R04** Every privileged write is audited: actor, timestamp, before, after — append-only.
- **SEC-R05** No secret lives in the repository. A missing credential degrades its feature and leaves the system up.

### Data and privacy — `DATA-R*`

- **DATA-R01** Collect the minimum: a name, an e-mail address, and the access granted.
- **DATA-R02** Personal data never appears in a log, in analytics, or in an error message.
- **DATA-R03** Erasure is a real delete; the audit trail is retained minimally.
- **DATA-R04** Mail is sent only for the consented purpose, carries an unsubscribe path, and is recorded.
- **DATA-R05** Every gated read is scoped by the reader's role at the query, never in the template.
- **DATA-R06** Every migration ships a down-migration that has been run, not merely written.
- **DATA-R07** Folding is the only sanctioned edit to a migration that has already been applied anywhere. A re-stamped migration can never run; a fold is proved to reach the same schema.
- **DATA-R08** A migration number is claimed from `origin/development`, and the sequence is repository-wide.
- **DATA-R09** Audit rows are append-only, enforced by the database rather than by convention.
- **DATA-R10** A retention window is enforced by a scheduled deletion. Until one runs, the window is a claim.

### The content system — `CMS-R*`

- **CMS-R01** Content is never edited in place. An edit creates a revision, and the revision an investor read stays recoverable — because "what were they shown, and when" is a question a fundraise eventually asks.
- **CMS-R02** A draft is visible to its author and to nobody else. Not by an unguessable URL, not by a preview token that outlives the preview, not to another admin's session by accident.
- **CMS-R03** Audience is decided in the query that fetches the item. A template that filters is a template one refactor away from not filtering, and the failure is silent.
- **CMS-R04** Content is stored as structured blocks, never as markup submitted from a form. This is both the injection boundary and the reason the layout cannot be broken from the admin screen.
- **CMS-R05** A machine translation is never shown to a reader. It is a draft state, and the reader sees the authored language until an admin has read the locale and marked it reviewed.
- **CMS-R06** Media inherits the audience of the item that references it. An investor-only image must not be readable by anyone who guesses its URL.
- **CMS-R07** Publishing and withdrawing are audited under `SEC-R04`, with what was replaced, so a page that changed can be explained without a database restore.

### The scene — `SCENE-R*`

- **SCENE-R01** The designs under `docs/designs/scene/` are the record; the one that governs a change is updated in the same commit as it.
- **SCENE-R02** Nothing in the scene is measured from a constant duplicating a stylesheet value.
- **SCENE-R03** No idle animation.
- **SCENE-R04** Reduced motion slows the scene; it never freezes it and never blanks a chapter.
- **SCENE-R05** The world stays in sight.

### Language — `I18N-R*`

- **I18N-R01** No hard-coded visitor-facing string.
- **I18N-R02** Twenty locales, complete in every one; English authored, the rest authored translations.
- **I18N-R03** The served-copy parity gate passes before any push.
- **I18N-R04** A missing key falls back to English; a raw key never reaches the screen.
- **I18N-R05** Typography follows the locale.

### Accessibility — `A11Y-R*`

- **A11Y-R01** Keyboard reach and a visible focus ring on every control.
- **A11Y-R02** An accessible name on every interactive element.
- **A11Y-R03** WCAG AA contrast against the painted pixel.
- **A11Y-R04** The scene is `aria-hidden` and carries no information the text does not.

---

## 7. Domain notes

### 7.1 What actually moves behind the sign-in

The reference design settles this, and the gateway already follows it. A visitor gets: the hero, the problem, the answer as three services, how their own people fit in, why leaders trust the company, what the workforce does, the brain that compounds, what they keep, and the contact close.

An investor additionally gets **how delivery works** — the five-phase engagement, each phase with its outcome — and **the portfolio**: the six products, where each stands, and what the deployments add up to. They also get the three mechanisms under each of the seven trust claims, which is where the argument stops being a claim and becomes a description of infrastructure.

The reason for the line is not secrecy. It is that a buyer needs a decision and an investor needs a model, and one page cannot make both cases without becoming a hybrid that serves neither. The gateway was that hybrid until the split.

### 7.2 What the room is for

An investor signs in to find out **what has happened since they last looked**.
That shapes three things.

The room's landing surface is the **update stream**, not the deck: a reverse-
chronological list of what the team announced, what it achieved, and how each
product moved. An update carries a **kind**, because the three are read
differently — an announcement is news, an achievement is evidence, and a progress
note is a number moving — and an investor scanning for one should not have to
read the other two.

The **progress board** (`INV-003`) answers the question the stream answers only
in fragments: where does each of the six products stand right now. It is a state
rather than a history, and it is the thing an admin updates when a milestone
moves rather than when they have something to say.

The **deck** is read once, at the start of a conversation, and the stream is read
every time after. Both exist; the room is laid out for the second.

### 7.3 What the content system is, and what it is not

It is the surface a non-developer uses to keep the investor room current. Its
test is simple and unforgiving: **can the person who knows what happened this
month put it in front of investors, correctly, without asking a developer?** If
the answer needs a deploy, a migration or a rebuild, the system is not finished
however much of it is built.

It is not a general-purpose website builder, and it does not manage the gateway
(§7.6). It has one author role, one storage model, one publish action and one
undo, and each of those is singular on purpose: every additional path through a
publishing system is a way for the wrong thing to become visible.

**Three content types, one machine.** A report is periodic and expected; an
update is occasional and scanned; a deck is a pitch read once at the start of a
conversation. They differ in how an investor reaches them — a report by its
period, an update by its recency, a deck by being handed it — and not at all in
how they are written. So the navigation, the reading views and the audience
model differ; the editor, the revision history, the locale states, the preview
and the audit are one thing used three ways.

### 7.4 What a deck is

A deck is an ordered set of sections, published as a version. An investor is granted a deck, and reads the version current at the moment they read. A draft is never visible to anyone but an admin. Versioning exists because the fundraise story changes and an investor who was shown one thing must not silently be shown another; what they were shown, and when, is recoverable.

### 7.5 Mail

Mail is the one feature that reaches outside the system irrecoverably. A send is therefore never automatic, never triggered by a loop, and always records what left, to whom, and when. An investor who unsubscribes stops receiving anything that is not a direct response to their own action.

### 7.6 Why the gateway's words are not in the content system

The gateway is nine chapters of argument in twenty languages, cached at a CDN,
and read by people deciding whether to talk to the company at all. A wrong word
there is the company's face; a wrong word in an update is seen by a dozen people
who already know us and is fixed in a minute. Those are different risks and they
want different processes, and one system serving both would have to pick: either
an update waits on twenty reviewed locales, or the gateway publishes as loosely
as an update. Both are worse than two systems.

The two share what is genuinely shared — the audit trail and the locale
catalogue — and nothing else. That is the settled position at
[`CMS-DEC-01`](decisions-log.md#CMS-DEC-01), and the direction it can move is
towards merging later, which is why it starts apart.

What changes for the gateway is not who edits it but who serves it: `SITE-005`
moves it from GitHub Pages to the application so the gate under `INV-002` can be
real. The words still change by commit, through the parity gate, in the same
twenty locales.

### 7.7 The scene's place

The scene is documented under `docs/designs/scene/` in far more detail than this document should carry, because it is the part of the product a reader cannot reason about from first principles. Six designs hold it: the world and its journey, the satellites, the sky, the annotation chips, the orbit stages and the mapping stage. Its rules are in §6 above; its reasoning is there.

---

## 8. Success

The gateway succeeds when a regulated-industry buyer reads it and asks for the conversation, and when an investor reads the room and understands the portfolio without a call. Both are judged by the owner reading the pages, not by a metric this repository collects — see `docs/decisions-log.md#OPS-DEC-01` for whether it collects any at all.

---

## 9. Glossary

`visitor` · `investor` · `admin` · `gateway` · `investor room` · `deck` · `post` · `scene` · `chapter` · `station` — defined once in `.claude/CLAUDE.md` §7.3 and not restated here.

---

## 10. Coding scheme

Defined once in `.claude/CLAUDE.md` §3.1 and §3.2. Codes in this document are the authority for what each names.
