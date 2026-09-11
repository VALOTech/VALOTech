/**
 * The consumer side of the gate, for a rendered page rather than a route
 * handler (`ADMIN-002`, and `INV-002` when it lands).
 *
 * `AUTH-002`'s `requireAdmin`/`requireInvestor` answer an `Actor` or the
 * `Response` a caller should return. A route handler returns that `Response`
 * directly; a React Server Component cannot — it has no return channel for a
 * status — so it must translate the answer into the App Router's control flow:
 * `notFound()` for the `404` an un-entitled reader gets, `redirect()` for the
 * sign-in a signed-out reader gets. Both throw, so past the translation only
 * the `Actor` remains.
 *
 * This lives in one place, and on purpose: the rule that a non-admin is answered
 * `404` and not `403` is decided in the gate, and the translation from that
 * decision to the framework must not be re-implemented per page, where one page
 * could quietly turn the `404` into a `403` or a redirect that confirms the
 * surface exists. A page calls `requireAdminPage()`; it does not get to choose
 * how the refusal is shaped.
 *
 * The `307` a redirect here emits differs from the gate's own `303`: a handler
 * returning to a `POST` uses `303` to force the follow-up `GET`, while a page is
 * reached by `GET` already, so `redirect()`'s default temporary redirect lands
 * on the same sign-in `GET` with nothing to force.
 */

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { type Actor, requireAdmin, requireInvestor, type SessionRequest } from './gate';

const SIGN_IN = '/sign-in';

/**
 * Translate a gate answer into the page's control flow, returning the `Actor`
 * when there is one and never returning when there is not.
 */
function enforce(answer: Actor | Response): Actor {
  if (answer instanceof Response) {
    if (answer.status === 404) {
      notFound();
    }
    redirect(answer.headers.get('Location') ?? SIGN_IN);
  }

  return answer;
}

/** The current request as the gate reads it: its headers, and nothing else. */
async function currentRequest(): Promise<SessionRequest> {
  return { headers: await headers() };
}

/**
 * The admin reading this page, or the page never renders: a non-admin is sent
 * the `404` the gate chose and a signed-out reader the sign-in redirect.
 */
export async function requireAdminPage(): Promise<Actor> {
  return enforce(await requireAdmin(await currentRequest()));
}

/**
 * The reader of a room surface, or the page never renders: a signed-out reader
 * is sent to the sign-in form. An admin passes where an investor does, because
 * the gate lets an admin read whatever an investor may (`AUTH-002`); a room
 * surface such as the session list (`AUTH-004/T2`) is a reader's own, not the
 * console's, so it does not turn a signed-in investor away.
 */
export async function requireInvestorPage(): Promise<Actor> {
  return enforce(await requireInvestor(await currentRequest()));
}
