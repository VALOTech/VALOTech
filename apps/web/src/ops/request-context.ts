/**
 * The request id that ties together every log line one request produces
 * (`OPS-002/T2`). It is generated at the edge — `proxy.ts` mints one per request
 * and sets it on the request — and carried to the logger through an
 * `AsyncLocalStorage` rather than threaded through every call.
 *
 * The carrying is its own mechanism because a Next proxy runs before the handler
 * and in a different async context, so it cannot hand the handler a value
 * directly: it sets a header, and the handler establishes the context from it
 * (`withRequestId`). Everything the handler then calls — a service, a query —
 * runs inside that context and reads the id from it, so no signature has to grow
 * a parameter it would only pass along.
 *
 * A line logged outside any request — a connection-pool error raised from an
 * idle client, before or between requests — has no context and no id, and `null`
 * is the honest value for it rather than a fabricated one.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/** The header the edge sets and the handler reads. Lower-case, as a header is. */
export const REQUEST_ID_HEADER = 'x-request-id';

const store = new AsyncLocalStorage<string>();

/** A fresh request id. Minted at the edge, and by the fallback in `withRequestId`. */
export function newRequestId(): string {
  return randomUUID();
}

/** Run `fn` with `id` as the current request id, so every line it logs carries it. */
export function runWithRequestId<T>(id: string, fn: () => T): T {
  return store.run(id, fn);
}

/**
 * Wrap a route handler so it runs inside the request's context. The id is the
 * one the edge set on the request; a request that reached the handler without
 * passing the edge — a direct call, a test — gets a fresh one rather than none,
 * so a line is never left unattributed to spare the edge a header.
 */
export function withRequestId<R extends Request>(
  handler: (request: R) => Promise<Response>,
): (request: R) => Promise<Response> {
  return (request) =>
    runWithRequestId(request.headers.get(REQUEST_ID_HEADER) ?? newRequestId(), () => handler(request));
}

/** The id of the request in flight, or `null` when there is none. */
export function currentRequestId(): string | null {
  return store.getStore() ?? null;
}
