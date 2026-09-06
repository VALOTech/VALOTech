---
code: OPS-002
title: Logging and monitoring
domain: ops
prd_refs: [OPS-002, DATA-R02, SEC-R04]
depends_on: [CRED-001, SEC-001]
depended_by: [OPS-001]
layers_touched: [infra, service, api]
cross_cutting_rules: [DATA-R02, SEC-R04, SEC-R05]
status: design-ready
---

# `OPS-002` — Logging and monitoring

## 1. Purpose and PRD refs

Structured logs with a request id, no personal data in them, and an alert an
operator can act on. Realizes `OPS-002`.

The operator is the owner, alone, and usually not looking. That fact decides
everything below: an alert that fires often is an alert that gets muted, and a
log that has to be grepped by somebody who knows what to grep for is a log nobody
reads.

## 2. Layer walkthrough

**Down.** One logger. JSON lines to stdout, because the process is in a container
somewhere and stdout is the one output that works whatever the somewhere turns
out to be (`INFRA-DEC-03`).

**Up.** Three alerts, each with an action written beside it.

## 3. Contracts

### The line

    { ts, level, event, request_id, msg, ...fields }

`ts` in UTC, always. `event` from a closed vocabulary so lines can be counted
rather than matched by prose. `request_id` generated at the edge of every request
and carried through every line that request produces — it is what turns a
scattered failure into one story, and it is the field most often added after the
incident that needed it.

**No `console.log` anywhere.** One logger, checked, because a stray print is a
line without a request id and possibly with an address in it.

### What never appears

An address, a name, a token, a password, a session id, or a URL containing any of
them (`DATA-R02`). The logger takes fields explicitly rather than serialising
objects, which is the structural half of that guarantee — the way personal data
reaches a log is almost always a whole object handed to something generic.

A scrubber runs as the second half, on the way out, matching address and token
shapes. **A scrubber hit is itself an alert**, because it means code somewhere is
trying to log something it should not, and the fix is that code and not the
scrubber.

### Levels

| Level | For | Alerts |
|---|---|---|
| `error` | Something failed that should not; a person saw it | yes |
| `warn` | Something failed and was handled; degraded | no, but counted |
| `info` | A privileged action, a sign-in, a publish | no |
| `debug` | Off in production | no |

`info` is deliberately narrow. A log line per request is a log nobody reads; a
line per thing-that-happened is one somebody can.

### The three alerts

| Alert | Condition | What the operator does |
|---|---|---|
| The site is down | The health endpoint fails twice, 60s apart | Open the runbook; the fallback is `main` on Pages |
| Errors are up | More than 10 `error` lines in 5 minutes | Read them; they carry the request id |
| Something logged personal data | Any scrubber hit | Find the line's `event`, fix the caller |

Three, and each has an action. A fourth would need to justify itself against the
one thing that destroys alerting, which is an alert nobody acts on.

### The health endpoint

    GET /health   -> { ok, version, db }

`db` is a real query, not a connection-pool status: a pool that holds a
connection to a database that has stopped answering reports healthy, which is the
failure mode this endpoint exists to catch. It carries the build's version so a
report about behaviour can be tied to what was running (§10.8.1 rule 4 in the
sibling repositories, and the same trap here).

It exposes nothing else. No row counts, no configuration, no environment.

## 4. Integration

**`SEC-001`** owns the request id at the edge. **`CRED-001`** is what must never
appear in a line. **`OPS-001`** decides where the lines go and where the alerts
are delivered — this design is written so that answer is a configuration.
**`SEC-002`** is a different thing entirely: the audit trail is a record for
people, the log is a record for debugging, and neither is a substitute for the
other.

## 5. Cross-cutting compliance

- **`DATA-R02`** — explicit fields, plus a scrubber whose every hit is an alert.
- **`SEC-R04`** — the audit trail is separate and is not the log.
- **`SEC-R05`** — a credential never reaches a line, including through an error
  message.

## 6. Open questions and trade-offs

- **Where the lines go is unanswered.** `INFRA-DEC-03`. JSON to stdout works
  with every option, which is why it is chosen before the decision.
- **No tracing and no metrics backend.** One application, one database, and a
  request id that ties a request's lines together answers what a trace would, at
  this size. A metrics stack is a second system to run and to alert on.
- **Alerts delivered by mail depend on `MAIL-DEC-01`.** Until then they are
  visible in the log and nowhere else, which is a real gap and is stated rather
  than papered over: an operator who is not looking will not know.

## 7. Task list

- `OPS-002/T1` — One JSON logger to stdout, with a closed event vocabulary and no `console.log` anywhere
- `OPS-002/T2` — A request id generated at the edge and carried through every line of that request
- `OPS-002/T3` — Explicit fields, never serialised objects, plus a scrubber on the way out
- `OPS-002/T4` — A scrubber hit raises an alert naming the event, so the caller is fixed rather than the scrubber
- `OPS-002/T5` — `/health` runs a real query and reports the build version, and nothing else
- `OPS-002/T6` — Three alerts, each with its action written beside it
