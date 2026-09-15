---
code: AUTH-005
title: Registration for people considering an investment
domain: auth
prd_refs: [AUTH-005, SEC-R03, DATA-R01, CMS-R03]
depends_on: [AUTH-001, AUTH-003, CMS-006, MAIL-001]
depended_by: [INV-001]
layers_touched: [infra, data, domain, service, api, frontend, ui]
cross_cutting_rules: [SEC-R03, DATA-R01, DATA-R05, CMS-R03, I18N-R01, A11Y-R01, A11Y-R02]
status: in-progress
---

# `AUTH-005` — Registration for people considering an investment

## 1. Purpose and PRD refs

A second door into the hall, for somebody who has read the gateway and wants to
follow the company before anybody has invited them. Realizes `AUTH-005`.

`AUTH-003` is the first door and stays exactly as it is: an admin names a person
and sends them a link. This one is opened from the outside, by the person
themselves, and it admits them to less.

## 2. Layer walkthrough

**Down.** No new table, no new column, no new account state. A registration
creates the `accounts` row an invitation creates — same table, `state: invited`
until the address is confirmed, same single-use token — differing in the two
columns that record who this person is: `role: prospect`, which bounds what they
may read ([`AUTH-DEC-06`](../../decisions-log.md#AUTH-DEC-06)), and
`investor_type: prospect`, which says they have not invested and orders the
landing without gating it. The role is a third value in a column that already
existed, which is why there is still no new table and no new column.

**Up.** A form on the gateway, a message carrying a single-use link, and the
set-password view `AUTH-003/T4` already serves. Past that the reader is in the
hall, holding no grants.

## 3. Contracts

### The surfaces

    POST /api/auth/register     the form's target
    GET  /invite/<token>        already exists; the link lands here

    AUTH_REGISTRATION_OPEN      false unless a deployment says otherwise

There is no page of its own for the form: it belongs on the gateway, where the
person already is, and `SITE-006`'s footer and the notice are reachable from
there before they type anything.

**The gateway cannot carry it yet, and that is a dependency rather than a
detail.** `index.html` is served to valotech.org by GitHub Pages from `main`,
which is a static host with no origin behind it: a form there can post to
nothing, and pointing it at the application instead would be a cross-site post
that `handleRegister` refuses before it reads the body, exactly as sign-in and
the reset form refuse one. The page's only form today unlocks a stylesheet class
and its own design says so (`SEC-R01`). So the form lands when `SITE-005/T1`
serves the page from the application, and `AUTH-005/T3` waits on that task and
on nothing else.

**The route ships behind `AUTH_REGISTRATION_OPEN`, false by default**, and
answers `503 registration_closed` while it is. Two conditions close it: the
deployment has not opened registration, and no message can be sent at all — the
second because a registration whose link never leaves writes a name and an
address for an account nobody can reach, which is personal data collected for a
purpose that did not happen (`DATA-R01`). Both are properties of the deployment
rather than of the address in the box, so the same answer reaches everybody, and
closing the flag again is the whole rollback.

### What the form asks for

A name and an e-mail address, and nothing else (`DATA-R01`). No password: the
password is set through the link, which is what makes the address confirmed —
asking for one on the form would collect a credential from somebody whose
address has not been shown to be theirs.

### The answer says nothing about the address

One answer for an address that already holds an account and one that does not,
the way `AUTH-003/T5` answers a reset. The difference is what happens behind it:
an address with no account gets a new one and a link; an address that already
holds one gets a message saying so and pointing at sign-in, and no second row is
written. **Both answers are the same page and the same words**, because a form
that answered differently would be a test for whether a named person is an
investor in this company — which is precisely the fact this system holds about
people and which `SEC-R03` refuses to leak through a public form.

### What a prospect may read

**Nothing new gates anything, and that is the whole of the access story.** A
registered prospect holds no `content_grants`, so no `granted` report or deck
reaches them; `CMS-006`'s predicate answers every read they make, exactly as it
answers every other reader's. There is no second access model here and there must
not be — `INV-DEC-02` refused one, and a second thing able to deny a document is
the one that goes stale when the rule changes.

**A registration writes `role: prospect`, and that role is what bounds the hall
it opens** ([`AUTH-DEC-06`](../../decisions-log.md#AUTH-DEC-06)). `visibleTo`
gives it a branch of its own: the `public` audience, plus any item an admin has
named them on by grant, and nothing else. The `investor` audience is the one it
does not reach, and that is the whole of what the role buys — because
`content_items.audience` defaults to `investor`, an item nobody thought about is
an item a prospect cannot see.

**Fail-closed by construction rather than by habit.** The alternative considered
was to leave the role alone and have an admin choose a narrower audience for
anything sensitive, which would have left a report one mistaken dropdown away
from every person who can receive mail. A feature whose entire purpose is
bounding what an anonymous registrant sees cannot rest on somebody remembering,
so the bound is the predicate.

`INV-DEC-02` is untouched and stays true. `investor_type` still orders the
landing and gates nothing; what gates here is the role, which is what every other
access decision in this hall already turns on. The two words coincide and the
facts do not: an admin-invited person still deciding is role `investor` and type
`prospect` at once.

An admin promotes a prospect to an investor once they have invested
(`ADMIN-001/T13`). `prospect` is not invitable and is not a destination for that
promotion: somebody becomes one by registering and confirming their own address
and by nothing else, so a record saying otherwise would say a person registered
themselves when an admin invited them.

### Why the progress board is hidden from them, and why that is not a second gate

The board is the one surface this rule does not already cover, because
`portfolio` is not `content_items`: it carries no audience and `standing()` takes
no reader. Two facts withhold it and they are not the same fact: the role, which
costs no query and holds whatever anybody later records about the person; and the
type, which is `INV-DEC-02`'s and withholds the reporting landing from an invited
reader who is still deciding.

That reads at first like the thing `INV-DEC-02` forbids, and it is worth stating
why it is not. That decision says the type "never gates access. What a reader may
read stays entirely with `content_grants` and `audience` through `CMS-006`… the
type decides only the order and weight of the blocks on the landing." The board
is a **block on the landing**, not a document in the content system: hiding it is
weight set to nothing, which is the clause's own subject. A document remains
reachable or not by grant and audience alone, exactly as the decision requires,
and no query over `content_items` reads `investor_type` — a property the tests
assert rather than describe.

The reason to hide it is not secrecy dressed as policy. The board carries a stage
and a headline per product that the public gateway does not publish; showing them
to anybody who can type an address would make the board public by a side door,
without anybody deciding it should be.

### Against a flood

A public form that writes rows is a form somebody will point a script at. Three
things hold, and none of them depends on the other two:

- The same limiter `AUTH-001` uses on sign-in, at the same layer and counted per
  address and per network address, on keys of its own. Sharing sign-in's keys
  would let an anonymous caller spend a named person's sign-in allowance by
  posting their address here, which is a lockout of the one door into the hall
  reachable with no password at all.
- **An address an account already holds is not written to and mints nothing.**
  That is the opposite of re-issuing, and deliberately: an `invited` account is
  waiting on a link somebody sent it, and re-issuing would replace that link on
  an anonymous caller's say-so — the denial of access `requestReset` closes by
  narrowing to `active` ([`AUTH-DEC-04`](../../decisions-log.md#AUTH-DEC-04)),
  left open here for anybody who can guess an investor's address. For an `active`
  account the same act would be a self-service password reset with no
  verification at all. What that address gets instead is a message saying an
  account already uses it, carrying the sign-in page and no token.
- A row in `state: invited` grants nothing and reads nothing. An abandoned
  registration is an address and a name, which `DATA-002`'s retention sweep
  removes with every other unconfirmed row.

## 4. Integration

**`AUTH-003`** supplies the token, its single-use consumption and the
set-password view; this design adds no second token kind. **`MAIL-001`** carries
the two messages, both transactional, so `MAIL-002`'s suppression list is not
consulted for either — a suppressed address that received nothing while a fresh
one received a link would be the difference this form exists to withhold.
**`CMS-006`** is the whole of what a prospect may read, and what it admits them
to is the open question above. **`INV-001`** is where the board is left out, and
it reads `investor_type` through a function of the hall's own rather than through
the gate, so `Actor` stays an id and a role and no content query can reach the
column. **`SITE-005`** is what puts the form in front of anybody. **`ADMIN-001`**
shows an admin who arrived this way, in the same list as everybody else.

## 5. Cross-cutting compliance

- **`SEC-R03`** — one answer whatever the address, and the limiter on the path.
- **`DATA-R01`** — a name and an address, because a person deciding whether to
  follow a company should not have to hand over more than a person who was
  invited.
- **`DATA-R05`** — every read a prospect makes is scoped by the same predicate
  every other reader's is.
- **`LEGAL-SG-001`, `LEGAL-GLOBAL-001`** — a registration collects nothing the
  notice does not already name, and the consent it rests on is the act of
  registering, which is the same basis an invitation's acceptance rests on. The
  notice says that basis in one way only: *given when you accepted your
  invitation*. That sentence stays true while the door is shut and stops being
  true the moment it opens, so widening it to cover both doors, in twenty
  locales, is owed before `AUTH_REGISTRATION_OPEN` is ever set to `true`. It is a
  statement of legal basis rather than a caption, so the wording is the owner's
  and legal's rather than this design's.
- **`I18N-R01`** — the form and the message in twenty locales.
- **`A11Y-R01`, `A11Y-R02`** — the form is operable by keyboard, every field
  carries a real label, and the answer is announced rather than only shown.

## 6. Open questions and trade-offs

- **Anybody may create an account.** That is the point of the door and the cost
  of it: the account list will carry people nobody invited. They hold nothing and
  can be deleted from the person page, and an admin who wants to promote one
  grants a deck or sets the type. The alternative — an approval queue — was
  weighed and refused by the owner, on the grounds that a queue nobody drains is
  a dead feature and a person who registered and heard nothing is worse served
  than one who was let in to read the public page.
- **A prospect's hall is quiet.** They see the public stream and little else.
  That is honest rather than ideal, and the block that welcomes them is what
  stops the page reading as an error.
- **The form is the last thing to land, not the first.** Everything behind it —
  the row, the token, the two messages, the twenty catalogues, the limiter and
  the board's absence — is built and tested without it, because all of that is
  reachable from a route and none of it is reachable from a page that has no
  server. The cost is that the feature is inert until `SITE-005/T1`, and the
  benefit is that when the page arrives it wires one form to a surface whose
  behaviour is already pinned.

## 7. Task list

- `AUTH-005/T1` — A registration writes the same row an invitation writes, with the type that says how they arrived
- `AUTH-005/T2` — One answer whatever the address, with the limiter on the path
- `AUTH-005/T3` — The form on the gateway, in twenty locales, operable by keyboard
- `AUTH-005/T4` — A prospect sees the public content and no progress board, asserted against the predicate
- `AUTH-005/T5` — The `prospect` role: the vocabulary, the predicate's branch of its own, and the row a registration writes
- `AUTH-005/T6` — The copy that assumed an invitation was the only way in, corrected in twenty locales
