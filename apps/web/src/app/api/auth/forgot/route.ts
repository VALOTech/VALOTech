/**
 * `POST /api/auth/forgot` — the route, which is `handleForgot` behind a request
 * id (`SEC-001/T4`).
 *
 * The handler lives beside this rather than in it for the reason the mail send
 * route separates the two: the thing worth testing here is that the answer goes
 * out before the message does, and observing that needs a delivery a test can
 * hold open. A route file exports HTTP methods and nothing else, so the seam has
 * nowhere to live in this file.
 */

import { withRequestId } from '../../../../ops/request-context';

import { handleForgot } from './handler';

export const POST = withRequestId(handleForgot);
