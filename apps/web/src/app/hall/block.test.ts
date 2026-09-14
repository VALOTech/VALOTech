/**
 * A hall block's degradation (`INV-001/T2`).
 *
 * The assertions read the bytes the logger writes rather than a return value,
 * because the operator's half of this feature is the line: a block that
 * silently renders "this did not load" and leaves nothing behind is a page
 * nobody can be paged about.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { block } from './block';

process.env.APP_ENV = 'development';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.SESSION_SECRET = 's'.repeat(40);
process.env.DATABASE_URL = 'postgres://valotech:valotech@127.0.0.1:5434/valotech';

let written: string[];

beforeEach(() => {
  written = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array): boolean => {
    written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const lines = (): ReadonlyArray<Record<string, unknown>> =>
  written.flatMap((chunk) =>
    chunk
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as Record<string, unknown>),
  );

describe('a block that was read (INV-001/T2)', () => {
  it('carries its value through and logs nothing', async () => {
    const [settled] = await Promise.allSettled([Promise.resolve({ entries: [] })]);

    expect(block(settled, 'stream')).toEqual({ ok: true, value: { entries: [] } });
    expect(lines()).toEqual([]);
  });

  it('keeps a falsy value rather than reading it as an absence', async () => {
    // `0` unread and an empty list are answers, not failures. A helper testing
    // truthiness would turn the commonest state of a new account into an error.
    const [zero] = await Promise.allSettled([Promise.resolve(0)]);
    const [empty] = await Promise.allSettled([Promise.resolve([])]);
    const [nul] = await Promise.allSettled([Promise.resolve(null)]);

    expect(block(zero, 'unread')).toEqual({ ok: true, value: 0 });
    expect(block(empty, 'decks')).toEqual({ ok: true, value: [] });
    expect(block(nul, 'report')).toEqual({ ok: true, value: null });
    expect(lines()).toEqual([]);
  });
});

describe('a block that could not be read (INV-001/T2)', () => {
  it('reports the failure rather than an absence, and names the block', async () => {
    const [settled] = await Promise.allSettled([Promise.reject(new TypeError('nope'))]);

    // Not `{ ok: true, value: undefined }`: the caller must be unable to render
    // the empty state by accident, which is the whole distinction.
    expect(block(settled, 'stream')).toEqual({ ok: false });

    const [line] = lines();
    expect(line).toMatchObject({
      level: 'warn',
      event: 'hall.block_failed',
      block: 'stream',
      reason: 'TypeError',
    });
  });

  it('warns rather than errors, because the page is still serving', async () => {
    const [settled] = await Promise.allSettled([Promise.reject(new Error('x'))]);
    block(settled, 'report');

    expect(lines()[0]).toMatchObject({ level: 'warn' });
  });

  it('never writes the rejection message, which carries the query it failed on', async () => {
    // A driver puts the parameters it bound into the message, and on this path
    // those are an investor's own rows (`DATA-R03`). The class is enough to say
    // which failure it was.
    const settled: PromiseSettledResult<never> = {
      status: 'rejected',
      reason: new Error('select … where account_id = investor@example.com'),
    };

    block(settled, 'decks');

    expect(JSON.stringify(lines())).not.toContain('investor@example.com');
    expect(JSON.stringify(lines())).not.toContain('account_id');
    expect(lines()[0]).toMatchObject({ reason: 'Error' });
  });

  it('names a non-Error rejection rather than serialising it', async () => {
    const [settled] = await Promise.allSettled([Promise.reject('a bare string')]);

    expect(block(settled, 'standing')).toEqual({ ok: false });
    expect(lines()[0]).toMatchObject({ reason: 'unknown' });
    expect(JSON.stringify(lines())).not.toContain('a bare string');
  });
});
