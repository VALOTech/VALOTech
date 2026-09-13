import type { ReactElement } from 'react';

import { listAccounts } from '../../../../admin/accounts';
import { type MailLogFilter, recentMail } from '../../../../mail/log';
import type { MailLogState } from '../../../../db/types';

import styles from './log.module.css';

/**
 * `GET /admin/mail/log` (`MAIL-002/T6`) — what was sent, to whom, when, and what
 * the mail server said about it. Narrowed by recipient and by day.
 *
 * **Three states, and none of them is `delivered`.** SMTP answers once, when it
 * takes a message, and says nothing afterwards, so `accepted` is the strongest
 * thing this system can honestly record (`MAIL-002` §3). A row still `queued`
 * after a send has ended is not a failure and is not a success: it is an attempt
 * whose outcome the server never reported, which happens when a send stops
 * between the row and the answer — a closed tab, a restarted process, a dropped
 * connection. It is presented as exactly that, because reading it as a failure
 * is what would lead somebody to send the same message twice, and reading it as
 * a success is what would let somebody quietly go unreached.
 *
 * **The body is not here because it is not stored.** The subject, the recipient
 * and the time answer what this log is asked; a table of messages about named
 * people with a two-year life is what not storing it avoids (`DATA-R03`).
 *
 * **The recipient is a name, never an address.** The log is keyed by account and
 * the address lives on the account and goes with it (`DATA-R02`); an address
 * rendered here would be one in a browser cache and in a browser's history.
 *
 * There is no control that writes. A row is written by the send that made it and
 * moved by that send alone, and a view that could edit one could make a message
 * that went look like one that did not.
 *
 * The `/admin` layout's role check gates the page; it does not re-check.
 */

/** How many rows one screen holds. The log itself is bounded only by the sweep. */
const WINDOW = 100;

/** A query-string value as one trimmed string, or nothing. */
function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first !== undefined && first.trim() !== '' ? first.trim() : undefined;
}

/** What each state means to somebody reading the row, rather than to the sender. */
const MEANS: Readonly<Record<MailLogState, string>> = {
  queued: 'no outcome reported',
  accepted: 'accepted by the mail server',
  failed: 'refused',
};

export default async function MailLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const filter: MailLogFilter = {
    accountId: one(params.recipient),
    from: one(params.from),
    to: one(params.to),
  };
  const [rows, accounts] = await Promise.all([recentMail(filter, WINDOW), listAccounts()]);
  const narrowed =
    filter.accountId !== undefined || filter.from !== undefined || filter.to !== undefined;

  return (
    <>
      <p className={styles.back}>
        <a href="/admin/mail">Back to Mail</a>
      </p>
      <h1>Mail log</h1>

      <form className={styles.filters} method="get">
        <label>
          Recipient
          {/* A list of names rather than an id field: an admin asks about a
              person, and the id is what the query needs, not what they hold. */}
          <select name="recipient" defaultValue={filter.accountId ?? ''}>
            <option value="">anyone</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From (UTC)
          <input name="from" type="date" defaultValue={filter.from ?? ''} />
        </label>
        <label>
          To (UTC)
          <input name="to" type="date" defaultValue={filter.to ?? ''} />
        </label>
        <button type="submit">Filter</button>
      </form>

      <p className={styles.note}>
        <strong>Accepted</strong> is the mail server taking the message; it is not confirmation that
        anything arrived, and nothing reports that afterwards. <strong>Refused</strong> is the reply
        that turned it away. <strong>No outcome reported</strong> is an attempt whose answer never
        came back — a send that stopped part-way leaves these, and they are neither sent nor unsent.
        A bounce, if there is one, arrives in the send mailbox as a notice somebody has to open.
      </p>

      {rows.length === 0 ? (
        <p>{narrowed ? 'No messages match these filters.' : 'No messages yet.'}</p>
      ) : (
        <table className={styles.rows}>
          <thead>
            <tr>
              <th scope="col">When (UTC)</th>
              <th scope="col">Recipient</th>
              <th scope="col">Kind</th>
              <th scope="col">Subject</th>
              <th scope="col">State</th>
              <th scope="col">Reply</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.at.toISOString()}</td>
                <td>{row.recipientName}</td>
                <td>{row.kind}</td>
                <td>{row.subject}</td>
                <td>{MEANS[row.state]}</td>
                <td className={styles.reply}>{row.error ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
