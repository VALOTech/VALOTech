/**
 * `POST /api/auth/register` — the route, which is `handleRegister` behind a
 * request id (`AUTH-005/T2`).
 *
 * The handler lives beside this rather than in it, for the reason the reset
 * request separates the two: what is worth testing here is that the answer goes
 * out before the message does, and observing that needs a delivery a test can
 * hold open. A route file exports HTTP methods and nothing else, so the seam has
 * nowhere to live in this file.
 */

import { withRequestId } from '../../../../ops/request-context';

import { handleRegister } from './handler';

export const POST = withRequestId(handleRegister);
