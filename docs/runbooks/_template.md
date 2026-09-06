# Runbook — `DOMAIN-000` <feature>

> Written to be **true**, not plausible. Every command here has been run against
> a real environment and its real output recorded. A runbook is read by whoever
> is deciding whether to roll back inside fifteen minutes, and a command that
> has never been executed is worse than no runbook: it costs them the minutes
> they had.

## What this feature is

One paragraph, and the one thing that goes wrong most often.

## How to tell it is broken

The signal an operator actually sees — an alert, a log line, a status code, a
reader's report — and what it looks like when the feature is healthy, so the two
can be told apart.

## Immediate mitigation

The smallest action that stops the harm, before anyone understands the cause.
Name the flag, the command, or the person.

## Diagnosis

In order, cheapest first. Each step says what output means what.

## Rollback

The exact steps, and how long they take. If a migration is involved, say
whether the down-migration has been run against data that resembles production,
and when.

## What this feature depends on

If it is down because something else is, say which and link that runbook.

## Verified

The date this runbook was last executed end to end, and by whom. A runbook not
verified in six months is a hypothesis.
