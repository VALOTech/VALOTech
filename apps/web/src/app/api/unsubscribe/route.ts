/**
 * The path `POST /api/unsubscribe` is mounted at (`MAIL-002` §3).
 *
 * The act is `handleUnsubscribe`'s. This adds the request id every log line and
 * every downstream call is tied to (`OPS-002`) and nothing else, so the policy
 * lives in one place and cannot drift between the handler and the path it
 * answers on.
 */

import { withRequestId } from '../../../ops/request-context';

import { handleUnsubscribe } from './handler';

export const POST = withRequestId(handleUnsubscribe);
