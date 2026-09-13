import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { isReadingRole, previewFor, type ReadingRole } from '../../../../../content/preview';
import { RenderedBlocks } from '../../../../../content/render';
import { DEFAULT_LOCALE, bcp47, dir, isLocale } from '../../../../../i18n/locales';

import styles from './preview.module.css';

export const metadata: Metadata = { title: 'Preview' };

const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

const ROLE_LABEL: Readonly<Record<ReadingRole, string>> = {
  admin: 'you, an admin',
  investor: 'an investor',
  public: 'a visitor who has not signed in',
};

const NOT_ADMITTED: Readonly<Record<ReadingRole, string>> = {
  admin: 'An admin reads every audience, so this line should be unreachable.',
  investor:
    'An investor sees nothing here. This is granted to named investors only, and an investor who is not named on the grant is not one of them.',
  public:
    'A visitor who has not signed in sees nothing here — not this page, not its title, not that it exists.',
};

/**
 * `GET /admin/content/<id>/preview?as=…&locale=…` (`CMS-004/T1`, `CMS-004/T2`)
 * — the latest revision as a reader would get it.
 *
 * It differs from what a reader gets in exactly one way, and the bar says so:
 * it reads the **latest** revision rather than the published one. Everything
 * else is the reader's — the same audience rule, the same locale fallback and
 * the same renderer (`content/render.tsx`), each shared rather than rebuilt,
 * because a preview that decides any of them for itself is a preview that can
 * disagree with what publishes.
 *
 * **The bar is not part of the page.** It sits above the rendered document, in
 * its own colours, saying which role and which language are being shown; the
 * document below it is what a reader receives and carries no preview chrome of
 * its own.
 *
 * **Admin-only, with no token** (`CMS-004/T2`). This is a page under `/admin`,
 * so the segment layout's `requireAdminPage` has already answered an investor
 * the console's `404` and a signed-out reader the sign-in redirect
 * (`ADMIN-002/T1`) before this renders. The only parameters are the role and
 * the language, each checked against a closed set — a value outside either is a
 * `404` rather than a guess, so no crafted URL widens what is shown, and there
 * is nothing here that outlives the session that opened it (`CMS-R02`).
 */
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { id } = await params;
  const query = await searchParams;

  const asked = typeof query.as === 'string' ? query.as : 'admin';
  if (!isReadingRole(asked)) {
    notFound();
  }

  const wanted = typeof query.locale === 'string' ? query.locale : DEFAULT_LOCALE;
  if (!isLocale(wanted)) {
    notFound();
  }

  const preview = await previewFor(id, asked, wanted);
  if (preview === null) {
    notFound();
  }

  // `localeFor` answers with the locale asked for or the authored language, both
  // of which are in the list; narrowed rather than asserted, so a value that is
  // not names itself instead of claiming a tag it does not have. The direction
  // rides with it: Arabic and Urdu are read right to left (`I18N-R02`), and a
  // preview that laid them out the other way would show an admin a page no
  // reader receives.
  const served = isLocale(preview.locale) ? preview.locale : DEFAULT_LOCALE;
  const language = LANGUAGE_NAMES.of(bcp47(served)) ?? preview.locale;

  return (
    <>
      <div className={styles.bar} role="note">
        <p className={styles.headline}>
          Preview — the <strong>{preview.published ? 'published' : 'unpublished'}</strong> latest
          version, as {ROLE_LABEL[asked]} would read it in {language}.
        </p>
        <p className={styles.detail}>
          {preview.published
            ? 'This is the version readers are being served today.'
            : 'Readers are not being served this version. Publishing is on the item’s own screen.'}
          {preview.fellBack
            ? ` No reviewed translation exists for ${wanted}, so the authored language is shown — which is what a reader would get.`
            : ''}
        </p>
        <p className={styles.detail}>
          <a href={`/admin/content/${id}`}>← Back to the item</a>
          {' · '}
          <a href={`/admin/content/${id}/preview?as=public&locale=${wanted}`}>As a visitor</a>
          {' · '}
          <a href={`/admin/content/${id}/preview?as=investor&locale=${wanted}`}>As an investor</a>
          {' · '}
          <a href={`/admin/content/${id}/preview?as=admin&locale=${wanted}`}>As yourself</a>
        </p>
      </div>

      {preview.blocks === null ? (
        <p className={styles.refused}>{NOT_ADMITTED[asked]}</p>
      ) : (
        <article className={styles.document} lang={bcp47(served)} dir={dir(served)}>
          <h1>{preview.item.title}</h1>
          <RenderedBlocks blocks={preview.blocks} />
        </article>
      )}
    </>
  );
}
