/**
 * The sign-in rate limit (`AUTH-001`): `AUTH_MAX_ATTEMPTS` attempts inside
 * `AUTH_WINDOW_SECONDS`, counted in this process's memory.
 *
 * The store is a map rather than Redis, which this deployment does not run
 * (`INFRA-001`). The consequence is stated rather than hidden: the counters are
 * per process and are lost on a restart, which is a weaker guarantee than a
 * shared store and the right trade at this size. A second instance would need
 * the store to move, not the shape of this module.
 *
 * The limiter counts against keys and knows nothing about what they mean.
 * Sign-in calls it twice — once for the account the address names, once for the
 * network address the request came from — because limiting only the address lets
 * one attacker spread across a botnet and limiting only the account lets one
 * attacker walk the whole list. The caller is what keeps those two spaces apart,
 * by namespacing the keys it passes.
 */

import { performance } from 'node:perf_hooks';

import { getConfig, type Config } from '../config/index';

/** What one attempt learned: whether to refuse it, and for how long. */
export interface RateLimitState {
  readonly limited: boolean;
  /** The `Retry-After` a refusal carries. Zero when nothing is refused. */
  readonly retryAfterSeconds: number;
}

const MILLISECONDS_PER_SECOND = 1000;

export class RateLimiter {
  readonly #attempts = new Map<string, number[]>();
  readonly #maxAttempts: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  #sweptAt: number;

  /**
   * The limits come from the caller, so the environment is read once, in the
   * one module that reads it. `now` is injected so a test can walk a window
   * without waiting one, and defaults to a monotonic clock -- a wall clock
   * stepped back by an NTP correction would emit a `Retry-After` longer than a
   * window, and stepped forward would clear a limit early.
   */
  constructor(limits: Config['auth'], now: () => number = () => performance.now()) {
    this.#maxAttempts = limits.maxAttempts;
    this.#windowMs = limits.windowSeconds * MILLISECONDS_PER_SECOND;
    this.#now = now;
    this.#sweptAt = now();
  }

  /**
   * Count an attempt against `key` and say whether it is over the limit.
   *
   * Success and failure are counted alike, so a correct password does not
   * reset the counter and a refusal costs an attacker what a success costs.
   */
  hit(key: string): RateLimitState {
    const now = this.#now();
    this.#sweep(now);

    const attempts = this.#within(this.#attempts.get(key) ?? [], now);

    if (attempts.length >= this.#maxAttempts) {
      // A refused attempt records nothing. Recording it would refill each slot
      // the moment it aged out, so the window would slide without ever
      // emptying and a client that honours the `Retry-After` it is sent would
      // hold its own key locked out for as long as it kept trying -- a
      // permanent lockout of a named person on the one door into the room. The
      // oldest allowed attempt leaving the window is what clears the key.
      this.#attempts.set(key, attempts);
      const clearsAt = (attempts[0] ?? now) + this.#windowMs;
      const retryAfterSeconds = Math.ceil((clearsAt - now) / MILLISECONDS_PER_SECOND);
      const windowSeconds = this.#windowMs / MILLISECONDS_PER_SECOND;

      return {
        limited: true,
        retryAfterSeconds: Math.min(windowSeconds, Math.max(0, retryAfterSeconds)),
      };
    }

    attempts.push(now);
    this.#attempts.set(key, attempts);

    return { limited: false, retryAfterSeconds: 0 };
  }

  /**
   * How many attempts the store is holding, across every key.
   *
   * The bound this pins is per key: a key holds at most `maxAttempts`
   * timestamps, because a refused attempt records nothing, so an attacker
   * cannot grow one key's footprint by hammering it. The number of keys is not
   * bounded here -- a window's worth of distinct addresses persist until the
   * sweep -- and capping that is the edge's job: `OPS-001` rate-limits per
   * address before a request reaches this process, and this limiter is the
   * second layer. A test pins the per-key bound rather than a reading of this
   * file standing behind it.
   */
  get stored(): number {
    let total = 0;

    for (const attempts of this.#attempts.values()) {
      total += attempts.length;
    }

    return total;
  }

  /** The attempts still inside the window, in the order they were made. */
  #within(attempts: readonly number[], now: number): number[] {
    return attempts.filter((at) => now - at < this.#windowMs);
  }

  /**
   * Drop what every key has aged out of, and the keys that are then empty. It
   * runs at most once per window: pruning one key on its own access keeps that
   * key's list short, but a key never touched again is only released here.
   */
  #sweep(now: number): void {
    if (now - this.#sweptAt < this.#windowMs) {
      return;
    }
    this.#sweptAt = now;

    for (const [key, attempts] of this.#attempts) {
      const recent = this.#within(attempts, now);

      if (recent.length === 0) {
        this.#attempts.delete(key);
      } else {
        this.#attempts.set(key, recent);
      }
    }
  }
}

let shared: RateLimiter | undefined;

/**
 * The limiter the application counts in, built once from the environment. One
 * store for the process is the whole point: a limiter built per request counts
 * every attempt as the first.
 */
export function getRateLimiter(): RateLimiter {
  if (shared === undefined) {
    shared = new RateLimiter(getConfig().auth);
  }
  return shared;
}
