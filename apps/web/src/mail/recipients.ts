/**
 * Resolving a chosen set of accounts into the recipients a send will reach
 * (`MAIL-001/T2`, `MAIL-001/T3`, `DATA-R04`).
 *
 * An admin selects accounts from the list; this turns that selection into a
 * confirmed list of names, and the list — not the selection criterion — is what
 * the send then uses, because a criterion re-evaluated at send time reaches
 * whoever matches then, which is not who the admin looked at. A suspended account
 * is excluded, and an unsubscribed one is excluded with the reason (`MAIL-002`'s
 * list, read here), so the admin sees who will not be reached and why rather than
 * discovering it from a message that never went. This resolves the audience for a
 * deliberate send; transactional mail does not pass through it, so an unsubscribe
 * never suppresses an invitation (`AUTH-003`).
 */

import { getDb } from '../db/index';

/** A recipient a send will reach: enough to address the message, and no more. */
export interface Recipient {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

/** An account the admin chose that the send will not reach, and why. */
export interface ExcludedRecipient {
  readonly id: string;
  readonly name: string;
  readonly reason: 'suspended' | 'unsubscribed';
}

/** The confirmed recipients and the excluded accounts, each ordered by name. */
export interface ResolvedRecipients {
  readonly recipients: readonly Recipient[];
  readonly excluded: readonly ExcludedRecipient[];
}

/**
 * Resolve the chosen account ids into recipients and exclusions. Suspended wins
 * over unsubscribed when an account is both: a suspended account has no access to
 * restore, so it is the stronger fact to show.
 */
export async function resolveRecipients(accountIds: readonly string[]): Promise<ResolvedRecipients> {
  if (accountIds.length === 0) {
    return { recipients: [], excluded: [] };
  }

  const db = getDb();
  const ids = [...accountIds];

  const accounts = await db
    .selectFrom('accounts')
    .select(['id', 'name', 'email', 'state'])
    .where('id', 'in', ids)
    .orderBy('name')
    .execute();

  const unsubscribed = new Set(
    (await db.selectFrom('unsubscribes').select('account_id').where('account_id', 'in', ids).execute()).map(
      (row) => row.account_id,
    ),
  );

  const recipients: Recipient[] = [];
  const excluded: ExcludedRecipient[] = [];

  for (const account of accounts) {
    if (account.state === 'suspended') {
      excluded.push({ id: account.id, name: account.name, reason: 'suspended' });
    } else if (unsubscribed.has(account.id)) {
      excluded.push({ id: account.id, name: account.name, reason: 'unsubscribed' });
    } else {
      recipients.push({ id: account.id, name: account.name, email: account.email });
    }
  }

  return { recipients, excluded };
}
