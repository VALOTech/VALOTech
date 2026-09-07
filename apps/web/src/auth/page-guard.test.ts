/**
 * The page guard translates the gate's answer into the App Router's control
 * flow. The gate itself is proven in `gate.test.ts`; what is pinned here is the
 * translation, because a page that turned the `404` into a redirect — or into a
 * `403` — would confirm the admin console exists to an investor who guessed the
 * path, and no type would catch it.
 *
 * `next/navigation`, `next/headers` and the gate are mocked so the translation
 * is tested in isolation, without a database or the Next runtime: `notFound()`
 * and `redirect()` are the functions whose being-called is the assertion.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notFoundMock, redirectMock, requireAdminMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  requireAdminMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ notFound: notFoundMock, redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('./gate', () => ({ requireAdmin: requireAdminMock }));

const { requireAdminPage } = await import('./page-guard');

describe('requireAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the actor when the gate admits an admin, touching neither escape', async () => {
    requireAdminMock.mockResolvedValue({ id: 'a1', role: 'admin' });

    await expect(requireAdminPage()).resolves.toEqual({ id: 'a1', role: 'admin' });
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('calls notFound for the 404 an investor receives, never a redirect', async () => {
    requireAdminMock.mockResolvedValue(new Response(null, { status: 404 }));

    // The 404, not a redirect: a redirect would confirm the console exists.
    await expect(requireAdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects a signed-out reader to the gate-chosen location, not notFound', async () => {
    requireAdminMock.mockResolvedValue(
      new Response(null, { status: 303, headers: { Location: '/sign-in' } }),
    );

    await expect(requireAdminPage()).rejects.toThrow('NEXT_REDIRECT:/sign-in');
    expect(redirectMock).toHaveBeenCalledWith('/sign-in');
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
