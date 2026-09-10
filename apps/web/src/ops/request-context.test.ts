/**
 * The request-id context (`OPS-002/T2`). The id is carried through an
 * `AsyncLocalStorage`, so the assertions are about what `currentRequestId()`
 * reads inside and outside a context, that the context survives the awaits a
 * real request is full of, and that two requests in flight never read each
 * other's id. It needs no database and always runs.
 */

import { describe, expect, it } from 'vitest';

import {
  currentRequestId,
  newRequestId,
  REQUEST_ID_HEADER,
  runWithRequestId,
  withRequestId,
} from './request-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('OPS-002/T2 the request-id context', () => {
  it('has no id outside any request', () => {
    expect(currentRequestId()).toBeNull();
  });

  it('reads the id inside the context it was given', () => {
    expect(runWithRequestId('req-123', () => currentRequestId())).toBe('req-123');
  });

  it('leaves no id behind once the context ends', () => {
    runWithRequestId('req-123', () => currentRequestId());
    expect(currentRequestId()).toBeNull();
  });

  it('carries the id across an await, the way a request is full of them', async () => {
    const seen = await runWithRequestId('req-async', async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
      return currentRequestId();
    });

    expect(seen).toBe('req-async');
  });

  it('keeps two requests in flight apart', async () => {
    // Each context reads its own id however the two interleave — the property a
    // single shared variable would break the moment two requests overlap.
    const [a, b] = await Promise.all([
      runWithRequestId('A', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return currentRequestId();
      }),
      runWithRequestId('B', async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return currentRequestId();
      }),
    ]);

    expect(a).toBe('A');
    expect(b).toBe('B');
  });

  it('mints a distinct id each time', () => {
    const ids = new Set(Array.from({ length: 8 }, () => newRequestId()));

    expect(ids.size).toBe(8);
    for (const id of ids) {
      expect(id).toMatch(UUID);
    }
  });
});

describe('OPS-002/T2 withRequestId opens the context from the request', () => {
  async function idSeenByHandler(header: string | null): Promise<string | null> {
    let seen: string | null = null;
    const headers = new Headers();
    if (header !== null) {
      headers.set(REQUEST_ID_HEADER, header);
    }

    const wrapped = withRequestId(async () => {
      seen = currentRequestId();
      return new Response();
    });
    await wrapped(new Request('http://localhost/x', { headers }));

    return seen;
  }

  it('opens the context from the edge-set header, so the handler reads that id', async () => {
    expect(await idSeenByHandler('edge-abc')).toBe('edge-abc');
  });

  it('mints a fresh id when the request reached it without passing the edge', async () => {
    expect(await idSeenByHandler(null)).toMatch(UUID);
  });
});
