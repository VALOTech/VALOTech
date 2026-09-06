---
code: CRED-001
title: Credential handling
domain: cred
prd_refs: [CRED-001, SEC-R05, DATA-R02]
depends_on: [INFRA-001]
depended_by: [MAIL-001, OPS-001]
layers_touched: [infra, service]
cross_cutting_rules: [SEC-R05, DATA-R02]
status: design-ready
---

# `CRED-001` — Credential handling

## 1. Purpose and PRD refs

How a password, a key or a connection string reaches the application, and what
happens when one is missing. Realizes `CRED-001` and carries `SEC-R05`.

The sibling products run a `CredentialService` with envelope encryption, because
they hold third-party credentials on behalf of thousands of merchants. This
product holds **its own** credentials, of which there are four, and it holds
them for one company. Building an encrypted credential store here would be a
key-management problem invented to solve a storage problem that does not exist —
so credentials come from the environment, and the design work is in what happens
around that.

## 2. Layer walkthrough

**Down.** A single module reads `process.env` once at startup, validates the
whole set, and exports a frozen typed object. Nothing else in the application
reads `process.env` — that is the rule this design exists to make enforceable,
because a scattered read is how a variable comes to be required in production
and unnamed in `env.example`.

**Up.** A feature asks the config object for what it needs. A feature whose
credential is absent is *told so at startup*, disables itself, and says which
variable would enable it. It does not fail on first use, in front of a person.

## 3. Contracts

### The four credentials

| Variable | Feature | Required | Absent |
|---|---|---|---|
| `DATABASE_URL` | everything | yes | The application refuses to start, loudly, naming the variable |
| `SESSION_SECRET` | `AUTH-002` | yes | The application refuses to start |
| `SMTP_URL` (or the provider key at `MAIL-DEC-01`) | `MAIL-001`, `AUTH-003` | no | Mail is disabled. An admin sees a disabled send control with the reason on it, and an invitation is created with its link shown on screen to be delivered by hand |
| `BACKUP_TARGET` | `DATA-003` | no | Backups are not taken, and `make doctor` says so rather than the system pretending they are |

### Startup validation

One function, run before the server listens:

1. Read every declared variable.
2. Fail closed on a **required** one that is absent or unparseable, with a
   message naming the variable and what it is for. Never a default — a default
   for a database URL is how a development database is written to from a
   production process.
3. Record which **optional** ones are absent, and expose that set to the
   features that own them.
4. Freeze the object.

The order matters. Validating everything before listening means a misconfigured
deployment fails at deploy rather than at the first request, which is the
difference between an operator seeing it and an investor seeing it.

### Degradation is declared, not discovered

A feature with an absent credential exposes `unavailable: <reason>` rather than
throwing. `MAIL-001`'s send control is disabled with the reason visible to the
admin; `AUTH-003` still creates the invitation and shows the link. **The
distinction being drawn is between a feature that cannot run and a system that
cannot run**, and only the second is allowed to stop anything.

### What is never done

- A credential is never logged, never included in an error message, and never
  returned by any route (`DATA-R02`). The config object's `toString` and
  `toJSON` are overridden to say so, because the way a secret reaches a log is
  almost always an object being serialised whole by something generic.
- A credential is never written to the database. There is nothing to encrypt
  because there is nothing stored.
- A missing credential is never substituted with a placeholder that "works".

### `PENDING-CREDENTIAL`

Code that needs a credential the owner has not supplied carries the marker the
comment gate accepts, with all four fields:

    // PENDING-CREDENTIAL: <name>. Owner sets <ENV_VAR>. Tracked at CRED-001/T4.

`credentials/README.md` is where the owner reads what to set and where to get
it, and `credentials/credential-input.html` is the local form that writes a
`.env` without the value passing through a chat window.

## 4. Integration

**`INFRA-001`** declares the variables in `env.example`; this design is what
reads and validates them. **`MAIL-001`** and **`AUTH-003`** are the two features
that degrade. **`OPS-001`** supplies the values in whatever environment the
owner chooses at `INFRA-DEC-03`.

## 5. Cross-cutting compliance

- **`SEC-R05`** — no secret in the repository; a missing credential degrades
  its feature and leaves the system up. Both halves are load-bearing and this
  design implements both.
- **`DATA-R02`** — a credential never reaches a log or an error message.

## 6. Open questions and trade-offs

- **Environment variables rather than a secret manager.** A secret manager
  removes the plaintext-on-disk exposure and adds a dependency the application
  cannot start without, plus a credential to reach the credential store. At
  four secrets and one operator that trade is not worth taking. It becomes
  worth taking when there is more than one environment with more than one
  operator, and that is when to file it.
- **The startup failure is total.** A missing `DATABASE_URL` stops the whole
  application rather than degrading it. That is deliberate: a running site
  with no database serves pages that look correct and are empty, and an empty
  investor room is indistinguishable from one where the investor has been
  removed.

## 7. Task list

- `CRED-001/T1` — One module reads the environment once, validates it, and exports a frozen object
- `CRED-001/T2` — A required variable that is absent stops the application before it listens, naming the variable
- `CRED-001/T3` — An absent optional credential disables its feature with a stated reason, and the system stays up
- `CRED-001/T4` — A credential never reaches a log, an error message or a response, including through generic serialisation
- `CRED-001/T5` — `credentials/README.md` says what the owner sets, and the local input form writes `.env` without the value crossing a chat
