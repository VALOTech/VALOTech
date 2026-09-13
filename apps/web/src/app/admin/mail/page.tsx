import type { ReactElement } from 'react';

import { listAccounts } from '../../../admin/accounts';
import { sendingIsPossible } from '../../../mail/availability';
import { resolveRecipients } from '../../../mail/recipients';

import { MailComposer } from './composer';

/**
 * Writing a message to investors, and seeing exactly who it would reach
 * (`MAIL-001/T4`, `MAIL-001/T7`).
 *
 * The audience is resolved here, on the server, from every account there is — so
 * the admin ticks names off a list that has already been through the suppression
 * rules and can see who is missing from it and why (`MAIL-001/T2`,
 * `MAIL-001/T3`). A filter that produced a criterion would reach whoever matched
 * at send time, which is not who was looked at; a list of names cannot do that.
 *
 * **The list resolves whether or not a send is possible.** With no credential,
 * or with sending turned off, the composer still works and this list is still
 * drawn; only the send control is withheld, and it says why. An admin who cannot
 * see who they would have mailed cannot prepare the mail while the credential is
 * being arranged, and that is the whole of what absence is allowed to cost
 * (`CRED-001`, `SEC-R05`).
 *
 * Addresses stay on the server. The composer needs a name to show and an id to
 * send, and nothing here needs the address: the send addresses the message from
 * the row it re-resolves, and an address rendered into this page would be an
 * address in a browser cache and a browser's history (`DATA-R01`, `DATA-R02`).
 * The account list is where an admin checks an address.
 *
 * The `/admin` layout's role check gates the page; it does not re-check.
 */
export default async function MailPage(): Promise<ReactElement> {
  const accounts = await listAccounts();
  const audience = await resolveRecipients(accounts.map((account) => account.id));
  const availability = await sendingIsPossible();

  return (
    <>
      <h1>Mail</h1>

      <MailComposer
        recipients={audience.recipients.map((recipient) => ({ id: recipient.id, name: recipient.name }))}
        excluded={audience.excluded.map((account) => ({
          id: account.id,
          name: account.name,
          reason: account.reason,
        }))}
        unavailable={availability.available ? null : availability.reason}
      />
    </>
  );
}
