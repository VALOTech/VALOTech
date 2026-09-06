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
- **The investor room** — everything behind the sign-in. It holds the deeper case: how delivery actually works, what the portfolio is, where each product stands, and the presentation an investor is asked to read. It also holds the means of keeping investors informed.

### 2.2 What it is not

It is not a product the company sells, it carries no payment, and it holds no customer data. Its only stored personal data is the identity of the investors who have been given access.

### 2.3 Where it is today

The gateway is **live and complete**: one static page, no build step, served by GitHub Pages from `main`, fronted by Cloudflare, translated into twenty languages, carrying a WebGL scene whose record is `docs/design-gateway.md`. Its investor split is real — two chapters and the detail under each of seven claims are hidden from a visitor — but the gate that hides them is CSS, and the material is in the page source. It is a demonstration of the design, not a control.

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

A third role — an analyst who may read but not manage, an observer with time-limited access — is not in scope and is not to be invented in code. If one is needed it is filed as a decision.

---

## 5. Feature Catalogue

### 5.1 The gateway — `SITE`, `SCENE`, `I18N`, `A11Y`

| Code | Feature | Status | What it is |
|---|---|---|---|
| `SITE-001` | The gateway page | live | One page, nine chapters, a fixed scene behind them, a sign-in entry, and a contact close |
| `SITE-002` | Public and investor chapter split | live | Two chapters and the mechanism detail under seven claims are hidden from a visitor; the nav names the hidden pair only to a signed-in reader |
| `SITE-003` | Chapter sequence | live | Problem, Answer, Your people, Why, Workforce, ValoStack, Yours-not-ours, Contact — the designer's order |
| `SITE-004` | Contact close | live | A short call, an e-mail CTA, and the reason pricing is not published |
| `SCENE-001` | The world and its journey | live | A lunar sphere that becomes Earth across the page; stations per chapter; the record is `docs/design-gateway.md` |
| `SCENE-002` | Satellites and their rings | live | Three bodies on three drawn paths; one moon carrying the people, two craft carrying the work |
| `SCENE-003` | The sky | live | A parallaxed star field with colour temperature, two kinds of twinkle, meteors with two endings, and a rare supernova |
| `SCENE-004` | Annotation chips | live | Fifteen labels across five chapters, each pinned to one body |
| `SCENE-005` | Orbit stages | live | Two chapters whose cards ride an ellipse about the world |
| `SCENE-006` | Mapping stage | live | The centre chapter, where five pairs arrive one at a time |
| `I18N-001` | Twenty-locale runtime dictionary | live | 303 keys per locale, authored translations, swapped without a reload |
| `I18N-002` | Served-copy parity gate | live | `scripts/sync-static-copy.mjs --check` refuses a push where markup and dictionary disagree |
| `A11Y-001` | Accessibility baseline | live | Keyboard reach, accessible names, AA contrast against the painted pixel, reduced motion, print |

### 5.2 Access — `AUTH`, `ADMIN`

| Code | Feature | Status | What it is |
|---|---|---|---|
| `AUTH-001` | Sign-in | planned | E-mail and password against a server-side account; failures indistinguishable and rate-limited |
| `AUTH-002` | Session and role gate | planned | httpOnly cookie, rotation on privilege change, server-side invalidation; every gated read scoped by role at the query |
| `AUTH-003` | Invitation and password reset | planned | An admin invites; the invitee sets their own password from a single-use, expiring link |
| `AUTH-004` | Sign-out | planned | Session destroyed server-side, not merely cleared client-side |
| `ADMIN-001` | Account management | planned | Create, suspend and delete investor accounts; grant and revoke deck access; audited |
| `ADMIN-002` | Admin console shell | planned | The staff surface the other admin features live in |

### 5.3 The investor room — `INV`, `DECK`, `POST`, `MAIL`

| Code | Feature | Status | What it is |
|---|---|---|---|
| `INV-001` | Investor room shell | planned | What a signed-in investor lands on, and how they reach a deck, the posts, and the gated chapters |
| `INV-002` | Gated gateway chapters, served | planned | The two chapters and the seven mechanisms, delivered by the server to an authorised reader and to nobody else — this is what replaces the CSS demonstration |
| `DECK-001` | Deck authoring | planned | An admin composes a presentation as ordered sections |
| `DECK-002` | Deck versioning and publishing | planned | A deck is published as a version; an investor reads the version they were granted; a draft is never visible |
| `DECK-003` | Deck reading | planned | The investor's view: sequential, readable on a phone, printable |
| `DECK-004` | Deck access grants | planned | Which investor may read which deck, granted and revoked by an admin, audited |
| `POST-001` | Post authoring | planned | An admin writes an article |
| `POST-002` | Post publishing and audience | planned | A post is public, investor-only, or draft; audience is enforced at the query |
| `MAIL-001` | Investor mail | blocked | An admin sends a message to selected investors; every send is recorded — carrier at `docs/decisions-log.md#MAIL-DEC-01` |
| `MAIL-002` | Mail log and unsubscribe | blocked | What was sent, to whom, when; a working unsubscribe that stops non-transactional mail — `docs/decisions-log.md#MAIL-DEC-01` |

### 5.4 Platform — `DATA`, `SEC`, `CFG`, `OPS`, `INFRA`, `CRED`

| Code | Feature | Status | What it is |
|---|---|---|---|
| `DATA-001` | Schema and migrations | planned | Accounts, sessions, decks, deck sections, deck grants, posts, mail log, audit, configuration |
| `DATA-002` | Erasure and retention | planned | A real delete for an investor's personal data; audit retained minimally; retention windows stated |
| `DATA-003` | Backup and restore | planned | A restore that has been performed, not merely configured |
| `SEC-001` | Security baseline | planned | CSP, HSTS, secure cookies, parameterised queries, dependency and secret scanning in CI |
| `SEC-002` | Audit log | planned | Append-only record of every privileged write |
| `CFG-001` | Runtime configuration | planned | The values an admin may change without a deploy, each with its prior value and a single-action undo |
| `OPS-001` | Hosting and deploy | blocked | Where the app runs, and how valotech.org points at it — see `docs/decisions-log.md#INFRA-DEC-03` |
| `OPS-002` | Logging and monitoring | planned | Structured logs with a request id, no personal data, and an alert an operator can act on |
| `INFRA-001` | Local development stack | planned | One command brings up PostgreSQL and the app against it |
| `CRED-001` | Credential handling | planned | SMTP and database credentials from the environment; a missing one degrades its feature and leaves the system up |

### 5.5 Compliance — `LEGAL-SG`, `LEGAL-GLOBAL`

| Code | Feature | Status | What it is |
|---|---|---|---|
| `LEGAL-SG-001` | PDPA posture | planned | Consent for the stated purpose, access and correction, breach notification, a named DPO |
| `LEGAL-GLOBAL-001` | GDPR posture for EU investors | planned | Lawful basis, subject rights, and what crosses a border |
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

### The scene — `SCENE-R*`

- **SCENE-R01** `docs/design-gateway.md` is the record; it is updated in the same commit as the change.
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

### 7.2 What a deck is

A deck is an ordered set of sections, published as a version. An investor is granted a deck, and reads the version current at the moment they read. A draft is never visible to anyone but an admin. Versioning exists because the fundraise story changes and an investor who was shown one thing must not silently be shown another; what they were shown, and when, is recoverable.

### 7.3 Mail

Mail is the one feature that reaches outside the system irrecoverably. A send is therefore never automatic, never triggered by a loop, and always records what left, to whom, and when. An investor who unsubscribes stops receiving anything that is not a direct response to their own action.

### 7.4 The scene's place

The scene is documented in `docs/design-gateway.md` in far more detail than this document should carry, because it is the part of the product that a reader cannot reason about from first principles. Its rules are in §6 above; its reasoning is there.

---

## 8. Success

The gateway succeeds when a regulated-industry buyer reads it and asks for the conversation, and when an investor reads the room and understands the portfolio without a call. Both are judged by the owner reading the pages, not by a metric this repository collects — see `docs/decisions-log.md#OPS-DEC-01` for whether it collects any at all.

---

## 9. Glossary

`visitor` · `investor` · `admin` · `gateway` · `investor room` · `deck` · `post` · `scene` · `chapter` · `station` — defined once in `.claude/CLAUDE.md` §7.3 and not restated here.

---

## 10. Coding scheme

Defined once in `.claude/CLAUDE.md` §3.1 and §3.2. Codes in this document are the authority for what each names.
