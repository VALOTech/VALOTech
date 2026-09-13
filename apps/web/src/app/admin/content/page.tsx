import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { itemsForConsole } from '../../../content/items';

import styles from './content.module.css';

export const metadata: Metadata = { title: 'Content' };

// The console is English only (`ADMIN-002/T5`), and one clock: an admin
// comparing two rows needs UTC rather than their own.
const CHANGED = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const TYPE_LABEL: Readonly<Record<string, string>> = {
  report: 'Report',
  update: 'Update',
  deck: 'Deck',
};

const AUDIENCE_LABEL: Readonly<Record<string, string>> = {
  public: 'Anyone',
  investor: 'Investors',
  granted: 'Named investors',
};

/**
 * `GET /admin/content` (`CMS-002/T8`) — what an admin has written, and the way
 * into each of it.
 *
 * Two cells lead somewhere and they lead to different places: the title opens
 * the item's own screen, where a draft becomes something a reader sees
 * (`CMS-004`), and the languages cell opens the translation grid (`CMS-005`).
 * Everything else on the row is there to choose between rows.
 *
 * **Published and drafted are two facts rather than one word.** An item can be
 * published and carry later work nobody has seen, and that is exactly the state
 * an author comes here to find; a single status column would have to pick one of
 * them and would hide the other.
 *
 * The order is the read's, not the page's: most recently changed first, so the
 * thing somebody came back for is above the fold rather than behind a sort. The
 * `/admin` segment layout has already resolved the admin (`ADMIN-002/T1`), and
 * this read is a staff read that composes no audience predicate, so the page
 * needs no actor of its own.
 */
export default async function ContentPage(): Promise<ReactElement> {
  const items = await itemsForConsole();

  return (
    <>
      <h1>Content</h1>

      {/* Two ways in, because they answer different questions. The composer
          takes a finished update and files it in one act (POST-001); the
          general form begins an empty item of any type, which is what a
          report or a deck wants. */}
      <p>
        <a href="/admin/updates">Write an update</a> · <a href="/admin/content/new">Start something new</a>
      </p>

      {items.length === 0 ? (
        <p className={styles.empty}>
          Nothing written yet. An update, a report or a deck begins here, and stays invisible to
          every reader until it is published.
        </p>
      ) : (
        <table className={styles.content}>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Type</th>
              <th scope="col">Readable by</th>
              <th scope="col">Published</th>
              <th scope="col">Unpublished draft</th>
              <th scope="col">Languages</th>
              <th scope="col">Changed (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <th scope="row" className={styles.titleCell}>
                  <a href={`/admin/content/${item.id}`}>{item.title}</a>
                  <span className={styles.slug}>{item.slug}</span>
                </th>
                <td>
                  {TYPE_LABEL[item.type] ?? item.type}
                  {item.period === null ? null : <span className={styles.qualifier}>{item.period}</span>}
                  {item.kind === null ? null : <span className={styles.qualifier}>{item.kind}</span>}
                </td>
                <td>{AUDIENCE_LABEL[item.audience] ?? item.audience}</td>
                <td className={item.published ? styles.yes : styles.no}>{item.published ? 'Yes' : 'No'}</td>
                <td className={item.hasOpenDraft ? styles.pending : styles.no}>
                  {item.hasOpenDraft ? 'Yes' : 'No'}
                </td>
                <td className={styles.figure}>
                  <a href={`/admin/content/${item.id}/locales`}>
                    {item.reviewedLocales === 0
                      ? 'English only'
                      : `${item.reviewedLocales} reviewed`}
                  </a>
                </td>
                <td className={styles.figure}>{CHANGED.format(item.changedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
