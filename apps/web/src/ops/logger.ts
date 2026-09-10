/**
 * The one logger (`OPS-002`): JSON lines to stdout, an event from a closed
 * vocabulary, fields passed explicitly, and a scrubber on the way out.
 *
 * JSON to stdout because the process runs in a container whose log drain is not
 * yet decided (`INFRA-DEC-03`), and stdout is the one output that works whatever
 * that turns out to be. One logger, not `console.log` scattered through the
 * tree, because a stray print is a line with no event to count it by, no request
 * id to tie it to its request, and possibly an address inside it.
 *
 * `DATA-R02` — no address, name, token, password or session id in a line — is
 * kept in two halves. The structural half is the type of `fields`: primitives
 * only, so a whole object handed to something generic does not compile, and it
 * is a whole object handed to something generic that carries personal data into
 * a log almost every time. The backstop half is the scrubber, which matches an
 * address and a long opaque token by shape in every string value and in the
 * message, and masks them — because an error message built from an address is a
 * string a caller did not think of as a field.
 *
 * `event` is a closed vocabulary so a line can be counted rather than matched by
 * prose, the same discipline the audit trail's action column keeps (`SEC-002`);
 * it grows by one entry when an emitter lands, so the list names what the
 * application actually logs and never what it might. The log is not the audit
 * trail: the trail is an append-only record for people and is written in the
 * caller's transaction (`SEC-R04`), the log is a best-effort record for
 * debugging, and neither stands in for the other.
 */

import { getConfig } from '../config/index';

/**
 * Every event a line may carry. An entry is added here in the commit that adds
 * the code which emits it, so a reader can count `db.pool_error` lines without
 * first discovering that the string exists.
 */
export const LOG_EVENTS = ['db.pool_error'] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];

/**
 * `error` — something failed that should not and a person saw it; `warn` —
 * something failed and was handled, so the system is degraded rather than down;
 * `info` — a privileged action, a sign-in, a publish, deliberately narrow so the
 * log is a line per thing-that-happened rather than per request; `debug` — off
 * in production.
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * What a caller may attach to a line. Primitives only: a nested object does not
 * type-check, which is the structural half of `DATA-R02` — the logger cannot be
 * handed a whole account or request to serialise whole.
 */
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

/**
 * The shapes the scrubber masks. An address is the obvious leak; a run of forty
 * or more base64url characters is the other — a 32-byte token is forty-three of
 * them and a SHA-256 hash is sixty-four, while a UUID account id is thirty-six
 * and stays readable, because an id is what ties a line to an act and is not the
 * secret the token is. The scrubber is a backstop: `fields` being primitives is
 * what keeps an object out in the first place.
 */
const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LONG_SECRET = /[A-Za-z0-9_-]{40,}/g;
const REDACTED = '[redacted]';

function scrub(value: string): string {
  return value.replace(ADDRESS, REDACTED).replace(LONG_SECRET, REDACTED);
}

/**
 * The edge-generated request id that ties every line of one request together.
 *
 * Deferred: OPS-002/T2 — generate it at the edge and carry it through, so this
 * returns the id of the request in flight rather than null.
 * Why: `proxy.ts` does not mint one yet, and a Next proxy cannot share an
 *   AsyncLocalStorage with the handler it runs before, so the carrying is its
 *   own mechanism rather than a line here.
 * Unblocks when: OPS-002/T2.
 * Next action: read the id the edge set on the request and return it.
 */
function currentRequestId(): string | null {
  return null;
}

function scrubFields(fields: LogFields): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(fields)) {
    out[key] = typeof value === 'string' ? scrub(value) : value;
  }

  return out;
}

function emit(level: LogLevel, event: LogEvent, msg: string, fields: LogFields): void {
  // Off in production, and nowhere else: a debug line on a loaded production
  // process is noise in the one output an operator reads.
  if (level === 'debug' && getConfig().app.env === 'production') {
    return;
  }

  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    request_id: currentRequestId(),
    msg: scrub(msg),
    ...scrubFields(fields),
  };

  process.stdout.write(`${JSON.stringify(line)}\n`);
}

/**
 * The logger. `event` is constrained to the closed vocabulary and `fields` to
 * primitives, so the two things that make a line countable and safe are checked
 * by the compiler rather than remembered at each call site.
 */
export const log = {
  error: (event: LogEvent, msg: string, fields: LogFields = {}): void => emit('error', event, msg, fields),
  warn: (event: LogEvent, msg: string, fields: LogFields = {}): void => emit('warn', event, msg, fields),
  info: (event: LogEvent, msg: string, fields: LogFields = {}): void => emit('info', event, msg, fields),
  debug: (event: LogEvent, msg: string, fields: LogFields = {}): void => emit('debug', event, msg, fields),
};
