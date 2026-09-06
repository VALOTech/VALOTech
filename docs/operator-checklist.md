# VALO Tech — operator checklist

> **Not for `main`.** This document lives on `development` only (`.claude/CLAUDE.md` §1.1).

What waits on a human. A design that cannot proceed without an action outside
this repository carries `external_blocker.ref` pointing at an anchor here, and
`scripts/validate-designs.py` refuses a design whose ref resolves to nothing.

Each item says what to do, who can do it, and the signal that it is done. An
item leaves this file when its signal is true — not when it feels handled.

---

## Open

<a id="AWS-ACCOUNT"></a>
### Provision the AWS account and the first environment

- **What:** [`INFRA-DEC-03`](decisions-log.md#INFRA-DEC-03) chose AWS and [`INFRA-DEC-05`](decisions-log.md#INFRA-DEC-05) chose the shape: ECS Fargate, RDS PostgreSQL, an ALB, Route 53 and ACM, described in Terraform under `deploy/` (`OPS-001/T1`). What waits on a person is the account itself — an AWS account or a sub-account for this repository, a role Terraform can assume, the S3 bucket and DynamoDB table that hold its state, and the ACM certificate for the hostname.
- **Who:** the owner. It costs money and it creates the identity everything else runs as.
- **Done when:** `terraform plan` runs clean from a fresh clone against real credentials.
- **Until then:** nothing is deployed. The gateway is served by GitHub Pages from `main`, unchanged, and that remains the fallback for a month after the cutover.

<a id="SMTP-MAILBOX"></a>
### Set the SMTP credential and verify the sending domain

- **What:** [`MAIL-DEC-01`](decisions-log.md#MAIL-DEC-01) chose SMTP against the company's own mailbox. Set `SMTP_URL` and `MAIL_FROM`, and publish SPF, DKIM and DMARC for `valotech.org` so a message from the application is not treated as forged.
- **Who:** the owner. It is the company's own mail domain.
- **Done when:** a message sent from staging arrives in an institutional inbox rather than its spam folder, and a message to a deliberately-invalid address produces a delivery-status notification in the `MAIL_FROM` mailbox.
- **Until then:** no mail is sent. An invitation is still created and its link is shown to the admin to deliver by hand (`AUTH-003/T7`), so nothing is blocked — only automated.
- **Note:** SMTP reports nothing after hand-off, so the bounce in the second signal above is read by a person. `MAIL-002` says so in those words rather than implying the system noticed.

<a id="DPO-CONTACT"></a>
### Name a data-protection officer and publish the contact

- **What:** Singapore's PDPA requires a named individual and a means of reaching them. `LEGAL-SG-001/T4` cannot close without it.
- **Who:** the owner.
- **Done when:** the name and address are recorded here and published in the privacy notice.
- **Until then:** no investor account exists, so no personal data is held.

<a id="TERMS-REVIEW"></a>
### Have counsel read the terms page before it publishes

- **What:** `SITE-006` builds `legal/terms`, and this repository is the least qualified thing in the company to write it. What ships without review is a plain statement of who operates the site, what the investor room is, and what a reader may not do with what they read there.
- **Who:** the owner, with counsel.
- **Done when:** the page's English source has been read by somebody qualified, and the nineteen translations follow it.
- **Until then:** the page is not published. `legal/privacy` and `legal/cookies` do not wait on this — they describe what the system does, which this repository does know.

<a id="NATIVE-LOCALE-READERS"></a>
### Find a reader for each of eleven locales

- **What:** `I18N-001/T4`. Eleven locales — `es`, `pt`, `ru`, `tr`, `id`, `ms`, `tl`, `th`, `ar`, `ja`, `zt` — pass every mechanical class and have not been read as prose by somebody who speaks them. No check written here can see a sentence that is correct and lifeless.
- **Who:** the owner, one reader per locale. The eleven are independent, so this closes locale by locale rather than all at once.
- **Done when:** each locale has been read end to end by a speaker and its corrections applied.
- **Until then:** the locales are served. They are correct as far as anything mechanical can tell, and that is the whole of the claim being made.

<a id="ECOSYSTEM-PORT-SYNC"></a>
### Carry this repository's port row into the sibling copies of the ecosystem map

- **What:** `docs/ECOSYSTEM.md` says every VALO repository holds an identical copy, and this repository has claimed **Postgres 5434**, **web 3100** and **static gateway 3101**. The six sibling copies do not yet carry that row.
- **Who:** whoever owns a sweep across the repositories. This lane does not edit siblings.
- **Done when:** the ports table in all seven copies names VALO Tech with all three.
- **Until then:** a sibling reading its own copy sees 5434 as unallocated and could claim it.

---

## Done

<a id="DONE-HOSTING-DECISION"></a>
### Where the application runs — answered 2026-09-07

AWS, in the shape at [`INFRA-DEC-05`](decisions-log.md#INFRA-DEC-05). The item that remains is the account, above.

<a id="DONE-MAIL-DECISION"></a>
### What carries mail — answered 2026-09-07

SMTP against the company's own mailbox, [`MAIL-DEC-01`](decisions-log.md#MAIL-DEC-01). The item that remains is the credential and the domain records, above.

<a id="DONE-ANALYTICS-DECISION"></a>
### Whether the site measures visitors — answered 2026-09-07

The ecosystem's own posture, [`OPS-DEC-01`](decisions-log.md#OPS-DEC-01): three legal pages and a three-category consent banner with the non-essential categories off. It needs no operator action — `SITE-006` builds it — and it is recorded here because the question was asked here.

_An item moves to this section with the date and the signal that closed it, and is never deleted — the next person to ask "was this ever done?" is answered by the file rather than by memory._
