import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { localeDraft } from '../../../../../../content/locales';
import { bcp47, DEFAULT_LOCALE, isLocale } from '../../../../../../i18n/locales';

import { ReviewScreen, StartTranslation } from './review';
import styles from './review.module.css';

export const metadata: Metadata = { title: 'Review a translation' };

// The console is English only (`ADMIN-002`), including the names of the
// languages it manages, from the platform's own display-name table.
const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

/**
 * `GET /admin/content/<id>/locales/<locale>` (`CMS-005/T4`) — one language of one
 * item, source beside translation.
 *
 * It is always the **latest** revision: the open draft while one is open, and
 * otherwise the newest published. That is the revision `seedLocale` writes and
 * the one an admin is working on — an earlier published revision is reachable
 * only by withdrawing back to it, and translating it would be translating text
 * the hall is not showing.
 *
 * English has no page here, because the authored language holds no locale row:
 * the revision's own blocks are it (`CMS-005` section 3). A locale outside the
 * twenty is a `404` rather than an empty screen — it is a URL nothing in the
 * console links to.
 *
 * The `/admin` segment layout has already resolved the admin (`ADMIN-002`), and
 * this read is not reader-scoped, so the page needs no actor of its own.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<ReactElement> {
  const { id, locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const language = LANGUAGE_NAMES.of(bcp47(locale)) ?? locale;

  if (locale === DEFAULT_LOCALE) {
    return (
      <div>
        <a className={styles.crumb} href={`/admin/content/${id}/locales`}>
          ← Translations
        </a>
        <h1>{language}</h1>
        <p className={styles.subject}>
          English is the language this content is written in, so there is nothing to translate here.
          Editing it is the editor’s job, and every other language is seeded from it.
        </p>
      </div>
    );
  }

  const draft = await localeDraft(id, locale);

  return (
    <div>
      <div className={styles.head}>
        <a className={styles.crumb} href={`/admin/content/${id}/locales`}>
          ← Translations
        </a>
        <h1>{language}</h1>
        {draft === null ? (
          <p className={styles.subject}>
            The latest version of this content, in {language}.
          </p>
        ) : (
          <>
            <p className={styles.subject}>
              The {draft.published ? 'published' : 'draft'} version of this content, in {language}.
              Each field shows the English beside the words that replace it.
            </p>
            <span className={`${styles.state} ${draft.state === 'reviewed' ? styles.done : styles.pending}`}>
              {draft.state === 'reviewed' ? 'Reviewed — served to readers' : 'Not reviewed — shown to nobody'}
            </span>
          </>
        )}
      </div>

      {draft === null ? (
        <StartTranslation itemId={id} locale={locale} language={language} />
      ) : (
        <ReviewScreen
          itemId={id}
          locale={locale}
          language={language}
          source={draft.source}
          translation={draft.translation}
          reviewed={draft.state === 'reviewed'}
        />
      )}
    </div>
  );
}
