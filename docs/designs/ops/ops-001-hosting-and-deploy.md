---
code: OPS-001
title: Hosting and deploy
domain: ops
prd_refs: [OPS-001, SEC-R05]
depends_on: [CRED-001, DATA-003, OPS-002, SEC-001, SITE-005]
depended_by: []
layers_touched: [infra]
cross_cutting_rules: [SEC-R01, SEC-R05, DATA-R02]
status: pending-decision
decision_required: Where the application runs, and how valotech.org reaches it
decision_owner: user
---

# `OPS-001` — Hosting and deploy

## 1. Purpose and PRD refs

Where the application runs, and how valotech.org comes to point at it. Realizes
`OPS-001`.

It is the **last task in the plan** and the only one that ends the static site's
tenure. It is also the commit after which a defect has an audience, which is
where `.claude/CLAUDE.md` §12 switches the `REVIEW` mechanism on.

Blocked on [`INFRA-DEC-03`](../../decisions-log.md#INFRA-DEC-03). Every artefact
below is buildable now and none of it can be aimed anywhere until the host is
chosen.

## 2. Layer walkthrough

**Down.** A container image, a migration step that runs before the new image
serves, environment variables from wherever the host keeps them, and a health
check the host actually polls.

**Up.** Nothing changes for a visitor. That is the requirement.

## 3. Contracts

### The cutover

The one thing this task must not do is leave valotech.org degraded, so the
cutover is arranged to be reversible by a single DNS change:

1. The application runs at a subdomain and is verified there — every page, three
   viewports, twenty locales, both readers.
2. The static site keeps serving `valotech.org` from `main` throughout.
3. The record moves, with a short TTL set **a day in advance** so the move and
   its reversal both take minutes rather than hours.
4. `main` stays deployable and untouched for at least a month.

Step 3's preparation is the part that is skipped and then regretted: a record
with a day-long TTL cannot be reverted quickly, and the moment reversal is wanted
is the moment that matters.

### Deploying

    build -> migrate -> serve -> health-check -> keep or roll back

**The migration runs before the new image serves and after the old one stops**,
which is the only ordering that avoids two versions writing to one schema. It is
also why every migration must be additive or the deploy must accept a moment of
downtime — the schema and the code are one deploy, not two.

A failed health check rolls back to the previous image. Rolling back the image
does not roll back the migration, which is what makes `DATA-R06`'s tested
down-migration load-bearing rather than ceremonial.

### The environment

Variables from the host's own mechanism, never from a file in the image
(`SEC-R05`). The application refuses to start when a required one is missing
(`CRED-001`), which means a misconfigured deploy fails at deploy rather than at
the first request — an operator sees it instead of an investor.

### What is verified after every deploy

| Check | Why it is on the list |
|---|---|
| `/health` returns the expected version | The running artefact predates the tree it was built from more often than anyone expects |
| The page renders anonymously with no gated string in the body | `INV-002`'s guarantee, re-proved on the real deployment |
| A signed-in reader sees the gated chapters | The other half |
| The security headers are present through the CDN | An edge that strips or replaces a header is the usual way this baseline is lost |
| The locale switch works | The one thing a build step can break silently |

### Staging

The `staging` branch exists and is the owner's to promote into. The environment
it deploys to carries `APP_ENV=staging`, which is what raises `ADMIN-002`'s
environment bar — the guard against somebody editing production believing they
are elsewhere.

## 4. Integration

**`SITE-005`** is what is being deployed. **`SEC-001`** supplies the headers the
edge must not strip. **`OPS-002`**'s log destination and alert delivery are
configured here. **`DATA-003`**'s backup target is configured here.
**`CRED-001`** is how the values arrive.

## 5. Cross-cutting compliance

- **`SEC-R01`** — the gate is only real once this runs, and the post-deploy
  check is what proves it on the real deployment.
- **`SEC-R05`** — no secret in the image; a missing required value stops the
  start.
- **`DATA-R02`** — the host's own logs are subject to the same rule, which is a
  question to ask of whichever host is chosen.

## 6. Open questions and trade-offs

- **The host is unchosen.** [`INFRA-DEC-03`](../../decisions-log.md#INFRA-DEC-03).
  The safe default is that nothing is deployed and the static site keeps serving,
  and this design is written so the answer configures it.
- **Migration before serve means a moment of downtime for a non-additive
  change.** The alternative — expand, deploy, contract — is three deploys and is
  correct for a system with users mid-transaction. This one has a handful of
  readers and no writes it cannot lose a second of, so the simpler ordering is
  right until it is not.
- **One environment or two.** Staging costs a second host and a second database
  and is the only place a deploy can be rehearsed. The recommendation is two,
  cheaply; the decision is part of `INFRA-DEC-03`.

## 7. Task list

- `OPS-001/T1` — Deploy the application somewhere and point the domain at it
- `OPS-001/T2` — The deploy sequence: migrate before serve, health-check after, roll back on failure
- `OPS-001/T3` — A short DNS TTL set a day before the cutover, and `main` left deployable for a month after
- `OPS-001/T4` — Environment from the host's own mechanism; a missing required value stops the start
- `OPS-001/T5` — The five post-deploy checks, run against the real deployment through the CDN
- `OPS-001/T6` — A staging environment carrying `APP_ENV=staging`, so the console says which one it is
