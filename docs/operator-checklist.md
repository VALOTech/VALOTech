# VALO Tech — operator checklist

> **Not for `main`.** This document lives on `development` only (`.claude/CLAUDE.md` §1.1).

What waits on a human. A design that cannot proceed without an action outside
this repository carries `external_blocker.ref` pointing at an anchor here, and
`scripts/validate-designs.py` refuses a design whose ref resolves to nothing.

Each item says what to do, who can do it, and the signal that it is done. An
item leaves this file when its signal is true — not when it feels handled.

---

## Open

<a id="OPS-HOSTING"></a>
### Choose and provision where the application runs

- **What:** answer [`INFRA-DEC-03`](decisions-log.md#INFRA-DEC-03), then provision the host and the database.
- **Who:** the owner. It costs money and it changes what valotech.org points at.
- **Done when:** the application answers on a real hostname over TLS, and `docs/ECOSYSTEM.md` carries the row.
- **Until then:** nothing is deployed. The gateway is served by GitHub Pages from `main`, unchanged.

<a id="MAIL-CARRIER"></a>
### Choose the mail carrier and set its credential

- **What:** answer [`MAIL-DEC-01`](decisions-log.md#MAIL-DEC-01), create the account, verify the sending domain (SPF, DKIM, DMARC), and set the key in the environment.
- **Who:** the owner. It puts investor addresses through a third party.
- **Done when:** a message sent from staging arrives in an institutional inbox, not in its spam folder, and the bounce webhook is reachable.
- **Until then:** no mail is sent. The invitation flow is blocked and the gateway's contact path stays a `mailto:` link.

<a id="DPO-CONTACT"></a>
### Name a data-protection officer and publish the contact

- **What:** Singapore's PDPA requires a named individual and a means of reaching them. `LEGAL-SG-001/T3` cannot close without it.
- **Who:** the owner.
- **Done when:** the name and address are recorded here and reachable from the investor room.
- **Until then:** no investor account exists, so no personal data is held.

<a id="ECOSYSTEM-PORT-SYNC"></a>
### Carry this repository's port row into the sibling copies of the ecosystem map

- **What:** `docs/ECOSYSTEM.md` says every VALO repository holds an identical copy, and this repository has claimed **Postgres 5434** and **web 3100**. The six sibling copies do not yet carry that row.
- **Who:** whoever owns a sweep across the repositories. This lane does not edit siblings.
- **Done when:** the ports table in all seven copies names VALO Tech.
- **Until then:** a sibling reading its own copy sees 5434 as unallocated and could claim it.

---

## Done

_Nothing yet. An item moves here with the date and the signal that closed it, and is never deleted — the next person to ask "was this ever done?" is answered by the file rather than by memory._
