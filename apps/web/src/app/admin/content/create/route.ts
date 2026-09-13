/**
 * `POST /admin/content/create` — an item begins here (`CMS-002/T9`).
 *
 * Creating is not publishing, and this route is careful to be only the first of
 * those: the row it writes carries no revision, so no reader sees anything until
 * something is written and published (`CMS-004`). That is why an admin can start
 * an item freely and why nothing here asks for confirmation.
 *
 * **The type decides what else is demanded**, and the check is here rather than
 * only in the form: an `update` carries a kind, a `report` carries a period, and
 * a `deck` carries neither (`CMS-001`). The database holds the same rule in its
 * own constraints, and this handler exists so an author reads a sentence instead
 * of a constraint violation — the browser's form is a convenience and never the
 * boundary (`CMS-002` §3).
 *
 * The **slug** is the caller's, not derived here. It is an address a reader will
 * see (`CMS-006` §6), so an author chooses it; the shape is held to lower-case
 * letters, digits and hyphens, and one already taken is answered by name rather
 * than as a unique-constraint error nobody can act on.
 *
 * A route handler inherits no segment layout, so this asks the gate itself
 * (`requireAdmin`) and answers a non-admin the `404` the console gives a guess;
 * an `Origin` present and not ours is refused before anything else, the
 * `SameSite=Lax` cookie being the first lock (`ADMIN-002`, `AUTH-001`).
 */

import { requireAdmin } from '../../../../auth/gate';
import { getConfig } from '../../../../config/index';
import { createItem } from '../../../../content/items';
import {
  CONTENT_AUDIENCES,
  CONTENT_PRODUCT_TAGS,
  CONTENT_TYPES,
  CONTENT_UPDATE_KINDS,
  type ContentAudience,
  type ContentProductTag,
  type ContentType,
  type ContentUpdateKind,
} from '../../../../db/types';
import { withRequestId } from '../../../../ops/request-context';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
};

/** Lower-case letters, digits and single hyphens: an address, not a sentence. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The period a report is filed under: a quarter or a month of a year. */
const PERIOD = /^[0-9]{4}-(?:Q[1-4]|0[1-9]|1[0-2])$/;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/** A refusal names the field, so the form can put the author back in it. */
interface Refusal {
  readonly field: string;
  readonly reason: string;
}

type Draft = {
  readonly type: ContentType;
  readonly title: string;
  readonly slug: string;
  readonly audience: ContentAudience;
  readonly kind: ContentUpdateKind | null;
  readonly product: ContentProductTag | null;
  readonly period: string | null;
};

function read(body: unknown): Draft | Refusal {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { field: 'body', reason: 'The request was not an object.' };
  }

  const { type, title, slug, audience, kind, product, period } = body as Record<string, unknown>;

  if (!isOneOf(CONTENT_TYPES, type)) {
    return { field: 'type', reason: 'Choose a report, an update or a deck.' };
  }
  if (typeof title !== 'string' || title.trim() === '') {
    return { field: 'title', reason: 'A title is required.' };
  }
  if (typeof slug !== 'string' || !SLUG.test(slug)) {
    return {
      field: 'slug',
      reason: 'An address is lower-case letters, digits and hyphens, such as 2026-q3.',
    };
  }
  if (!isOneOf(CONTENT_AUDIENCES, audience)) {
    return { field: 'audience', reason: 'Choose who may read it.' };
  }

  if (type === 'update' && !isOneOf(CONTENT_UPDATE_KINDS, kind)) {
    return { field: 'kind', reason: 'An update is an announcement, an achievement or progress.' };
  }
  if (type !== 'update' && kind !== undefined && kind !== null) {
    return { field: 'kind', reason: 'Only an update carries a kind.' };
  }

  // Optional wherever it is allowed, so absent, null and empty all pass: an
  // author who did not say what an update is about has given a real answer, and
  // it is not the same as saying it is about the company.
  if (
    type === 'update' &&
    product !== undefined &&
    product !== null &&
    product !== '' &&
    !isOneOf(CONTENT_PRODUCT_TAGS, product)
  ) {
    return { field: 'product', reason: 'A tag is one of the six products, or the company.' };
  }
  if (type !== 'update' && product !== undefined && product !== null && product !== '') {
    return { field: 'product', reason: 'Only an update carries a product.' };
  }

  if (type === 'report' && (typeof period !== 'string' || !PERIOD.test(period))) {
    return { field: 'period', reason: 'A report is filed under a period such as 2026-Q3 or 2026-07.' };
  }
  if (type !== 'report' && period !== undefined && period !== null) {
    return { field: 'period', reason: 'Only a report carries a period.' };
  }

  return {
    type,
    title: title.trim(),
    slug,
    audience,
    kind: type === 'update' ? (kind as ContentUpdateKind) : null,
    product: isOneOf(CONTENT_PRODUCT_TAGS, product) ? product : null,
    period: type === 'report' ? (period as string) : null,
  };
}

/** PostgreSQL's unique-violation code, which here means the slug is taken. */
function isSlugTaken(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

async function handleCreate(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().app.origin) {
    return json(403, { error: 'cross_origin' });
  }

  const actor = await requireAdmin(request);
  if (actor instanceof Response) {
    return actor;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_request', field: 'body' });
  }

  const draft = read(body);
  if ('field' in draft) {
    return json(400, { error: 'invalid_request', field: draft.field, detail: draft.reason });
  }

  try {
    const item = await createItem(draft);
    return json(200, { id: item.id });
  } catch (error) {
    if (isSlugTaken(error)) {
      return json(409, { error: 'slug_taken', field: 'slug' });
    }
    throw error;
  }
}

export async function POST(request: Request): Promise<Response> {
  return withRequestId(handleCreate)(request);
}
