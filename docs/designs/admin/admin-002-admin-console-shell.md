---
code: ADMIN-002
title: Admin console shell
domain: admin
prd_refs: [ADMIN-002, SEC-R01, DATA-R05]
depends_on: [AUTH-002]
depended_by: [ADMIN-001, CFG-001, CMS-002]
layers_touched: [api, frontend, ui]
cross_cutting_rules: [SEC-R01, DATA-R05, I18N-R01, A11Y-R01, A11Y-R02, A11Y-R03]
status: design-ready
---

# `ADMIN-002` — Admin console shell

## 1. Purpose and PRD refs

The staff surface everything an admin does lives inside. Realizes `ADMIN-002`.

It is a shell and not a feature, and its whole job is to be the one place a
role check happens and the one place a destructive action looks different from
an ordinary one. Both of those are properties a set of independently-built admin
screens does not have.

## 2. Layer walkthrough

**Down.** One route segment, `/admin`, with a role check in the layout that
covers every page beneath it. A page under `/admin` cannot be reached without
passing it, which is a structural guarantee rather than a rule each page follows.

**Up.** A left rail, a content column, and a bar that says which environment
this is when it is not production.

## 3. Contracts

### The gate

The role check lives in the segment layout and returns `404` for a non-admin —
not `403`, so the existence of the console is not confirmed to an investor who
guesses the path. A signed-out request goes to sign-in with the destination
remembered.

**Every admin route inherits it.** A new admin page is protected by being under
the segment, and there is no way to add one that is not. That is the reason the
shell exists as a design rather than as a component: the failure it prevents is
the eleventh admin page shipping without the check the first ten have.

### Navigation

    /admin              what needs attention
    /admin/content      reports, updates, decks
    /admin/media        the library
    /admin/accounts     people and their access
    /admin/portfolio    the progress board
    /admin/config       runtime settings
    /admin/audit        the trail

The landing surface is **what needs attention**, not a dashboard of counts: items
with unreviewed locales, decks whose grants have never been opened, a portfolio
row that has not changed in a quarter, and the two open questions in the register
that block work. An admin console that opens on statistics is one that answers a
question nobody had.

### Destructive actions look different

One component for every irreversible action: a red control, a confirmation that
**names the thing** rather than saying "are you sure", and — for the three that
cannot be undone at all (delete an account, delete a media file, send mail) — a
typed confirmation of the subject's name.

The list of what counts as destructive is in one place, so a new one cannot be
added without appearing there. An ordinary control and a destructive one that
look alike is how somebody deletes an account meaning to suspend it.

### The environment bar

When `APP_ENV` is not production, a bar across the top says which environment
this is, in a colour that is not the accent. An admin console that looks
identical everywhere is one where somebody edits production believing they are on
staging — and the moment that happens, it happens to the live company page.

### Not translated

The console is English only, and that is a deliberate exception to `I18N-R01`
rather than an oversight: the rule governs visitor-facing strings, both admins
read English, and twenty locales of console chrome would be twenty locales to
keep current for two people. The exception is written here so it is a decision
rather than a gap somebody later "fixes".

The **content** an admin writes is a different matter entirely and is
translated (`CMS-005`).

## 4. Integration

**`AUTH-002`** resolves the role the layout checks. **`ADMIN-001`**, **`CMS-002`**,
**`CMS-003`**, **`CFG-001`**, **`INV-003`** and **`SEC-002`** are the pages
inside it. **`MAIL-001`** uses the typed confirmation.

## 5. Cross-cutting compliance

- **`SEC-R01`** — the check is at the server, in a layout every page inherits.
- **`DATA-R05`** — every page's reads take the reader, admin or not.
- **`I18N-R01`** — consciously excepted for console chrome, stated above.
- **`A11Y-R01`**, **`A11Y-R02`** — keyboard reach, named controls, focus into
  every confirmation.
- **`A11Y-R03`** — the destructive colour meets contrast, and never carries
  meaning alone.

## 6. Open questions and trade-offs

- **Inside the same application, not a separate one.** A separate admin app
  would keep staff code out of the public bundle. It would also mean two
  deployments, two sessions and two places for the access rule. One application
  with a guarded segment is the smaller surface at this size.
- **No activity feed on the landing surface.** The audit trail is a page, and
  duplicating its head onto the landing surface would make the trail feel read
  when it has not been. What needs attention is a list of things to do, not a
  list of things that happened.

## 7. Task list

- `ADMIN-002/T1` — A `/admin` segment layout whose role check every page inherits, answering `404` to a non-admin
- `ADMIN-002/T2` — The seven destinations, with the landing surface listing what needs attention
- `ADMIN-002/T3` — One destructive-action component, naming the subject, with a typed confirmation for the three that cannot be undone
- `ADMIN-002/T4` — An environment bar wherever `APP_ENV` is not production
- `ADMIN-002/T5` — Console chrome in English, with the exception stated where a reader will find it
