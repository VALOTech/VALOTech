/**
 * Reading a catalogue for a locale that is not the request's (`AUTH-003/T3`).
 *
 * Every other localised surface in this application renders inside a request and
 * takes its language from the reader in front of it (`request.ts`). A
 * transactional message does not: an invitation is composed while an admin is on
 * the screen, in the language of the person who will open it tomorrow, and a
 * reset is composed for somebody who is not signed in at all. So the locale
 * arrives as a value rather than from the ambient request, and the catalogue is
 * loaded for it.
 *
 * The same dynamic import `request.ts` uses, so the twenty files are one set with
 * one loader and a message added for the screen is already present for the mail.
 * `createTranslator` is next-intl's non-React entry point and gives the same ICU
 * rendering a component gets (`I18N-R03`), which is why the plural and the
 * substitutions in a mail body are not hand-rolled here.
 */

import { createTranslator } from 'next-intl';

import type { Locale } from './locales';

/**
 * What a caller may substitute into a message. Strings and numbers only, which
 * is every value a transactional message carries — a name, a link, a count of
 * days — and excludes the rich-text callbacks a component may pass, because a
 * mail body is text and has nowhere to put a React element.
 */
export type MessageValues = Readonly<Record<string, string | number>>;

/** One namespace's messages in one locale, resolved by key with ICU applied. */
export type Translator = (key: string, values?: MessageValues) => string;

/**
 * The translator for one namespace of one locale.
 *
 * No fallback is applied here and none is needed: the parity gate
 * (`dictionary.test.ts`) holds every locale to English's exact key set, so a key
 * present in `en` is present in all twenty. Choosing *which* locale to ask for —
 * the account's if it has one, English if it does not — belongs to the caller,
 * because that decision is about what is known of a person and not about what a
 * file contains.
 */
export async function translatorFor(locale: Locale, namespace: string): Promise<Translator> {
  const messages = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>;
  const translate = createTranslator({ locale, messages, namespace });

  return (key, values) => translate(key as never, values as never);
}
