/**
 * One block of the hall's landing, and what happens when its read fails
 * (`INV-001/T2`).
 *
 * `Promise.all` rejects as a whole, so one unavailable read took the entire
 * hall to the error boundary: a reader lost the report, the board and their
 * decks because the stream's query failed. Settling each read separately is
 * what lets the one absent block say so while the rest of the page still
 * answers the question the reader arrived with (`INV-001` §3).
 *
 * The distinction this exists to preserve is between *nothing has been posted*
 * and *this did not load*. They are different facts, and a reader who cannot
 * tell them apart either waits for something that has already arrived or gives
 * up on something that has not.
 */

import { log } from '../../ops/logger';

/** A block's data, or the fact that it could not be read. */
export type Block<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/**
 * Read a settled result, and log a rejection as the degradation it is.
 *
 * `warn` and not `error`: the page is serving, with less on it (`OPS-R06`).
 * The rejection's class reaches the line and its message does not — a message
 * is composed from whatever the failure touched, which on this path is a query
 * over an investor's own rows, and a driver puts the parameters it bound into
 * the text (`DATA-R03`). The class alone tells an operator which failure it was
 * without carrying a reader's data into the log.
 */
export function block<T>(settled: PromiseSettledResult<T>, name: string): Block<T> {
  if (settled.status === 'fulfilled') {
    return { ok: true, value: settled.value };
  }

  log.warn('hall.block_failed', 'a hall block could not be read', {
    block: name,
    reason: settled.reason instanceof Error ? settled.reason.name : 'unknown',
  });
  return { ok: false };
}
