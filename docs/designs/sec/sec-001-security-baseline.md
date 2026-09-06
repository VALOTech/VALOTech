---
code: SEC-001
title: Security baseline
domain: sec
prd_refs: [SEC-001, SEC-R01, SEC-R02, SEC-R03, SEC-R05, DATA-R02]
depends_on: [AUTH-002]
depended_by: [OPS-001]
layers_touched: [infra, api, frontend]
cross_cutting_rules: [SEC-R01, SEC-R02, SEC-R03, SEC-R05, DATA-R02]
status: design-ready
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
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` | Injected script, and the page being framed by somebody else's |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | A first request over plain HTTP after the first visit |
| `X-Content-Type-Options` | `nosniff` | An uploaded image being interpreted as script |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | An investor-room URL leaking to an external site |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Capabilities this product never uses |

**The CSP has no `unsafe-inline`.** The gateway's scene is external files
already, so the cost is one nonce for the locale bootstrap rather than a rewrite.
An `unsafe-inline` added to make one page work removes the protection from every
page, which is the shape this class of defect always takes.

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
**`CMS-003`** owns upload validation and cites the rule here. **`OPS-001`**
terminates TLS and must not strip these headers at the edge — a proxy that adds
its own `X-Frame-Options` and drops the CSP is the usual way this baseline is
lost after it was verified.

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

## 7. Task list

- `SEC-001/T1` — One middleware sets every header on every response, with no route exempt
- `SEC-001/T2` — The CSP carries no `unsafe-inline`, and the page is verified in a browser under it
- `SEC-001/T3` — Every route parses its input with a schema, and the handler sees only the parsed value
- `SEC-001/T4` — Rate limits on sign-in, reset and invitation, per account and per address, refusing identically
- `SEC-001/T5` — `gitleaks`, dependency audit and type check in CI, with every action pinned to a verified SHA
