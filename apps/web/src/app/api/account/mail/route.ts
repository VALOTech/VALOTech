/**
 * The path `POST /api/account/mail` is mounted at (`MAIL-002` §3).
 *
 * The act is `handleAccountMail`'s. This adds the request id every log line and
 * every downstream call is tied to (`OPS-002`) and nothing else.
 */

import { withRequestId } from '../../../../ops/request-context';

import { handleAccountMail } from './handler';

export const POST = withRequestId(handleAccountMail);
