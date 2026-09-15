import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { erasureCounts, personIdentity, type PersonIdentity } from '../../../../admin/accounts';
import { requireAdminPage } from '../../../../auth/page-guard';
import { type LiveSession, liveSessionsForAccount } from '../../../../auth/session';
import { type AccountDeckAccess, grantedDecksForAccount } from '../../../../content/decks';
import type { InvestorType } from '../../../../db/types';
import { investorMailPreference } from '../../../../mail/unsubscribe';

import { EndSessions, PersonActions } from './actions';
import styles from './person.module.css';
import { StopSending } from './stop-sending';

/**
 * One person, answering the question the list cannot (`ADMIN-001/T2`): what can
 * this person reach, and what would happen if I removed them.
 *
 * Five sections in the order an admin reads them. **Identity** is the record
 * itself, which is a name, an address, a role, a state, two timestamps and
 * whether the company has said this person invested or is deciding, and nothing
 * else — there is no notes field to show because there is no notes field to write
 * into (`DATA-R01`). **Access** is every deck granted, with the pin and when it
 * was last opened, which is the column that separates a grant somebody uses from
 * one nobody remembered to revoke. **Sessions** is the ways in that are live
 * right now, and the control that ends them. **Actions** is what can be done
 * about any of it, ending with the two controls that write the record rather than
 * act on the access it grants: the correction that fixes a wrong name or address
 * (`ADMIN-001/T10`), and the investor type that orders this person's hall landing
 * and gates nothing (`ADMIN-001/T11`, `INV-DEC-02`). **Investor mail** is last
 * because it is about the messages that leave rather than the access that lets
 * somebody in: whether the list is stopping them, and the control that stops them
 * with the reason (`MAIL-002/T4`).
 *
 * Deleting is the only one of them nothing undoes, so the page reads
 * what it would cost before offering it (`ADMIN-001/T4`): the confirmation states
 * how much goes and how much stays, and then asks for the name to be typed. The
 * counts are read here, with the sections, rather than when the panel opens —
 * a confirmation that fetched its own numbers could open before they arrived and
 * would be a blank where the weight of the act belongs.
 *
 * Every timestamp is UTC and spelled out as one, because an admin comparing two
 * accounts needs one clock rather than their own. The `/admin` layout's role check
 * gates the page; the actor is resolved again only because the page has to know
 * whether the person it is about is the person reading it (`ADMIN-DEC-01` refuses
 * an admin acting on their own access, so the control is not offered).
 */

/** A timestamp as UTC, or the word for not having one. */
function when(at: Date | null): string {
  return at === null ? 'never' : at.toISOString();
}

/**
 * What the record says about having invested, in the words the control offers.
 * `null` reads as nobody having said rather than as a blank, because a blank in
 * a definition list is indistinguishable from a value that failed to load, and
 * this is the one field whose unanswered state is a statement of its own
 * (`INV-DEC-02`).
 */
function investorTypeSaid(investorType: InvestorType | null): string {
  if (investorType === null) {
    return 'nobody has said';
  }

  return investorType === 'current' ? 'has invested' : 'still deciding';
}

function Identity({ person }: { readonly person: PersonIdentity }): ReactElement {
  return (
    <section aria-labelledby="identity-heading">
      <h2 id="identity-heading">Identity</h2>
      {/* Each pair is wrapped, which HTML admits inside a `dl`, and the columns are
          laid out on the wrapper rather than on the list itself: a `display: grid`
          applied to a `dl` costs it its term-and-definition semantics in some
          screen readers, and the pairs are the whole content of this section
          (`A11Y-R02`). */}
      <dl className={styles.identity}>
        <div className={styles.pair}>
          <dt>Name</dt>
          <dd>{person.name}</dd>
        </div>
        <div className={styles.pair}>
          <dt>Address</dt>
          <dd>{person.email}</dd>
        </div>
        <div className={styles.pair}>
          <dt>Role</dt>
          <dd>{person.role}</dd>
        </div>
        <div className={styles.pair}>
          <dt>State</dt>
          <dd>{person.state}</dd>
        </div>
        <div className={styles.pair}>
          <dt>Created (UTC)</dt>
          <dd className={styles.when}>{person.createdAt.toISOString()}</dd>
        </div>
        <div className={styles.pair}>
          <dt>Last sign-in (UTC)</dt>
          <dd className={styles.when}>{when(person.lastSignIn)}</dd>
        </div>
        <div className={styles.pair}>
          <dt>Investor type</dt>
          <dd>{investorTypeSaid(person.investorType)}</dd>
        </div>
      </dl>
    </section>
  );
}

function Access({ decks }: { readonly decks: readonly AccountDeckAccess[] }): ReactElement {
  return (
    <section aria-labelledby="access-heading">
      <h2 id="access-heading">Access</h2>
      {decks.length === 0 ? (
        <p>No deck is granted to this person.</p>
      ) : (
        <table className={styles.rows}>
          <thead>
            <tr>
              <th scope="col">Deck</th>
              <th scope="col">Version</th>
              <th scope="col">Granted (UTC)</th>
              <th scope="col">Last opened (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {decks.map((deck) => (
              <tr key={deck.deckId}>
                <td>{deck.deckTitle}</td>
                <td>{deck.pinnedVersion === null ? 'current' : `pinned to ${deck.pinnedVersion}`}</td>
                <td className={styles.when}>{deck.grantedAt.toISOString()}</td>
                <td className={styles.when}>{when(deck.lastOpenedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Sessions({
  accountId,
  sessions,
  self,
}: {
  readonly accountId: string;
  readonly sessions: readonly LiveSession[];
  /** Whether the admin reading the page is the person it is about. */
  readonly self: boolean;
}): ReactElement {
  return (
    <section aria-labelledby="sessions-heading">
      <h2 id="sessions-heading">Sessions</h2>
      {sessions.length === 0 ? (
        <p>No live session, so there is nothing to end.</p>
      ) : (
        <>
          <table className={styles.rows}>
            <thead>
              <tr>
                <th scope="col">Started (UTC)</th>
                <th scope="col">Last seen (UTC)</th>
                <th scope="col">Lapses (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td className={styles.when}>{session.createdAt.toISOString()}</td>
                  <td className={styles.when}>{session.lastSeenAt.toISOString()}</td>
                  <td className={styles.when}>{session.expiresAt.toISOString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <EndSessions accountId={accountId} self={self} />
        </>
      )}
    </section>
  );
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const reader = await requireAdminPage();
  const { id } = await params;

  const person = await personIdentity(id);
  if (person === null) {
    // The same answer a path that names nothing gives, for an id no account holds
    // and for one that could not be an id at all.
    return notFound();
  }

  const [decks, sessions, erasure, mail] = await Promise.all([
    grantedDecksForAccount(person.id),
    liveSessionsForAccount(person.id),
    erasureCounts(person.id),
    investorMailPreference(person.id),
  ]);
  const self = reader.id === person.id;

  return (
    <>
      <p className={styles.back}>
        <a href="/admin/accounts">All accounts</a>
      </p>
      <h1>{person.name}</h1>

      <Identity person={person} />
      <Access decks={decks} />
      <Sessions accountId={person.id} sessions={sessions} self={self} />

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading">Actions</h2>
        <PersonActions
          accountId={person.id}
          name={person.name}
          email={person.email}
          state={person.state}
          investorType={person.investorType}
          self={self}
          erasure={erasure}
        />
      </section>

      <section aria-labelledby="investor-mail-heading">
        <h2 id="investor-mail-heading">Investor mail</h2>
        <StopSending
          accountId={person.id}
          stopped={mail.stopped ? { at: mail.at.toISOString(), source: mail.source } : null}
        />
      </section>
    </>
  );
}
