# VALO Tech — Roadmap

> **Not for `main`.** This document lives on `development` only (`.claude/CLAUDE.md` §1.1).
> Ordering only. What each task *is* lives in [docs/tasks.md](tasks.md); why the product wants it lives in [docs/PRD.md](PRD.md). Nothing is restated here.

---

## Where the work stands

The gateway is finished and live. The investor room does not exist. Everything below builds it, and none of it reaches a visitor until the owner promotes `development` — the static site keeps serving until then, and that is the fallback if any of this goes wrong.

**Three answers are wanted before they block anything.** None of them stops the waves below from starting, because each ships a fail-closed default: nothing is deployed, nothing is measured, nothing is mailed.

- [`INFRA-DEC-03`](decisions-log.md#INFRA-DEC-03) — where the application runs. Blocks the last wave only.
- [`MAIL-DEC-01`](decisions-log.md#MAIL-DEC-01) — what carries mail. Blocks four tasks, one of which sits inside the invitation flow.
- [`OPS-DEC-01`](decisions-log.md#OPS-DEC-01) — whether the site measures visitors. Blocks one compliance task.

---

## Order

**Review rows drain first.** Three are open. Two are acceptances filed so nobody rediscovers them as defects; one is a real question for the owner about what the published branch carries.

### W1 — The ground

Nothing else can be built or tested without a schema and a way to run it locally. This wave is finished when a developer can bring the stack up with one command and a migration can be applied and rolled back.

`INFRA-001` → `DATA-001` → `CRED-001`

The audit table lands in this wave rather than later (`DATA-001/T8`) because retrofitting an append-only guarantee onto rows already written is how the guarantee ends up being a convention.

### W2 — The door

The first thing that has to be true is that the room can be locked. Everything in W3 reads through the gate this wave builds, so a shortcut taken here is a shortcut in every feature after it.

`AUTH-001` → `AUTH-002` → `AUTH-004` → `AUTH-003`

Sign-out precedes invitation deliberately: a session that cannot be ended server-side is a defect that grows with every account created, and invitation is the one part of this wave that waits on `MAIL-DEC-01`.

`INV-002` closes immediately after `AUTH-002/T3`. It is the task that converts the gate from a demonstration into a control, and until it lands the site's own stylesheet is right to say that nothing may be put behind the CSS gate that would matter if read.

### W3 — The room

`INV-001` → `POST-001` → `POST-002` → `DECK-001` → `DECK-002` → `DECK-003` → `DECK-004` → `ADMIN-002` → `ADMIN-001`

Posts before decks, because a post is the simpler shape of the same problem — a body of content with an audience enforced at the query — and getting the audience rule wrong on a post costs less than getting it wrong on a fundraise. Deck versioning (`DECK-002`) is not optional and not deferrable: an investor who was shown one version must not be silently shown another, and a version added after the first deck is published cannot describe what was already read.

`ADMIN-001` closes the wave rather than opening it, because account management is only meaningful once there is something to grant access to, and because its erasure task (`ADMIN-001/T4`) has to delete from every table the wave created.

### W4 — The outside

`MAIL-001` → `MAIL-002` → `CFG-001`

Mail is the only feature here that leaves the system irrecoverably, so it is built last, behind everything that can be tested without sending anything to a real person.

### W5 — The move

`SEC-001` → `OPS-002` → `DATA-002` → `DATA-003` → `LEGAL-SG-001` → `LEGAL-GLOBAL-001` → `LEGAL-GLOBAL-002` → `OPS-001`

The security baseline, the logs, erasure, a restore that has actually been performed, and the compliance posture all precede the deploy, because each of them is a thing that is easy to promise before launch and expensive to add after. `OPS-001` — pointing valotech.org at the application — is the last task in the plan and the only one that ends the static site's tenure.

---

## What would change this order

A decision answered early moves its wave earlier. A defect found in the gateway takes precedence over all of it: the page is live, and a live defect is worth more than any planned feature.
