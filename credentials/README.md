# Credentials

How a secret reaches the application, and how it does not.

## The rule

Every credential arrives through an **environment variable**, named in
[`env.example`](../env.example) and read in exactly one place in the code. None
is committed, none is printed, and none is returned by an API once it has been
set — a masked form of it, at most.

A **missing** credential degrades the feature that needs it and leaves the rest
of the system up. It never causes a silent fallback to an insecure default: a
mail carrier with no key sends nothing and says so, rather than dropping the
message.

## What this repository needs

| Variable | Who produces it | Why it exists |
|---|---|---|
| `DATABASE_URL` | `docker compose up` locally; the host, in production | Everything the investor room stores |
| `SESSION_SECRET` | the owner, generated locally | Will sign the session cookie once `AUTH-002/T5` lands (`AUTH-DEC-02`); until then it is unused on the session path, and the lever that ends every session is deleting the session rows (`AUTH-004`) |
| the mail carrier's key | unanswered — [`MAIL-DEC-01`](../docs/decisions-log.md#MAIL-DEC-01) | Carries an invitation and an investor message. Until the decision lands, no mail is sent and no key exists |

Three, and two of them the owner makes rather than buys. That is why this
directory holds a page rather than the go-live checklist a sibling repository
needs: a form for six vendors would be a form for four vendors that do not
exist.

## The page

[`credential-input.html`](credential-input.html) is opened locally in a browser.
It generates what it can, takes what it cannot, and produces a `.env` block to
paste. **It sends nothing anywhere** — no network request, no storage, no
analytics; closing the tab loses everything in it, which is the point.

## When a credential leaks

Rotate first, investigate second. Ending every live session today means deleting
the session rows — `AUTH-004`'s end-everywhere control, or truncating `sessions` —
because `SESSION_SECRET` does not yet sign the cookie; once `AUTH-002/T5` signs it
(`AUTH-DEC-02`), rotating the secret and restarting becomes that lever.
`DATABASE_URL` is rotated by changing the database password. A mail key is revoked
at the provider. Then file
what happened as a `REVIEW` row in [`docs/tasks.md`](../docs/tasks.md), because
the interesting question is never the key — it is how it got out.
