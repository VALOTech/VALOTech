import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { headers } from 'next/headers';
import { getFormatter, getTranslations } from 'next-intl/server';

import { isLastActiveAdminAccount, personIdentity } from '../../../admin/accounts';
import { MAX_EMAIL_LENGTH } from '../../../auth/address';
import { presentedToken } from '../../../auth/gate';
import { requireInvestorPage } from '../../../auth/page-guard';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../../auth/password-policy';
import { currentSessionId, liveSessionsForAccount } from '../../../auth/session';
import { investorMailPreference } from '../../../mail/unsubscribe';

import styles from '../hall.module.css';

import { type AccountOutcome, accountOutcomeOf, OUTCOME_PARAM } from './outcomes';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hall');
  return { title: t('nav.account') };
}

/** The catalogues an answer's sentence can come from. */
type NoticeSource = 'account' | 'setPassword' | 'signIn';

/**
 * Where each answer's sentence is written.
 *
 * Four of them are already authored elsewhere and are read from there rather
 * than copied. The three the password policy gives are `setPassword`'s, because
 * they are the same three sentences the invitation form shows for the same three
 * rules and they carry the numbers those rules are made of — a second copy of
 * "use at least twelve characters" in twenty catalogues is twenty chances for
 * the two to disagree about the twelve. The exhausted limit is `signIn`'s, which
 * is the same event in the same words.
 *
 * Exhaustive over the vocabulary by type, so a new outcome arrives as a build
 * failure rather than as a blank line on the page.
 */
const NOTICE: Readonly<Record<AccountOutcome, readonly [NoticeSource, string]>> = {
  'password-changed': ['account', 'notice.passwordChanged'],
  'password-refused': ['account', 'notice.passwordRefused'],
  'password-too-short': ['setPassword', 'tooShort'],
  'password-too-long': ['setPassword', 'tooLong'],
  'password-too-common': ['setPassword', 'tooCommon'],
  'password-too-many': ['signIn', 'tooManyAttempts'],
  'identity-changed': ['account', 'notice.identityChanged'],
  'identity-changed-invitation-ended': ['account', 'notice.identityChangedInvitationEnded'],
  'identity-unchanged': ['account', 'notice.identityUnchanged'],
  'identity-name-needed': ['account', 'notice.nameNeeded'],
  'identity-email-invalid': ['account', 'notice.emailInvalid'],
  'identity-email-unavailable': ['account', 'notice.emailUnavailable'],
  'identity-too-many': ['signIn', 'tooManyAttempts'],
  'delete-name-mismatch': ['account', 'notice.deleteNameMismatch'],
  'delete-last-admin': ['account', 'notice.deleteLastAdmin'],
};

/**
 * `GET /hall/account` — everything a reader may see and change about their own
 * account without asking anybody: their name and the address they sign in with,
 * their password, the sessions they have open, whether investor mail reaches
 * them, and the deletion of the whole record (`INV-001/T3`, `AUTH-004/T2`,
 * `MAIL-002/T2`, [`ADMIN-DEC-06`](../../../../../docs/decisions-log.md#ADMIN-DEC-06)).
 *
 * **One page rather than several.** A person looking for "my account" looks in
 * one place, and a rail with an entry per setting is a rail that describes the
 * code's layout rather than the reader's question. The sections run from what
 * the record says about them, through how they get in, to leaving: the final act
 * is last, where it is found by somebody looking for it and not by somebody
 * scrolling past.
 *
 * Under `/hall` so the segment layout's gate, chrome and footer all apply
 * without this page arranging any of them, and so a session expiring here
 * returns the reader here rather than to the landing (`INV-001/T5`).
 *
 * **Server-rendered with no client script.** Every control is a plain form
 * posting to a route, which is what a page of settings needs and what keeps it
 * working on the day a bundle does not load. The cost is paid in one place: a
 * refusal cannot be shown beside the field that caused it, so each act redirects
 * back carrying what happened and the answer is read at the top of the page. The
 * vocabulary of answers is closed and a value outside it renders nothing
 * (`outcomes.ts`).
 *
 * **The deletion control is withheld from the last admin who can sign in rather
 * than offered and refused.** The act refuses it in any case — that guard is the
 * control and it re-evaluates under a lock — but a final-looking button that
 * quietly does nothing is the worst affordance on the page, so an admin who is
 * the only one left reads why instead. The extra read is asked only of an admin,
 * because an investor is never the account the hall depends on.
 */
export default async function AccountPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const actor = await requireInvestorPage();
  const token = presentedToken(await headers());
  const [
    currentId,
    sessions,
    preference,
    person,
    query,
    t,
    accountText,
    setPasswordText,
    signInText,
    sessionsText,
    mailText,
    format,
  ] = await Promise.all([
    currentSessionId(token),
    liveSessionsForAccount(actor.id),
    investorMailPreference(actor.id),
    personIdentity(actor.id),
    searchParams,
    getTranslations('hall'),
    getTranslations('account'),
    getTranslations('setPassword'),
    getTranslations('signIn'),
    getTranslations('sessions'),
    getTranslations('mailPreference'),
    getFormatter(),
  ]);

  // The gate resolved this account a moment ago, so the row is there unless an
  // admin erased it in between; rendering the page without it would be inventing
  // a name to show, and the next request will meet the sign-in form anyway.
  if (person === null) {
    return <main className={styles.main} />;
  }

  const stranding = actor.role === 'admin' ? await isLastActiveAdminAccount(actor.id) : false;
  const outcome = accountOutcomeOf(query[OUTCOME_PARAM]);
  const sentence: Readonly<Record<NoticeSource, (key: string) => string>> = {
    account: accountText,
    setPassword: setPasswordText,
    signIn: signInText,
  };
  const notice = outcome === null ? null : sentence[NOTICE[outcome][0]](NOTICE[outcome][1]);

  const stamp = (value: Date): string =>
    format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <main className={styles.main}>
      <section className={styles.lede} aria-labelledby="account-heading">
        <h1 id="account-heading" className={styles.eyebrow}>
          {t('nav.account')}
        </h1>
        {notice === null ? null : (
          <p className={styles.accountNotice} role="status">
            {notice}
          </p>
        )}
      </section>

      <section aria-labelledby="identity-heading">
        <h2 id="identity-heading" className={styles.eyebrow}>
          {accountText('identity.title')}
        </h2>
        <div className={styles.panel}>
          <p className={styles.empty}>{accountText('identity.intro')}</p>
          <form className={styles.accountForm} method="post" action="/api/account/identity">
            <div className={styles.accountField}>
              <label className={styles.accountLabel} htmlFor="identity-name">
                {accountText('identity.name')}
              </label>
              <input
                className={styles.accountInput}
                id="identity-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                defaultValue={person.name}
              />
            </div>
            <div className={styles.accountField}>
              <label className={styles.accountLabel} htmlFor="identity-email">
                {accountText('identity.email')}
              </label>
              <input
                className={styles.accountInput}
                id="identity-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={MAX_EMAIL_LENGTH}
                defaultValue={person.email}
              />
            </div>
            <p className={styles.empty}>{accountText('identity.signInChanges')}</p>
            <button type="submit" className={styles.accountButton}>
              {accountText('identity.submit')}
            </button>
          </form>
        </div>
      </section>

      <section aria-labelledby="password-heading">
        <h2 id="password-heading" className={styles.eyebrow}>
          {accountText('password.title')}
        </h2>
        <div className={styles.panel}>
          <p className={styles.empty}>{accountText('password.intro')}</p>
          <form className={styles.accountForm} method="post" action="/api/account/password">
            <div className={styles.accountField}>
              <label className={styles.accountLabel} htmlFor="password-current">
                {accountText('password.current')}
              </label>
              <input
                className={styles.accountInput}
                id="password-current"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={MAX_PASSWORD_LENGTH}
              />
            </div>
            <div className={styles.accountField}>
              <label className={styles.accountLabel} htmlFor="password-new">
                {accountText('password.new')}
              </label>
              <input
                className={styles.accountInput}
                id="password-new"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={MAX_PASSWORD_LENGTH}
                aria-describedby="password-hint"
              />
              <p className={styles.accountHint} id="password-hint">
                {setPasswordText('hint')}
              </p>
            </div>
            <p className={styles.empty}>{accountText('password.endsOthers')}</p>
            <button type="submit" className={styles.accountButton}>
              {accountText('password.submit')}
            </button>
          </form>
        </div>
      </section>

      <section aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" className={styles.eyebrow}>
          {sessionsText('title')}
        </h2>
        <div className={styles.panel}>
          <p className={styles.empty}>{sessionsText('intro')}</p>
          <ul className={styles.stream}>
            {sessions.map((session) => (
              // The current row is marked from the cookie's own session id
              // rather than from anything the list carries, so the list never
              // has to hold a token to know which row is this device.
              <li
                key={session.id}
                className={styles.streamRow}
                aria-current={session.id === currentId ? 'true' : undefined}
              >
                <div className={styles.streamIdentity}>
                  {session.id === currentId ? (
                    <span className={styles.role}>{sessionsText('current')}</span>
                  ) : null}
                  <span className={styles.itemTitle}>
                    {sessionsText('began')} {stamp(session.createdAt)}
                  </span>
                </div>
                <span className={styles.meta}>
                  {sessionsText('lastActive')} {stamp(session.lastSeenAt)} · {sessionsText('expires')}{' '}
                  {stamp(session.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
          <form className={styles.accountAct} method="post" action="/api/account/sessions/all">
            <button type="submit" className={styles.accountButton}>
              {sessionsText('endEverywhere')}
            </button>
            <p className={styles.empty}>{sessionsText('endEverywhereHint')}</p>
          </form>
        </div>
      </section>

      <section aria-labelledby="mail-heading">
        <h2 id="mail-heading" className={styles.eyebrow}>
          {mailText('title')}
        </h2>
        <div className={styles.panel}>
          <p className={styles.claim}>{preference.stopped ? mailText('stopped') : mailText('on')}</p>
          {/* A stop an admin set says so, and the reason they typed is not shown:
              that text is written by staff about a person, and this page is read
              by the person it is about (`MAIL-002` §3). */}
          {preference.stopped && preference.source === 'admin' ? (
            <p className={styles.empty}>{mailText('stoppedByCompany')}</p>
          ) : null}
          <p className={styles.empty}>{mailText('stops')}</p>
          <p className={styles.empty}>{mailText('keeps')}</p>
          <form className={styles.accountAct} method="post" action="/api/account/mail">
            <input type="hidden" name="intent" value={preference.stopped ? 'resume' : 'stop'} />
            <button type="submit" className={styles.accountButton}>
              {preference.stopped ? mailText('resume') : mailText('stop')}
            </button>
          </form>
        </div>
      </section>

      <section aria-labelledby="delete-heading">
        <h2 id="delete-heading" className={styles.eyebrow}>
          {accountText('delete.title')}
        </h2>
        <div className={styles.panel}>
          <p className={styles.empty}>{accountText('delete.goes')}</p>
          <p className={styles.empty}>{accountText('delete.stays')}</p>
          <p className={styles.empty}>{accountText('delete.final')}</p>
          {stranding ? (
            <p className={styles.accountRefusal}>{accountText('delete.lastAdmin')}</p>
          ) : (
            <form className={styles.accountForm} method="post" action="/api/account/delete">
              <div className={styles.accountField}>
                <label className={styles.accountLabel} htmlFor="delete-confirm">
                  {accountText('delete.confirmLabel', { name: person.name })}
                </label>
                <input
                  className={styles.accountInput}
                  id="delete-confirm"
                  name="confirmName"
                  type="text"
                  autoComplete="off"
                  required
                />
              </div>
              <button type="submit" className={styles.accountFinalButton}>
                {accountText('delete.submit')}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
