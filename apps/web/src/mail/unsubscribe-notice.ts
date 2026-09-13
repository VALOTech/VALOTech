/**
 * The line every bulk message carries, and the same line as the composer
 * previews it (`MAIL-002/T2`).
 *
 * It is here, apart from the token and the writes, because the composer is a
 * client component and the rest of the unsubscribe is `node:crypto` and a
 * database handle. A component importing those would drag them into the browser
 * bundle; a second spelling of the sentence would let the preview and the send
 * drift, which is the one thing `MAIL-001` §3 says a preview may never do.
 *
 * The link is its own paragraph for the reason the transactional messages give:
 * a URL a client wraps across two lines is a URL that does not work, and this is
 * the line the regime requires to work (`DATA-R04`).
 *
 * The sentence after it is the same promise the unsubscribe page keeps — what
 * stops and what does not — because somebody deciding whether to press it is
 * owed that before the click rather than after.
 */

/** The path the link is built on, which is also the route that answers it. */
export const UNSUBSCRIBE_PATH = '/unsubscribe';

/**
 * The notice for one recipient's link, appended to a bulk body as its own
 * paragraphs.
 */
export function unsubscribeNotice(link: string): string {
  return [
    'You are receiving this because you have access to the VALO Tech investor room.',
    'To stop receiving investor mail, open this link:',
    link,
    'It stops investor updates and nothing else: a password reset, an invitation, or a notice about a message sent to you still reaches you, because those answer something you or an administrator asked for.',
  ].join('\n\n');
}

/**
 * The notice as the composer shows it, with the per-person token replaced by a
 * phrase that says what is there. A real token in a preview would be one
 * person's link on a screen where it means nothing, and an admin who copied it
 * would unsubscribe them.
 */
export function unsubscribeNoticePreview(origin: string): string {
  return unsubscribeNotice(`${origin}${UNSUBSCRIBE_PATH}/each-person-gets-their-own-link`);
}
