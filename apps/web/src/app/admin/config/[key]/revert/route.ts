/**
 * `POST /admin/config/<key>/revert` — one step back (`CFG-001/T8`).
 *
 * **No confirmation, deliberately.** Reverting is the safe direction, and a
 * confirmation on the safe direction trains people through the one on the
 * dangerous direction (`CFG-001` §3). The dangerous direction here is the change
 * itself, and that is the one an operator has to type a value into.
 *
 * A revert is itself a change: `revertSetting` swaps current and previous and
 * audits the move as a `config.change`, so reverting twice returns to where it
 * started and the trail shows both moves (`CFG-001/T4`). There is no undo stack,
 * because one step back is what an operator needs at three in the morning and a
 * stack is a thing to reason about at exactly the wrong time.
 *
 * A key that has never changed has nothing to go back to, and that is a `409`
 * rather than an error: the request was well formed and the state does not admit
 * it. The console does not offer the control in that case, so reaching this is a
 * direct post or a screen that has gone stale.
 */

import { requireAdmin } from '../../../../../auth/gate';
import { revertSetting, SETTINGS, type SettingKey } from '../../../../../config/settings';
import { getConfig } from '../../../../../config/index';
import { withRequestId } from '../../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isSettingKey(value: string): value is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, value);
}

async function handleRevert(request: Request, key: string): Promise<Response> {
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

  const reverted = await revertSetting(key, actor.id);

  return reverted ? json(200, { key }) : json(409, { error: 'nothing_to_revert' });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params;
  return withRequestId((scoped: Request) => handleRevert(scoped, key))(request);
}
