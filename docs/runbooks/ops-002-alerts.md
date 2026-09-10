# Runbook — `OPS-002` the three alerts

> Three alerts, and no more: a fourth would have to justify itself against the
> one thing that destroys alerting, which is an alert nobody acts on. Each is a
> condition and the action an operator takes when it fires. The operator is the
> owner, alone, and usually not looking — which is why the list is short and why
> each row ends in something to *do*, not something to note.

## What this is, and what does not work yet

The conditions below are the design's (`OPS-002` §3). One of them — a scrubber
hit — **fires today**, as an `error` line the logger writes the moment it masks
something (`OPS-002/T4`). The other two are conditions a watcher evaluates, and
this repository runs no metrics backend yet: until `OPS-001` adds one, *nothing
polls the health endpoint and nothing counts error lines*, so those two alerts
are visible only by reading the log. And delivery is not wired either: an alert
reaching the owner by mail waits on the send path itself (`MAIL-001`, a later
wave), the service it would use having already been chosen (`MAIL-DEC-01`).

This is stated rather than hidden, because the gap is real: an owner who is not
watching the log will not know. What this runbook gives now is the definition and
the action for each; what `OPS-001` adds later is the watching and the delivery,
and it has this table to wire them from.

## The site is down

**Condition.** The health endpoint (`GET /health`, `OPS-002/T5`) fails twice,
sixty seconds apart — a single failure is a blip, two is an outage.

**How it is seen.** Until `OPS-001`'s monitor polls `/health`, by a person
finding the room unreachable. The endpoint runs a real query, so a `503` from it
is the database unreachable and not merely a slow page.

**What to do.** The static gateway on `main` is the fallback and is one revert
away (`SITE-005/T6`, the R-axis): the app's failure does not take the company's
front page down with it. Bring the room back by the deploy's rollback
(`OPS-001`), then read the error lines for the request that first failed.

## Errors are up

**Condition.** More than ten `error` lines in five minutes.

**How it is seen.** Until the monitor counts them, by grepping the log for
`"level":"error"`. An ordinary day has none — `error` is for something that
failed and a person saw it, not for a handled degradation, which is `warn`.

**What to do.** Read them. Every line a request produced carries that request's
id (`request_id`, `OPS-002/T2`), so the scattered lines of one failure are one
story: filter the log to the `request_id` on the first `error` line and the
sequence that led to it is there.

## Something logged personal data

**Condition.** Any scrubber hit — a `log.scrubbed` line, which the logger raises
at `error` level the instant it masks an address or a token on the way out
(`OPS-002/T4`). This is the one alert that fires today.

**What to do.** The scrubber is a backstop, not the fix. The `log.scrubbed` line
names the `source_event` that leaked and the `masked_fields`, and never the value
— so find the emitter of that event and stop it passing personal data to the
logger (`DATA-R02`). The fix is the caller; the scrubber having caught it is the
alarm, not the remedy.
