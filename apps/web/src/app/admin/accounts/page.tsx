import type { ReactElement } from 'react';

import { listAccounts } from '../../../admin/accounts';

import styles from './accounts.module.css';

/**
 * Who can sign in, and which of them has stopped (`ADMIN-001/T1`).
 *
 * Five columns and no sixth: a name, an address, a role, a state, and when the
 * person last signed in. The record holds nothing else about them and this page
 * is why (`DATA-R01`) — a surface with a notes column is a surface somebody
 * writes a note into.
 *
 * The order carries the meaning, so the read performs it rather than the page:
 * stalest first, with the accounts that have never signed in at the top. What a
 * reader does here is find the person who stopped coming, and that person is
 * above the fold rather than behind a sort.
 *
 * The timestamp is rendered as UTC, spelled out in the header, because an admin
 * comparing two accounts needs one clock and not their own. The `/admin`
 * layout's role check gates the page; it does not re-check.
 *
 * The name is the way to the person's page (`ADMIN-001/T2`), which is where the
 * question this list raises — why has nobody signed in — is actually answered.
 */
export default async function AccountsPage(): Promise<ReactElement> {
  const accounts = await listAccounts();

  return (
    <>
      <h1>Accounts</h1>

      {accounts.length === 0 ? (
        <p>No accounts yet. An account comes to exist by being invited.</p>
      ) : (
        <table className={styles.accounts}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Address</th>
              <th scope="col">Role</th>
              <th scope="col">State</th>
              <th scope="col">Last sign-in (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>
                  <a href={`/admin/accounts/${account.id}`}>{account.name}</a>
                </td>
                <td>{account.email}</td>
                <td>{account.role}</td>
                <td>{account.state}</td>
                <td className={styles.when}>
                  {account.last_sign_in === null ? 'never' : account.last_sign_in.toISOString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
