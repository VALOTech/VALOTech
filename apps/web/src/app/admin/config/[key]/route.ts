/**
 * `PUT /admin/config/<key>` — change one runtime setting (`CFG-001/T8`).
 *
 * The act is `changeSetting`'s, where the previous value, the new one and the
 * `config.change` audit commit together (`CFG-001/T3`, `SEC-R04`); this handler
 * refuses a caller who is not an admin, refuses a key the registry does not
 * declare, and hands back the refusal `changeSetting` produces rather than
 * turning it into a `500`.
 *
 * **A value outside the key's type is refused with the reason, never clamped**
 * (`CFG-001/T2`): a value silently clamped to its bound disagrees with what the
 * operator typed and with what the screen then shows, and that disagreement
 * surfaces later as a bug report about a value nobody set. The reason is the
 * store's own sentence, so the screen states the bound rather than inventing one.
 *
 * A key outside the registry is a `404` rather than a `400`, because it is not a
 * malformed request — it is a setting that does not exist, and the console
 * offers no way to ask for one. A secret-shaped key is refused by the store
 * itself before any write (`SEC-R05`), so the answer is the same whether the
 * registry is wrong or the caller is.
 *
 * A route handler inherits no segment layout, so this asks the gate itself
 * (`requireAdmin`) and answers a non-admin the `404` the console gives a guess;
 * an `Origin` present and not ours is refused before anything else, the
 * `SameSite=Lax` cookie being the first lock (`ADMIN-002`, `AUTH-001`).
 */

import { requireAdmin } from '../../../../auth/gate';
import { changeSetting, SETTINGS, type SettingKey } from '../../../../config/settings';
import { getConfig } from '../../../../config/index';
import { withRequestId } from '../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Whether the registry declares this key; anything else is a setting there is not. */
function isSettingKey(value: string): value is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, value);
}

async function handleChange(request: Request, key: string): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return json(403, { error: 'cross_origin' });
  }

  const actor = await requireAdmin(request);
  if (actor instanceof Response) {
    return actor;
  }

  if (!isSettingKey(key)) {
    return json(404, { error: 'unknown_key' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_request' });
  }

  const { value } = (body ?? {}) as { value?: unknown };
  if (typeof value !== 'string') {
    return json(400, { error: 'invalid_request' });
  }

  const result = await changeSetting(key, value, actor.id);

  return result.ok
    ? json(200, { key, value: result.stored })
    : json(400, { error: 'refused', detail: result.reason });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params;
  return withRequestId((scoped: Request) => handleChange(scoped, key))(request);
}
