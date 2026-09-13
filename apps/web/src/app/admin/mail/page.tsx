import type { ReactElement } from 'react';

import { listAccounts } from '../../../admin/accounts';
import { getConfig } from '../../../config/index';
import { sendingIsPossible } from '../../../mail/availability';
import { resolveRecipients } from '../../../mail/recipients';
import { unsubscribeNoticePreview } from '../../../mail/unsubscribe-notice';

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
 * **The sender is named, because it is where bounces arrive.** SMTP answers once
 * at hand-off and says nothing afterwards, so a message that fails later becomes
 * a delivery-status notice in the `MAIL_FROM` mailbox and nothing in this system
 * reads it (`MAIL-002` §3). Naming that mailbox on the screen where a send is
 * pressed is what turns an invisible failure into one an admin knows to go and
 * look for — and what they do about it is the stop-sending control on the
 * person's page (`MAIL-002/T4`).
 *
 * **The unsubscribe line is previewed with the rest of the message**, because
 * every investor message carries one and a preview that omitted it would be a
 * preview of something other than what leaves. The token in it is stood in for:
 * it differs per recipient, and a real one on this screen would be one person's
 * link an admin could press.
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

      {/* The log is reached from here rather than from the rail: the rail is one
          entry per section (`ADMIN-002` §3), and what was sent is a question
          about this section rather than a section of its own. */}
      <p>
        <a href="/admin/mail/log">What has been sent</a>
      </p>

      <MailComposer
        recipients={audience.recipients.map((recipient) => ({ id: recipient.id, name: recipient.name }))}
        excluded={audience.excluded.map((account) => ({
          id: account.id,
          name: account.name,
          reason: account.reason,
        }))}
        unavailable={availability.available ? null : availability.reason}
        sender={availability.available ? availability.mail.from : null}
        unsubscribeNotice={unsubscribeNoticePreview(getConfig().app.origin)}
      />
    </>
  );
}
