---
code: CFG-001
title: Runtime configuration
domain: cfg
prd_refs: [CFG-001, SEC-R04]
depends_on: [ADMIN-002, SEC-002]
depended_by: []
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [SEC-R04, SEC-R05, DATA-R02, A11Y-R01, I18N-R01]
status: design-ready
---

# `CFG-001` — Runtime configuration

## 1. Purpose and PRD refs

The handful of values an admin may change without a deploy, each with its prior
value and a single-action undo. Realizes `CFG-001`.

The R-axis question — *if this breaks tomorrow, can a known-good state be
restored in fifteen minutes?* — has an easy answer for code, which is a revert,
and no answer at all for a setting somebody changed in a form. There is no commit
to revert and no image to roll back. So every value here carries its own undo, or
it does not belong here.

## 2. Layer walkthrough

**Down.** A `config` table: key, value, previous value, who, when. The previous
value is a **column and not a history table**, because the undo has to be one
action and an operator reaching for it at a bad moment is not in a position to
reconstruct one from a log.

**Up.** A short list of settings, each with its current value, what it does, when
it last changed, and a revert control beside it that names what it would go back
to.

## 3. Contracts

### What is configurable

Deliberately short. A value earns a place here only when it would otherwise need
a deploy to change *and* somebody would plausibly want to change it in a hurry.

| Key | What | Default |
|---|---|---|
| `room.banner` | A line at the top of the investor room, or empty | empty |
| `room.signin_message` | A line on the sign-in page — planned maintenance, say | empty |
| `mail.enabled` | A kill switch for sending, independent of the credential | true |
| `session.max_age_days` | How long a session lives | 30 |
| `signin.rate_per_hour` | Attempts per account per hour | 10 |

**Everything else is code or environment.** A setting is a value with no test
pinning it and no review before it changes, so the list being short is the design
rather than an accident of what has been built.

`mail.enabled` is the one that justifies the feature: when something is going
wrong with sending, the person who needs to stop it is not in a position to
deploy.

### Changing

    PUT /admin/config/<key>   { value }

Validated against the key's own type and bounds — `session.max_age_days` is an
integer between 1 and 90, and a value outside that is refused with the range
rather than accepted and clamped. Silent clamping is how a setting comes to
disagree with what the screen says.

In one transaction: write `previous_value` from the current one, write the new
value, audit `config.change` with both (`SEC-R04`).

### Reverting

    POST /admin/config/<key>/revert

One action, no confirmation, restoring `previous_value`. It is the safe
direction, and a confirmation on the safe direction trains people through the one
on the dangerous direction.

Reverting is itself a change: it swaps current and previous, so reverting twice
returns to where you started and the audit trail shows both moves. There is no
undo stack — one step back is what an operator needs at three in the morning, and
a stack is a thing to reason about at exactly the wrong time.

### Reading

The application reads config through one accessor with a cached value and a short
refresh, so a change takes effect within seconds without a restart. A key that is
absent returns its declared default, and the defaults live in code beside the key
declarations rather than as rows — a database with no rows must produce a working
application.

**No secret is ever a config value.** Credentials come from the environment
(`CRED-001`, `SEC-R05`); this table is readable by anyone who can read the
database, and putting a key in it would be putting a secret in it.

## 4. Integration

**`ADMIN-002`** is the console page. **`SEC-002`** records every change and is
the history this table does not keep. **`MAIL-001`** honours `mail.enabled`.
**`AUTH-002`** reads the session lifetime; **`SEC-001`** reads the rate limit.

## 5. Cross-cutting compliance

- **`SEC-R04`** — every change audited with before and after, in the same
  transaction.
- **`SEC-R05`** — no secret here, and the accessor refuses a key declared as
  secret-shaped.
- **`DATA-R02`** — no personal data is configurable, so none can end up here.
- **`A11Y-R01`**, **`I18N-R01`** — the form is a form, and the room-facing
  values it sets (`room.banner`) are shown to investors and therefore go through
  the dictionary or are shown in the language they were written in, stated on the
  field.

## 6. Open questions and trade-offs

- **One step of undo, not a history.** Argued above. The audit trail is the
  history; this column is the lever.
- **A cached read with a short refresh.** It means a change is not instant and a
  reader may see the old value for a few seconds. The alternative is a database
  read on every request for a value that changes monthly.
- **`room.banner` is untranslated free text.** It is the only visitor-facing
  string in the product that does not come from the dictionary, and the field
  says so. The honest alternative — twenty locale fields on a banner used twice a
  year — is a form nobody would fill in, so the banner would not get used.

## 7. Task list

- `CFG-001/T1` — The table with a previous-value column, and defaults declared in code beside the keys
- `CFG-001/T2` — Change validates against the key's type and bounds, refusing rather than clamping
- `CFG-001/T3` — Change and revert are one transaction each, audited with both values
- `CFG-001/T4` — Revert is one action with no confirmation, and is itself recorded
- `CFG-001/T5` — One cached accessor with a short refresh; an empty table yields a working application
- `CFG-001/T6` — The accessor refuses a secret-shaped key
