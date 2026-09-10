/**
 * The mail port and the message composer (`MAIL-001/T1`).
 *
 * Sending is the one act in this product that leaves it irrecoverably — a
 * message in an inbox cannot be withdrawn — so the design separates rendering
 * from sending: the message is composed to its exact bytes first, and the same
 * bytes are what a preview shows and what the port transmits. A preview that is
 * approximate is a review of something other than what ships.
 *
 * The port is one method behind which a single SMTP adapter lives
 * (`MAIL-DEC-01`, `MAIL-001/T8`). It stays a port because the adapter is the part
 * most likely to change and because a port is what lets the send path be tested
 * without a mail server. There is no templating in the port: `compose` runs
 * before `send`, so the message is data by the time it reaches the wire.
 *
 * Over SMTP the receipt carries only the queue id the server returned on its
 * `250` and nothing else — there is no delivery confirmation and no later
 * callback, so `MAIL-002` records that a message was *accepted for delivery* and
 * never that it *arrived*. Saying it that way is the difference between a record
 * and a claim.
 */

/** A message rendered to the exact bytes a send transmits, and a preview shows. */
export interface ComposedMessage {
  readonly subject: string;
  /** The plain-text half — what a corporate mail client shows, not an afterthought. */
  readonly text: string;
  /** The HTML half, generated from the same source as the text. */
  readonly html: string;
}

/** What an accepted send returns: the queue id from the SMTP `250`, and nothing more. */
export interface Receipt {
  readonly queueId: string;
}

/**
 * The one method: a recipient address, the rendered subject, plain text and HTML
 * together, and a receipt back. The adapter behind it (`MAIL-001/T8`) opens one
 * TLS-secured connection per send and fails rather than falling back to
 * plaintext; absent a credential the port is unavailable and says why
 * (`MAIL-001/T7`, `CRED-001`).
 */
export interface Mailer {
  send(to: string, subject: string, text: string, html: string): Promise<Receipt>;
}

/** Escape the five characters that would otherwise be read as HTML markup. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Render a subject and a plain-text body into the message a send will carry.
 *
 * The text half is the body verbatim: the author wrote plain text and that is
 * what a plain-text client shows. The HTML half is generated from the *same*
 * source — the body split into paragraphs on blank lines, each escaped so its
 * content cannot be read as markup, with a single newline inside a paragraph
 * becoming a line break. Both halves come from one source, so a preview of one
 * is a faithful preview of the send, and no structure is invented that the author
 * did not write.
 */
export function compose(subject: string, body: string): ComposedMessage {
  const paragraphs = body
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>\n')}</p>`);

  return { subject, text: body, html: paragraphs.join('\n') };
}
