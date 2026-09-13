/**
 * The path `POST /admin/mail/send` is mounted at (`MAIL-001` §3).
 *
 * The whole of the act is `handleSend`'s, which opens the SMTP connection the
 * send runs over and closes it at the end (`MAIL-001/T8`). This adds the request
 * id every log line and every downstream call is tied to (`OPS-002`) and nothing
 * else, so the policy lives in one place and cannot drift between the handler and
 * the path it answers on.
 */

import { withRequestId } from '../../../../ops/request-context';

import { handleSend } from './handler';

export async function POST(request: Request): Promise<Response> {
  return withRequestId(handleSend)(request);
}
