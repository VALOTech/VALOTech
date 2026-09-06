---
code: DATA-001
title: Schema and migrations
domain: data
prd_refs: [DATA-001, DATA-R01, DATA-R03, DATA-R05, SEC-R04]
depends_on: []
depended_by: [AUTH-001, AUTH-002]
layers_touched: [infra, data]
cross_cutting_rules: [DATA-R01, DATA-R03, DATA-R05, SEC-R04]
status: design-ready
---

# `DATA-001` — Schema and migrations

## 1. Purpose and PRD refs

Everything the investor room stores, and the one way it changes shape. Nine
tables hold accounts, sessions, decks and their versions, who may read which,
posts, mail, configuration and an append-only audit trail. Realizes `DATA-001`
and is the ground `AUTH-001` and `AUTH-002` stand on; every other feature reads
through them.

The whole of it is small — a few thousand rows at the outside — so nothing here
is designed for scale. It is designed for two other things: that a deletion is a
real deletion (`DATA-R03`), and that a privileged write cannot happen without
leaving a record (`SEC-R04`).

## 2. Layer walkthrough

**Down.** A migration file is applied by one command; the schema it produces is
what every repository function queries. No ORM generates the schema: the
migration is the source of truth and the types are written against it, because a
schema inferred from code is a schema nobody can review in one place.

**Up.** A row reaches the reader only through a repository function that takes
the reader's role as an argument. There is no query helper that can be called
without one — the role is a parameter, not a filter added later, so forgetting it
is a compile error rather than a leak (`DATA-R05`).

## 3. Contracts

### Tables

**`accounts`** — one row per person who can sign in.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | generated in the database |
| `email` | `citext` unique not null | the identifier; `citext` because an address is case-insensitive and two rows differing only in case are the same person |
| `name` | `text` not null | shown to admins; the minimum `DATA-R01` allows |
| `role` | `text` not null | `investor` or `admin`, checked by a constraint rather than trusted |
| `password_hash` | `text` | null until an invitation is accepted |
| `state` | `text` not null | `invited`, `active`, `suspended` |
| `created_at`, `updated_at` | `timestamptz` not null | UTC, always |

**`sessions`** — server-side, so a sign-out ends a session rather than asking the
browser to forget it.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | the value in the cookie is a hash of this, never this |
| `account_id` | `uuid` FK → accounts | `on delete cascade`: erasing a person ends their sessions |
| `created_at`, `last_seen_at`, `expires_at` | `timestamptz` | |

**`invitations`** — a single-use token with an expiry, consumed atomically.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `account_id` | `uuid` FK → accounts | |
| `token_hash` | `text` unique not null | the token itself is never stored |
| `expires_at` | `timestamptz` not null | |
| `consumed_at` | `timestamptz` | null until used; the `update … where consumed_at is null` is what makes it single-use under concurrency |

**`decks`** and **`deck_versions`** — a deck is a name; a version is the content.

| `decks` | | |
|---|---|---|
| `id` | `uuid` PK | |
| `title` | `text` not null | |
| `current_version_id` | `uuid` FK → deck_versions | null while only drafts exist |

| `deck_versions` | | |
|---|---|---|
| `id` | `uuid` PK | |
| `deck_id` | `uuid` FK → decks | |
| `body` | `jsonb` not null | ordered sections |
| `published_at` | `timestamptz` | null means draft, and a draft reaches no investor |

A version is **never updated after publication**. Editing a published deck
creates a new version, because an investor who was shown one thing must not
silently be shown another and what they were shown must stay recoverable.

**`deck_grants`** — which account may read which deck.

| Column | Type | Notes |
|---|---|---|
| `account_id`, `deck_id` | `uuid` | composite PK |
| `granted_at`, `granted_by` | `timestamptz`, `uuid` | |

**`posts`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `slug` | `text` unique not null | |
| `body` | `text` not null | |
| `audience` | `text` not null | `public`, `investor`, `draft` — a constraint, and the value the query filters on |
| `published_at` | `timestamptz` | |

**`mail_log`** — what left, to whom, when. Written before the send is attempted
and updated with the outcome, so a crash between the two leaves a record of an
attempt rather than no record at all.

**`config`** — key, value, previous value, who changed it, when. The previous
value is a column rather than a history table because the undo has to be one
action, and an operator reaching for it is not in a position to reconstruct one.

**`audit`** — `actor_id`, `action`, `subject`, `before` `jsonb`, `after` `jsonb`,
`at`. Append-only, and enforced: a `BEFORE UPDATE OR DELETE` trigger raises, so
the guarantee lives in the database rather than in the discipline of whoever
writes the next repository function.

### Migrations

Numbered, forward-only, each with a down-migration. Applied by one command, and
that command prints `host:port/database as user` before it connects — a port that
is wrong announces itself instead of arriving disguised as an authentication
error.

### Environment

`DATABASE_URL`, `DB_SSLMODE`. Both in `env.example`, both required.

## 4. Integration

`AUTH-001` reads `accounts` and writes `password_hash`. `AUTH-002` reads and
writes `sessions`. Everything in the investor room reads `deck_grants` or
`posts.audience` through a role-taking repository function. `ADMIN-001`'s erasure
deletes an `accounts` row and relies on the cascades above; the `audit` rows it
leaves name the account by id and hold no personal data, which is what `DATA-R03`
means by retaining the trail minimally.

## 5. Cross-cutting compliance

- **`DATA-R01`** — the schema holds a name, an address, a role and a state. There
  is no column for anything else, so there is nothing to collect by accident.
- **`DATA-R03`** — erasure is `delete from accounts`, and every dependent row goes
  with it by cascade. The audit trail keeps ids, actions and timestamps.
- **`DATA-R05`** — no repository function exists that does not take the reader's
  role.
- **`SEC-R04`** — the trigger, not the convention.

## 6. Open questions and trade-offs

- **Row-level security instead of role-taking functions?** RLS would move the
  guarantee into the database, which is where `SEC-R04` put the audit guarantee.
  It is not chosen here because this application has one database user and no
  multi-tenant boundary; the cost of the policy machinery would buy a guarantee
  the function signature already gives. Reopen if a second application ever
  reaches this database.
- **`jsonb` for a deck's body.** A relational sections table would let a query
  reach inside a deck; nothing needs to. The trade is that a malformed body is a
  runtime error rather than a constraint violation, so the write path validates
  it before it stores it.

## 7. Task list

- `DATA-001/T1` — Choose and wire the migration tool; one command applies and one rolls back
- `DATA-001/T2` — Accounts table: identity, role, state, created and updated
- `DATA-001/T3` — Sessions table, or the session store the auth library needs
- `DATA-001/T4` — Decks, deck sections and deck versions
- `DATA-001/T5` — Deck grants: which account may read which deck
- `DATA-001/T6` — Posts, with an audience column
- `DATA-001/T7` — Mail log and unsubscribe state
- `DATA-001/T8` — Audit table, append-only, with a database-level guard against update and delete
- `DATA-001/T9` — Configuration table with a recorded prior value
- `DATA-001/T10` — Every migration has a down-migration that has been run
