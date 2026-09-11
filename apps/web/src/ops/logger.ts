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
import { currentRequestId } from './request-context';
import { scrub } from './scrub';

/**
 * Every event a line may carry. An entry is added here in the commit that adds
 * the code which emits it, so a reader can count `db.pool_error` lines without
 * first discovering that the string exists.
 */
export const LOG_EVENTS = ['db.pool_error', 'log.scrubbed'] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];

/** The event a scrubber hit raises, so a caller logging a secret is the alert. */
const SCRUBBED_EVENT: LogEvent = 'log.scrubbed';

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

function scrubFields(fields: LogFields): {
  out: Record<string, string | number | boolean | null>;
  masked: string[];
} {
  const out: Record<string, string | number | boolean | null> = {};
  const masked: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== 'string') {
      out[key] = value;
      continue;
    }
    const cleaned = scrub(value);
    out[key] = cleaned;
    if (cleaned !== value) {
      masked.push(key);
    }
  }

  return { out, masked };
}

function emit(level: LogLevel, event: LogEvent, msg: string, fields: LogFields): void {
  // Off in production, and nowhere else: a debug line on a loaded production
  // process is noise in the one output an operator reads.
  if (level === 'debug' && getConfig().app.env === 'production') {
    return;
  }

  const cleanedMsg = scrub(msg);
  const { out, masked } = scrubFields(fields);
  if (cleanedMsg !== msg) {
    masked.unshift('msg');
  }

  process.stdout.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      request_id: currentRequestId(),
      msg: cleanedMsg,
      ...out,
    })}\n`,
  );

  // A scrubber hit is itself an alert (`OPS-002/T4`): it means a caller tried to
  // log something it should not, and the fix is that caller — named here by its
  // event — not the scrubber. The alert is itself a line, so it carries only the
  // offending event and the masked field names, never a value; and a
  // `log.scrubbed` line never raises its own alert, so a hit costs exactly one
  // extra line rather than an unbounded cascade.
  if (masked.length > 0 && event !== SCRUBBED_EVENT) {
    emit('error', SCRUBBED_EVENT, 'a log line carried data the scrubber masked; fix the caller', {
      source_event: event,
      masked_fields: masked.join(','),
    });
  }
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
