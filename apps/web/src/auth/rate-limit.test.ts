import { describe, expect, it } from 'vitest';

import { loadConfig, type Config } from '../config/index';
import { RateLimiter, getRateLimiter } from './rate-limit';

/**
 * The limits, parsed by the real reader from a real environment, so a test that
 * says "the boundary comes from configuration" is standing on the same path the
 * application stands on rather than on a literal it wrote itself.
 */
function limits(maxAttempts: number, windowSeconds: number): Config['auth'] {
  return loadConfig({
    APP_ENV: 'development',
    APP_ORIGIN: 'http://localhost:3100',
    DATABASE_URL: 'postgres://valotech:pw@127.0.0.1:5434/valotech',
    SESSION_SECRET: 'x'.repeat(40),
    AUTH_MAX_ATTEMPTS: String(maxAttempts),
    AUTH_WINDOW_SECONDS: String(windowSeconds),
  }).auth;
}

/** A clock the test moves, so a window passes without a window passing. */
function clock(): { now: () => number; advanceSeconds: (seconds: number) => void } {
  let at = Date.parse('2026-09-07T09:00:00.000Z');

  return {
    now: () => at,
    advanceSeconds: (seconds: number) => {
      at += seconds * 1000;
    },
  };
}

const WINDOW_SECONDS = 900;
const MAX_ATTEMPTS = 5;
const KEY = 'account:investor@example.com';

describe('RateLimiter', () => {
  it('allows the configured number of attempts in the window and refuses the next', () => {
    const time = clock();
    const limiter = new RateLimiter(limits(MAX_ATTEMPTS, WINDOW_SECONDS), time.now);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      expect(limiter.hit(KEY)).toEqual({ limited: false, retryAfterSeconds: 0 });
      time.advanceSeconds(1);
    }

    const refused = limiter.hit(KEY);

    expect(refused.limited).toBe(true);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_SECONDS);
  });

  it('names a retry that shrinks as the window slides past the attempt holding it', () => {
    const time = clock();
    const limiter = new RateLimiter(limits(MAX_ATTEMPTS, WINDOW_SECONDS), time.now);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS + 1; attempt += 1) {
      limiter.hit(KEY);
    }

    // The first attempt is at second zero, so the key clears a full window
    // after it — and a hundred seconds later, a hundred seconds sooner.
    expect(limiter.hit(KEY).retryAfterSeconds).toBe(WINDOW_SECONDS);
    time.advanceSeconds(100);
    expect(limiter.hit(KEY).retryAfterSeconds).toBe(WINDOW_SECONDS - 100);
  });

  it('lets the key through again once the window has passed', () => {
    const time = clock();
    const limiter = new RateLimiter(limits(MAX_ATTEMPTS, WINDOW_SECONDS), time.now);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS + 1; attempt += 1) {
      limiter.hit(KEY);
    }
    expect(limiter.hit(KEY).limited).toBe(true);

    time.advanceSeconds(WINDOW_SECONDS);

    expect(limiter.hit(KEY)).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  it('counts each key on its own, so one address does not lock out another', () => {
    const time = clock();
    const limiter = new RateLimiter(limits(MAX_ATTEMPTS, WINDOW_SECONDS), time.now);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS + 1; attempt += 1) {
      limiter.hit(KEY);
    }

    expect(limiter.hit(KEY).limited).toBe(true);
    expect(limiter.hit('address:198.51.100.7').limited).toBe(false);
  });

  it.each([2, 7])('takes its boundary from the configuration, here %i attempts', (maxAttempts) => {
    const time = clock();
    const limiter = new RateLimiter(limits(maxAttempts, WINDOW_SECONDS), time.now);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      expect(limiter.hit(KEY).limited).toBe(false);
    }

    expect(limiter.hit(KEY).limited).toBe(true);
  });

  it('takes its window from the configuration, so a shorter one clears sooner', () => {
    const time = clock();
    const limiter = new RateLimiter(limits(MAX_ATTEMPTS, 60), time.now);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS + 1; attempt += 1) {
      limiter.hit(KEY);
    }
    expect(limiter.hit(KEY).retryAfterSeconds).toBe(60);

    time.advanceSeconds(60);

    expect(limiter.hit(KEY).limited).toBe(false);
  });

  it('records nothing further once a key is over the limit, however long the hammering lasts', () => {
    const time = clock();
    const limiter = new RateLimiter(limits(MAX_ATTEMPTS, WINDOW_SECONDS), time.now);

    for (let attempt = 1; attempt <= 500; attempt += 1) {
      limiter.hit(KEY);
      time.advanceSeconds(1);
    }

    expect(limiter.hit(KEY).limited).toBe(true);
    expect(limiter.stored).toBe(MAX_ATTEMPTS);
  });

  it('clears for a client that obeys Retry-After, not only for one that waits in silence', () => {
    const time = clock();
    const limiter = new RateLimiter(limits(MAX_ATTEMPTS, WINDOW_SECONDS), time.now);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      limiter.hit(KEY);
      time.advanceSeconds(1);
    }

    let state = limiter.hit(KEY);
    expect(state.limited).toBe(true);

    // Obey the advertised wait and try again -- the behaviour a well-made
    // client has. A refused retry that was recorded would refill the window it
    // waited out, so this would loop forever; a bounded number of obedient
    // retries must clear the key.
    let obedientRetries = 0;
    while (state.limited && obedientRetries < 5) {
      time.advanceSeconds(state.retryAfterSeconds);
      state = limiter.hit(KEY);
      obedientRetries += 1;
    }

    expect(state.limited).toBe(false);
  });

  it('forgets the keys that fell silent for a window, rather than holding every address seen', () => {
    const time = clock();
    const limiter = new RateLimiter(limits(MAX_ATTEMPTS, WINDOW_SECONDS), time.now);

    for (const address of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      limiter.hit(`address:${address}`);
    }
    expect(limiter.stored).toBe(3);

    time.advanceSeconds(WINDOW_SECONDS + 1);
    limiter.hit('address:198.51.100.4');

    expect(limiter.stored).toBe(1);
  });
});

describe('getRateLimiter', () => {
  it('is one store for the process, at the limit the environment states', () => {
    // getRateLimiter() reads process.env through getConfig(), which under
    // `npm test` carries none of the required variables; set them so the first
    // and only read validates, and state a limit no default would produce.
    process.env.APP_ENV = 'development';
    process.env.APP_ORIGIN = 'http://localhost:3100';
    process.env.DATABASE_URL = 'postgres://valotech:pw@127.0.0.1:5434/valotech';
    process.env.SESSION_SECRET = 'x'.repeat(40);
    process.env.AUTH_MAX_ATTEMPTS = '3';

    const limiter = getRateLimiter();

    expect(getRateLimiter()).toBe(limiter);
    expect(limiter.hit(KEY).limited).toBe(false);
    expect(limiter.hit(KEY).limited).toBe(false);
    expect(limiter.hit(KEY).limited).toBe(false);
    expect(limiter.hit(KEY).limited).toBe(true);
  });
});
