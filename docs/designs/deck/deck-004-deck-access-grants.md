---
code: DECK-004
title: Deck access grants
domain: deck
prd_refs: [DECK-004, CMS-R03, SEC-R04, DATA-R05]
depends_on: [ADMIN-001, CMS-006, DECK-002]
depended_by: []
layers_touched: [data, domain, service, api, frontend, ui]
cross_cutting_rules: [CMS-R03, SEC-R04, DATA-R05, DATA-R01, A11Y-R01, I18N-R01]
status: design-ready
---

# `DECK-004` — Deck access grants

## 1. Purpose and PRD refs

Which investor may read which deck, granted and revoked by an admin, audited.
Realizes `DECK-004`.

`CMS-006` built the mechanism — the `granted` audience and the `content_grants`
subquery. This design is the surface over it, and surfaces over access control
fail in a characteristic way: they make the current state hard to see, so nobody
notices that somebody who left the process eighteen months ago can still read
the fundraise deck.

## 2. Layer walkthrough

**Down.** Rows in `content_grants`, with the optional pinned version from
`DECK-002`. Grant and revoke are audited (`grant.add`, `grant.remove`).

**Up.** Two views of the same rows, because two different questions get asked.
*Who can read this deck?* — from the deck. *What can this person read?* — from
the account. Building only the first is the usual mistake, and it is the second
that gets asked when somebody leaves.

## 3. Contracts

### Granting

    POST   /admin/decks/<id>/grants     { accountId, pinnedVersion? }
    DELETE /admin/decks/<id>/grants/<accountId>

Granting names the investor, the deck, and whether the version is pinned. The
confirmation states what the person will be able to read, in words, including
which version — because "grant access to the deck" and "grant access to version
3 of the deck" are different sentences that look identical in a table.

Granting to an account in state `invited` is allowed: access begins when they
accept. Granting to a `suspended` account is refused, with the reason, since a
grant that silently does nothing is a grant an admin believes is working.

### Revoking

Immediate. The next read is a `404` (`CMS-006`). It does not delete the
`deck_reads` rows — what they read, and when, is a record of what happened and
is not undone by ending their access.

Revoking is not confirmed twice. It is the safe direction, and a confirmation on
the safe direction trains people to click through the one on the dangerous one.

### The two views

**From the deck.** Every account with a grant: name, whether pinned and to which
version, when granted and by whom, and when they last opened it. The last column
is what makes the list actionable rather than historical — an entry granted
fourteen months ago and never opened is either a person who lost the link or a
grant that should not exist.

**From the account.** Every deck this person may read, on the account screen
beside their other access. This is what an admin opens when somebody's
involvement ends, and it is the view that turns "revoke their access" from a
search into a list.

### Bulk

Granting one deck to several investors at once, from the deck view, with the
list of names shown before it commits. There is no bulk revoke: revocation is
per person and is meant to be, because a bulk revoke is one mis-click away from
emptying a room.

### What a grant does not do

It does not send mail. `MAIL-001` is separate and deliberate; an investor is told
they have been granted a deck by a person choosing to tell them. A grant that
mails automatically is a grant nobody dares to make while they are still setting
one up.

## 4. Integration

**`CMS-006`** owns the predicate the grant feeds. **`DECK-002`** owns the pin and
the version. **`ADMIN-001`** is where the per-account view lives and where an
account's deletion cascades these rows away. **`SEC-002`** records both actions.

## 5. Cross-cutting compliance

- **`CMS-R03`** — a grant is read by the predicate, never by a template.
- **`SEC-R04`** — grant and revoke are privileged writes, audited with actor,
  subject and version.
- **`DATA-R05`** — both views take the reader; an admin-only surface still
  passes the reader rather than assuming it.
- **`DATA-R01`** — a grant row holds two ids, a timestamp and a granter. No
  note field, no reason field, nothing that becomes a place to write about a
  person.
- **`A11Y-R01`**, **`I18N-R01`** — the lists are keyboard-operable and their
  labels come from the dictionary.

## 6. Open questions and trade-offs

- **No expiry.** Argued in `CMS-006` §6: an expiry nobody notices is an
  investor locked out mid-conversation. The mitigation is the last-opened
  column, which makes a stale grant visible to an admin who looks. Whether
  anybody looks is the weakness, and the honest answer is that a periodic
  review is an operator habit rather than a feature.
- **No group or tag.** Granting to "the Series A investors" would be
  convenient and would introduce a second thing to keep current — a group whose
  membership drifts from reality is a grant list that is wrong for everyone in
  it at once. Bulk grant covers the convenience without the drift.

## 7. Task list

- `DECK-004/T1` — Grant and revoke, audited, with the pinned version optional
- `DECK-004/T2` — The confirmation states in words what the person will be able to read, including the version
- `DECK-004/T3` — A grant to a suspended account is refused with the reason; to an invited one it is allowed
- `DECK-004/T4` — The from-the-deck view, showing pin, granter, date and when last opened
- `DECK-004/T5` — The from-the-account view, listing every deck a person may read
- `DECK-004/T6` — Bulk grant with the names shown before it commits, and no bulk revoke
