# VALO Tech — Decision register

> **Not for `main`.** This document lives on `development` only (`.claude/CLAUDE.md` §1.1).

Every choice that shapes the product and is not settled by the code alone is filed here, once, with a stable anchor. Every other artifact links to `decisions-log.md#CODE` and restates nothing: when an answer lands, only this file is edited and every reference is correct by construction.

An entry is filed the moment the choice surfaces, not when it is answered. Nothing blocks on an open decision — each ships a fail-closed safe default named on its `Status:` line.

---

## Open decisions

<a id="INFRA-DEC-03"></a>
### `INFRA-DEC-03` — Where the application runs, and how valotech.org reaches it — OPEN

- **Decision:** Which host runs the Next.js application, and how the domain is pointed at it without the gateway going dark.
- **Options:** **A** A small VPS running the app and PostgreSQL under Docker, with Cloudflare in front as it is today · **B** A managed platform (Vercel, Fly, Railway) with a managed PostgreSQL, keeping Cloudflare for the domain · **C** AWS, matching where the products run.
- **Recommendation:** **A.** The workload is one small application and one small database with no traffic spike to absorb, so a managed platform's price is paid for elasticity nobody needs; and a VPS keeps the whole system in one place the owner can inspect. **B** is the honest runner-up and would be right if deployment time turns out to matter more than cost. **C** is the shape the products use and would be over-built here.
- **Decision owner:** user
- **Blocks:** `OPS-001`
- **Status:** OPEN. Safe default: nothing is deployed. The gateway continues to be served by GitHub Pages from `main`, unchanged, and the application is developed and run locally only. No DNS record moves until this is answered.

<a id="OPS-DEC-01"></a>
### `OPS-DEC-01` — Whether the site measures anything about visitors — OPEN

- **Decision:** Does valotech.org collect analytics, and if so of what kind.
- **Options:** **A** Nothing at all — no analytics, no cookies beyond the session cookie the investor room needs · **B** Privacy-preserving, cookieless server-side counts of page views and languages, retained briefly · **C** A conventional analytics product with a consent banner.
- **Recommendation:** **A** for now, moving to **B** if the owner wants to know which languages are actually read. **A** needs no consent banner, no cookie policy and no data-protection posture for visitors, which removes an entire compliance surface from a page whose job is persuasion. **C** buys detail the company has no decision waiting on, at the cost of a banner in front of its own front door.
- **Decision owner:** user
- **Blocks:** `LEGAL-GLOBAL-002`
- **Status:** OPEN. Safe default: the site collects nothing. No analytics script is loaded and no cookie is set for a visitor who does not sign in.

<a id="MAIL-DEC-01"></a>
### `MAIL-DEC-01` — Which service carries mail to investors — OPEN

- **Decision:** How a message an admin composes actually reaches an investor's inbox.
- **Options:** **A** A transactional mail provider (Resend, Postmark, SES) over API · **B** SMTP against the company's existing mailbox · **C** No sending at all — the admin console composes and the admin sends from their own client.
- **Recommendation:** **A.** Deliverability to institutional inboxes is the whole point of the feature, and a provider gives SPF, DKIM and a bounce signal that a mailbox does not. **B** costs nothing extra and is acceptable for a handful of recipients, but a message that silently lands in spam is worse than one that was never sent. **C** is the honest fallback if the owner would rather not put investor addresses through a third party at all.
- **Decision owner:** user
- **Blocks:** `MAIL-001`, `MAIL-002`
- **Status:** OPEN. Safe default: no mail is sent. `MAIL-001` is not built, and the contact path on the gateway stays a `mailto:` link that opens the reader's own client.

---

## Resolved decisions

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
