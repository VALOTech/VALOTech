/**
 * The path `POST /api/account/identity` is mounted at (`ADMIN-DEC-06`).
 *
 * The act is `handleAccountIdentity`'s. This adds the request id every log line
 * and every downstream call is tied to (`OPS-002`) and nothing else.
 */

import { withRequestId } from '../../../../ops/request-context';

import { handleAccountIdentity } from './handler';

export const POST = withRequestId(handleAccountIdentity);
