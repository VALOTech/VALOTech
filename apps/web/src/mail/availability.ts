/**
 * Whether a send can happen at all, and what to say when it cannot
 * (`MAIL-001/T7`, `CRED-001`, `SEC-R05`).
 *
 * Two separate things stop a send, and both are answered here so the screen that
 * disables the control and the route that refuses the request read one answer. A
 * page greying a button on one rule while the route enforced another is how a
 * control comes to look available and refuse, or look refused and send.
 *
 * **The credential is whether sending is possible; the setting is whether it is
 * permitted.** `SMTP_URL` absent means there is no mailbox to hand a message to;
 * `mail.enabled` false means an operator turned sending off without a deploy and
 * without touching the credential (`CFG-001`), which is the lever that exists for
 * the afternoon something is going wrong. The credential is reported first when
 * both are true, because turning the setting back on would not make a send
 * possible and an admin told only about the switch would fix the wrong thing.
 *
 * Absence never stops the rest: the composer works and the recipient list
 * resolves, so an admin can prepare the message and see exactly who it would have
 * reached while the credential is being arranged. Only the send is withheld, and
 * it is withheld with the reason on it rather than as a control that does nothing
 * when pressed.
 */

import { getConfig, type MailConfig } from '../config/index';
import { getSettings } from '../config/settings';

/**
 * The mail configuration once it carries a credential — what an adapter needs
 * and what nothing holds until the answer below says sending is possible.
 */
export type AvailableMail = Extract<MailConfig, { available: true }>;

/**
 * Whether a send may proceed, and the sentence shown on the control when it may
 * not. The credential rides the positive answer, so the one caller that opens a
 * connection receives it from the check that admitted it rather than reaching for
 * the configuration again and guarding a case the check already excluded.
 */
export type MailAvailability =
  | { readonly available: true; readonly mail: AvailableMail }
  | { readonly available: false; readonly reason: string };

/** What the screen and the route both say when an operator has turned sending off. */
export const TURNED_OFF =
  'Sending is turned off in Settings (mail.enabled). Turn it back on there to send.';

/**
 * The answer, from the credential the process booted with and the setting in
 * force. Pure in both, so the whole table of cases is exercised without an
 * environment or a database.
 */
export function sendingAvailability(mail: MailConfig, enabled: boolean): MailAvailability {
  if (!mail.available) {
    return { available: false, reason: mail.unavailable };
  }

  if (!enabled) {
    return { available: false, reason: TURNED_OFF };
  }

  return { available: true, mail };
}

/**
 * The same answer for the running application. The setting is read through its
 * own cache, so a send checks what is in force within seconds of an operator
 * changing it rather than what was in force at boot.
 */
export async function sendingIsPossible(): Promise<MailAvailability> {
  return sendingAvailability(getConfig().mail, await getSettings().get('mail.enabled'));
}
