/**
 * `GET /admin/accounts/<id>/export` — everything held about one person, as a
 * file an admin sends them (`LEGAL-GLOBAL-001/T2`, `LEGAL-GLOBAL-001` §3).
 *
 * The gathering is `exportPersonData`'s and the scoping with it; this handler
 * refuses a caller who is not an admin, names the file, and marks the answer
 * unstorable. `GET` rather than `POST` because it writes nothing and because a
 * link is a control that works with no script — an admin answering a request
 * under a thirty-day clock should not be one broken bundle away from being
 * unable to.
 *
 * **An admin action, and deliberately no self-service route.** A link to a
 * person's whole record is a credential in an inbox, so nothing here mails one
 * and nothing lets the person fetch it themselves: they ask, and an admin sends
 * the file (`DATA-R02`).
 *
 * **The filename carries the account id and never the address.** A file named
 * for somebody's e-mail is that address written into a downloads folder, a
 * backup of it and any mail it is attached to, which is a copy of personal data
 * nobody decided to make (`DATA-R01`).
 *
 * **It is not audited, and that is the console's rule rather than an omission.**
 * The trail records privileged *writes* (`DATA-R02`); the person page already
 * shows an admin nearly all of this and is not audited either, so auditing the
 * convenient path and not the manual one would record where the data was easy to
 * read rather than where it was read. Auditing privileged reads is a policy for
 * the whole console to take or not.
 */

import { exportPersonData } from '../../../../../admin/accounts';
import { requireAdmin } from '../../../../../auth/gate';
import { withRequestId } from '../../../../../ops/request-context';

const NO_SUCH_ACCOUNT = JSON.stringify({ error: 'no_such_account' });

async function handleExport(request: Request, accountId: string): Promise<Response> {
  const actor = await requireAdmin(request);
  if (actor instanceof Response) {
    return actor;
  }

  const held = await exportPersonData(accountId);
  if (held === null) {
    return new Response(NO_SUCH_ACCOUNT, {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // Indented, because a person reading the file they were sent is the point of
  // it; the machine-readable form a portability request asks for is JSON, not
  // JSON nobody can read. Dates serialise as UTC instants (`OPS-R02`).
  return new Response(JSON.stringify(held, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="valotech-${accountId}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  return withRequestId((scoped: Request) => handleExport(scoped, id))(request);
}
