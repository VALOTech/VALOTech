---
code: OPS-001
title: Hosting and deploy
domain: ops
prd_refs: [OPS-001, SEC-R05]
depends_on: [CRED-001, DATA-003, OPS-002, SEC-001, SITE-005]
depended_by: []
layers_touched: [infra]
cross_cutting_rules: [SEC-R01, SEC-R05, DATA-R02]
status: design-ready
---

# `OPS-001` — Hosting and deploy

## 1. Purpose and PRD refs

Where the application runs, and how valotech.org comes to point at it. Realizes
`OPS-001`.

It is the **last task in the plan** and the only one that ends the static site's
tenure. It is also the commit after which a defect has an audience, which is
where `.claude/CLAUDE.md` §12 switches the `REVIEW` mechanism on.

The host is **AWS** ([`INFRA-DEC-03`](../../decisions-log.md#INFRA-DEC-03)), the
same ground the products run on, and the shape inside AWS is **ECS Fargate with
RDS PostgreSQL** ([`INFRA-DEC-05`](../../decisions-log.md#INFRA-DEC-05)) — the
smallest arrangement that is genuinely AWS, genuinely managed, and genuinely
operable by one person. There is no EKS cluster to join today; when the
ecosystem provisions one for another product, moving onto it is a deployment
change and not an application change, because nothing above this design knows
what runs it.

## 2. Layer walkthrough

**Down.** Terraform under `deploy/` describes one VPC, one Fargate service
behind an ALB, one RDS instance in private subnets, and the DNS and certificate
that put valotech.org in front of it. A container image is built in CI and
pushed to ECR.

**Up.** Nothing changes for a visitor. That is the requirement, and the way it is
held is that the static site stays deployable until well after the switch.

## 3. Contracts

### What AWS actually carries

| Piece | What it is | Why not something smaller |
|---|---|---|
| **ECR** | The image registry | The deploy needs somewhere to pull from |
| **ECS Fargate** | One service, one task, 0.5 vCPU / 1 GB | No host to patch. An EC2 instance would put the operating system back on the owner, which is what AWS was chosen to remove |
| **ALB** | TLS termination, the health check, the target group | Fargate has no stable address of its own, and the health check is what makes a bad deploy roll back rather than serve |
| **RDS PostgreSQL 17** | `db.t4g.micro`, private subnets, no public address | The database is never reachable from the internet. A publicly-addressable database is one password from being somebody else's |
| **Route 53 + ACM** | The record and the certificate | Renewal is automatic; a certificate that expires on a Sunday is the failure this removes |
| **Secrets Manager** | `DATABASE_URL`, `SESSION_SECRET`, `SMTP_URL` | Injected as task environment at start (`CRED-001`). Never in the image, never in the task definition as plaintext |
| **S3** | The backup target (`DATA-003`) | Versioned, lifecycle-expired, and in a different account path from the database |
| **CloudWatch Logs** | Where `OPS-002`'s JSON lines land | Fargate's default driver; a log group with a retention, not an unbounded one |

**Two availability zones for the subnets and one task.** The zones cost nothing
and are what let the task be rescheduled when one zone is unwell; a second
running task would double the bill to protect a page with a dozen readers and
would need the session store to be shared, which it is (`sessions` is a table),
but the trade still is not worth taking until somebody is inconvenienced by the
single task restarting.

### Terraform, and what is not in it

Everything above is in `deploy/`, in Terraform, with remote state in S3 and a
DynamoDB lock table. **The state is not local**, because a local state file makes
the infrastructure something only one machine can change and makes losing that
machine an incident.

What is deliberately **not** in Terraform: the secret *values*, which are set by
the owner in Secrets Manager and are referenced by ARN; and the DNS record's
final cutover, which is a one-line change the owner applies when they are ready
to switch and can revert in minutes.

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

    build -> push -> migrate -> new task set -> health check -> shift or roll back

**The migration runs before the new task serves and after the old one stops**,
which is the only ordering that avoids two versions writing to one schema. It is
also why every migration must be additive or the deploy must accept a moment of
downtime — the schema and the code are one deploy, not two. The migration runs as
a one-off ECS task using the same image, so it cannot drift from the code it
migrates for.

A failed health check leaves the previous task set serving. Rolling back the
image does not roll back the migration, which is what makes `DATA-R06`'s tested
down-migration load-bearing rather than ceremonial.

### The environment

Values from Secrets Manager, injected by the task definition, never baked into
the image (`SEC-R05`). The application refuses to start when a required one is
missing (`CRED-001`), which means a misconfigured deploy fails at deploy rather
than at the first request — an operator sees it instead of an investor.

### What is verified after every deploy

| Check | Why it is on the list |
|---|---|
| `/health` returns the expected version | The running artefact predates the tree it was built from more often than anyone expects |
| The page renders anonymously with no gated string in the body | `INV-002`'s guarantee, re-proved on the real deployment |
| A signed-in reader sees the gated chapters | The other half |
| The security headers survive the ALB and Cloudflare | An edge that strips or replaces a header is the usual way this baseline is lost |
| The locale switch works | The one thing a build step can break silently |
| RDS is not reachable from outside the VPC | Proved by trying, not by reading the security group |

### Staging

The `staging` branch exists and is the owner's to promote into. It deploys to a
second Fargate service and a second RDS instance in the same VPC, carrying
`APP_ENV=staging` — which is what raises `ADMIN-002`'s environment bar, the
guard against somebody editing production believing they are elsewhere.

Two environments roughly double the standing cost, and the alternative is a
deploy that has never been rehearsed anywhere.

## 4. Integration

**`SITE-005`** is what is being deployed. **`SEC-001`** supplies the headers the
ALB and Cloudflare must not strip. **`OPS-002`**'s log group and alarms are
created here. **`DATA-003`**'s S3 bucket and its lifecycle are created here.
**`CRED-001`** is how the values arrive.

## 5. Cross-cutting compliance

- **`SEC-R01`** — the gate is only real once this runs, and the post-deploy
  check is what proves it on the real deployment.
- **`SEC-R05`** — no secret in the image or in Terraform state; a missing
  required value stops the start.
- **`DATA-R02`** — CloudWatch holds application logs, which carry no personal
  data by construction (`OPS-002`), and the ALB access log is disabled rather
  than collected: it would record an address per request for no reader.

## 6. Open questions and trade-offs

- **AWS costs more than the alternatives at this size**, and that was the
  owner's decision at `INFRA-DEC-03`: one operational surface for the family is
  worth the floor. The design's job is to keep the floor as low as AWS allows,
  which is why there is one task, one small instance, and no Kubernetes.
- **One task, not two.** Named above. The signal to change it is somebody
  noticing the restart.
- **Migration before serve means a moment of downtime for a non-additive
  change.** The alternative — expand, deploy, contract — is three deploys and is
  correct for a system with users mid-transaction. This one has a handful of
  readers and no writes it cannot lose a second of, so the simpler ordering is
  right until it is not.
- **Cloudflare stays in front.** It already serves valotech.org and it is where
  the domain lives. Removing it during the cutover would change two things at
  once, and the whole point of the cutover is that one thing changes and it
  reverses in minutes.

## 7. Task list

- `OPS-001/T1` — Terraform under `deploy/`: VPC, ECS Fargate, ALB, RDS in private subnets, ECR, Route 53, ACM, with remote state and a lock table
- `OPS-001/T2` — The deploy sequence: migrate as a one-off task on the same image, then the new task set, health-checked before it takes traffic
- `OPS-001/T3` — A short DNS TTL set a day before the cutover, and `main` left deployable for a month after
- `OPS-001/T4` — Secrets from Secrets Manager by ARN; values set by the owner, never in Terraform state or the image
- `OPS-001/T5` — The six post-deploy checks, run against the real deployment through Cloudflare
- `OPS-001/T6` — A staging service carrying `APP_ENV=staging`, so the console says which one it is
- `OPS-001/T7` — RDS unreachable from outside the VPC, proved by attempting it rather than by reading the security group
