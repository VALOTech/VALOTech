---
code: SEC-001
title: Security baseline
domain: sec
prd_refs: [SEC-001, SEC-R01, SEC-R02, SEC-R03, SEC-R05, DATA-R02]
depends_on: [AUTH-002]
depended_by: [CMS-003, OPS-001, OPS-002]
layers_touched: [infra, api, frontend]
cross_cutting_rules: [SEC-R01, SEC-R02, SEC-R03, SEC-R05, DATA-R02]
status: in-progress
---

# `SEC-001` — Security baseline

## 1. Purpose and PRD refs

The protections that apply to every route rather than to one feature: transport,
headers, input handling, dependency and secret scanning. Realizes `SEC-001`.

It is a baseline in the literal sense — nothing here is a feature, and each item
is something whose absence is only discovered by the person exploiting it. It
lands before `OPS-001` because a header you forgot to set before the first deploy
is a header the browser has already cached the absence of.

## 2. Layer walkthrough

**Down.** Response headers set in one middleware, not per route. Parameterised
queries by construction, because the database client takes values and not
strings. Dependency and secret scanning in CI.

**Up.** A blocked request gets an error that says what to do and nothing about
why it was blocked. A blocked page gets nothing at all — a Content-Security-Policy
violation is silent to the visitor by design, which is why it is verified in a
browser rather than assumed from the header being present.

## 3. Contracts

### Headers, every response

| Header | Value | What it stops |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'nonce-<per request>'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` | Injected script, and the page being framed by somebody else's |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | A first request over plain HTTP after the first visit |
| `X-Content-Type-Options` | `nosniff` | An uploaded image being interpreted as script |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | An investor-room URL leaking to an external site |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()` | Capabilities this product never uses |

**The CSP has no `unsafe-inline`, and the nonce is what refusing it costs.**
Next serialises every rendered page into inline `<script>` tags, so a
`script-src` admitting neither a nonce nor `'unsafe-inline'` blocks them and the
page paints without hydrating. The nonce is minted per request in the proxy and
set on the request as well as the response, because the render is what stamps it
onto the tags Next emits — which is also why every route renders on demand
rather than at build time ([`SEC-DEC-02`](../../decisions-log.md#SEC-DEC-02)): a
prerendered route is served with a policy whose nonce nothing in its HTML
carries. An `unsafe-inline` added to make one page work removes the protection
from every page, which is the shape this class of defect always takes.

The `preload` token states that the domain is eligible for the HSTS preload
list; it does not put it there. Submission is a human step whose undo is
measured in browser releases, so it waits for every host under the domain to
terminate TLS (`operator-checklist.md#HSTS-PRELOAD`).

`Permissions-Policy` denies both `browsing-topics` and `interest-cohort`: they
are the current and the retired names for interest-based ad targeting, and a
browser acts on whichever it implements, so denying only the retired one would
leave the live capability enabled.

**"Every response" is every document.** The build's own immutable assets under
`_next/static` and `_next/image` are outside the middleware's matcher and carry
none of these headers. That is deliberate: a Content-Security-Policy on a
content-addressed script governs nothing, and marking a bundle unstorable would
make every reader re-download it while protecting nothing. The one header that
would still bind on them is `nosniff`, and its threat — an uploaded file
interpreted as script — belongs to media `CMS-003` serves, not to these
known-type build artefacts.

### Transport and cookies

TLS terminated at the edge, HTTP redirected permanently. The session cookie is
`httpOnly`, `Secure`, `SameSite=Lax`, host-only, path `/` (`SEC-R02`, owned by
`AUTH-002`). `SameSite=Lax` rather than `Strict` because an investor following a
link from an e-mail must arrive signed in, and `Strict` would sign them out at
exactly the moment the product asked them to click something.

### Input

Every value crossing the boundary is parsed by a schema at the route, and the
parsed value is what the handler sees — the unparsed body is not in scope. Every
query passes values as parameters; string concatenation into SQL exists nowhere,
and the client makes that structural rather than a rule.

Uploads (`CMS-003`) are validated against their **bytes**, never their filename
or their claimed content type, and are re-encoded before storage.

### Rate limits

| Surface | Limit | Why |
|---|---|---|
| Sign-in | per account **and** per address | Per-address alone lets a distributed attempt through; per-account alone lets one address lock out every account it knows |
| Password reset request | per address | The mail it triggers is the cost |
| Invitation acceptance | per token | A single-use token brute-forced is an account |

A refusal is a `429` with a `Retry-After`, and it says the same thing whoever
asks — a limit that tells an attacker which accounts exist is an enumeration
oracle wearing a rate limit (`SEC-R03`).

### CI

| Check | Blocks |
|---|---|
| `gitleaks` on the working tree, and nightly on full history | Yes |
| Dependency audit, critical and high | Yes |
| `tsc --noEmit` | Yes |
| The gates in `make check` | Yes |

Actions are pinned to a commit SHA with the tag in a comment. A moving tag is a
supply-chain dependency on somebody else's discipline, and this repository has
already had one fabricated SHA in a workflow file — which is why the pin is
verified against the upstream release rather than written from memory.

## 4. Integration

**`AUTH-002`** owns the cookie; this design owns everything around it.
**`CMS-003`** owns upload validation and cites the rule here; if it ever serves
uploaded media through `/_next/image`, that path is outside this middleware's
matcher and carries no `nosniff`, so `CMS-003`'s own response must set the header
its threat model needs rather than inherit it here. **`OPS-001`** terminates TLS
and must not strip these headers at the edge — a proxy that adds its own
`X-Frame-Options` and drops the CSP is the usual way this baseline is lost after
it was verified.

## 5. Cross-cutting compliance

- **`SEC-R01`** — the gate is at the server; nothing here weakens that.
- **`SEC-R02`** — cookie flags, stated once, here and in `AUTH-002`.
- **`SEC-R03`** — indistinguishable failures, rate-limited on both axes.
- **`SEC-R05`** — secret scanning is what makes this mechanical.
- **`DATA-R02`** — an error message names no address and no account state.

## 6. Open questions and trade-offs

- **No Web Application Firewall.** Cloudflare is already in front and its
  managed rules are available. They are not relied on here because a rule set
  the application cannot see is a control nobody can test, and the application's
  own validation must hold with the edge removed.
- **No CSP reporting endpoint.** A report-only phase would catch a policy that
  breaks a page in a browser nobody tested. It is not built because the page is
  verified in a browser before every push (§17), and an endpoint that collects
  reports is a surface that accepts unauthenticated writes. Reopen if the app
  ever loads a third-party script, at which point the trade reverses.
- **The nonce has two silent failure modes, and both pass every gate.** Next
  reads the nonce out of the request's `script-src` with a match that is
  case-sensitive on both the directive name and the `'nonce-'` prefix, and
  returns nothing — no log, no warning — on a mismatch. So reformatting the
  header, lower-casing a directive, or tidying its spacing would make the whole
  policy inert while every test that only reads the header string stays green;
  the guard against it is that a page is driven in a browser, where the blocked
  scripts show. And `style-src 'self'` admits no inline style only because the
  production build emits none: enabling `experimental.inlineCss`, or importing
  `next/image` (which sets a `style=` attribute), would ship an inline style the
  policy blocks, because Next hands React a *string* nonce and a hoisted
  `<style>` never receives one. Both are verified-clean today and would fail in a
  browser, not in a gate.
- **The root error page is Next's, not this one, when reached by URL.**
  `global-error.tsx` styles the catastrophic-error page from an external module
  and offers a plain link out, and a real root-layout crash renders it
  dynamically and nonced. But Next prerenders the internal `/_global-error`
  route with its own built-in body, which carries inline style and no nonce, so
  a direct request to that URL is CSP-degraded and cacheable
  ([`SEC-DEC-02`](../../decisions-log.md#SEC-DEC-02)). The trivial root layout
  makes the crash path itself nearly unreachable; the residue is `OPS-001`'s to
  keep out of a CDN.

## 7. Task list

- `SEC-001/T1` — One middleware sets every header on every response, with no route exempt
- `SEC-001/T2` — The CSP carries no `unsafe-inline`, and the page is verified in a browser under it
- `SEC-001/T3` — Every route parses its input with a schema, and the handler sees only the parsed value
- `SEC-001/T4` — Rate limits on sign-in, reset and invitation, per account and per address, refusing identically
- `SEC-001/T5` — `gitleaks`, dependency audit and type check in CI, with every action pinned to a verified SHA
