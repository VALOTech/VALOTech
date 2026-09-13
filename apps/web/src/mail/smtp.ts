/**
 * The SMTP adapter behind the `Mailer` port (`MAIL-001/T8`, `MAIL-DEC-03`).
 *
 * One connection is opened per send and reused for every recipient, then closed
 * — opening one per message is how a mailbox provider decides this is a script
 * and starts refusing. That is what `pool` with a single connection and no
 * message limit buys: the first message opens the connection, every later one
 * rides it, and `close()` ends it. The lifetime belongs to the caller rather
 * than to the port, which is why this hands back a session rather than a bare
 * `Mailer`: a send is a loop over recipients, and the connection spans the loop.
 *
 * **TLS is not negotiable and there is no fallback.** `smtps://` connects with
 * implicit TLS; `smtp://` sends STARTTLS and fails when the server will not
 * upgrade, because `requireTLS` is set and `opportunisticTLS` — the option whose
 * whole purpose is to continue unencrypted — is never set. Certificates are
 * verified. A silent downgrade is how an investor's address and a subject line
 * cross the network in the clear, and the point of stating all three explicitly
 * rather than leaning on a library default is that a later edit turning one off
 * is a visible edit.
 *
 * Everything about the connection's security is decided here and nothing is read
 * from the URL beyond the host, the port and the credentials, so a `SMTP_URL`
 * carrying a query that asks for a weaker connection asks nobody.
 *
 * A receipt carries the queue id from the server's `250` and nothing else. There
 * is no delivery confirmation and no later callback, so what this can honestly
 * report is that the company's own mail server took the message — `MAIL-002`
 * records *accepted*, never *arrived* (`MAIL-001` §3). The id is taken from the
 * server's reply rather than from `messageId`, which is the Message-ID this
 * process generated and is not something the server said.
 */

import { createTransport } from 'nodemailer';

import { scrub } from '../ops/scrub';

import type { AvailableMail } from './availability';
import type { Mailer, Receipt } from './mailer';

/** One message as it goes to the transport: the envelope sender and both halves. */
export interface SmtpMessage {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** What the transport says came back: who it was taken for, and the server's reply. */
export interface SmtpSendInfo {
  readonly accepted?: readonly string[] | undefined;
  readonly rejected?: readonly string[] | undefined;
  readonly response?: string | undefined;
}

/**
 * The transport this adapter drives, narrowed to the two methods it uses.
 *
 * Narrow because it is also the seam a test drives: the connection lifetime is a
 * claim about how many transports a send builds and when it closes them, and that
 * is checkable here without a mail server. What cannot be checked without one —
 * that a pooled transport holding a single connection really opens one TCP
 * connection, and that the TLS options below really refuse a server that will not
 * upgrade — is `nodemailer`'s behaviour and is named as such rather than implied.
 */
export interface SmtpTransport {
  sendMail(message: SmtpMessage): Promise<SmtpSendInfo>;
  close(): void;
}

/** How a transport comes to be, so a test can supply one that opens no socket. */
export type TransportFactory = (options: SmtpTransportOptions) => SmtpTransport;

/** The options a transport is built with, every one of them decided here. */
export interface SmtpTransportOptions {
  readonly host: string;
  readonly port: number;
  /** TLS from the first byte — `smtps://`, conventionally port 465. */
  readonly secure: boolean;
  /** STARTTLS is demanded; a server that will not upgrade fails the send. */
  readonly requireTLS: true;
  readonly tls: { readonly rejectUnauthorized: true };
  readonly pool: true;
  readonly maxConnections: 1;
  readonly maxMessages: number;
  readonly auth?: { readonly user: string; readonly pass: string };
}

/** A `SMTP_URL` that cannot be turned into a connection this adapter would make. */
export class SmtpUrlError extends Error {
  constructor(problem: string) {
    super(`SMTP_URL ${problem}`);
    this.name = 'SmtpUrlError';
  }
}

/** The conventional ports, each bound to the one way TLS is reached on it. */
const IMPLICIT_TLS_PORT = 465;
const STARTTLS_PORT = 587;

/**
 * One connection for the whole send: the pool holds a single connection and
 * never retires it for having carried enough messages. `nodemailer` defaults to
 * a hundred, which would be a second connection on a long list — rare at this
 * size, and rare is worse than never for a property a mailbox provider reads as
 * a script.
 */
const MESSAGES_PER_CONNECTION = Number.POSITIVE_INFINITY;

/** The longest queue id kept; an SMTP reply line is bounded far below this. */
const MAX_QUEUE_ID = 200;

/** What a receipt says when the server accepted the message and named no id. */
const NO_QUEUE_ID = 'no queue id in the reply';

/**
 * Turn `SMTP_URL` into the connection this adapter will make, or refuse it.
 *
 * The scheme decides how TLS is reached and the port defaults to the one that
 * convention pairs with it. The two crossed pairings are refused rather than
 * attempted: a `smtp://` on 465 would send STARTTLS to a port that speaks TLS
 * from the first byte, and a `smtps://` on 587 would start a handshake with a
 * server waiting for a greeting. Both end in a timeout or an unreadable protocol
 * error at send time, and a refusal naming the contradiction is what an operator
 * can act on. Any other port is left alone — a mailbox on 2465 is somebody's
 * real deployment, and only the two crossed pairs are knowably broken.
 *
 * The credentials are percent-decoded, because a password containing `@`, `:` or
 * `/` has to be percent-encoded to sit in a URL at all and what the server must
 * receive is the password rather than its encoding. A password with no user is
 * refused: it authenticates as nobody, and sending unauthenticated because a
 * username was mistyped is a failure that surfaces as somebody else's spam
 * folder.
 */
export function smtpTransportOptions(url: string): SmtpTransportOptions {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return refuse('is not a URL');
  }

  if (parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') {
    return refuse(`must be smtp:// or smtps://, not ${parsed.protocol}//`);
  }

  const secure = parsed.protocol === 'smtps:';
  const host = parsed.hostname;
  if (host === '') {
    return refuse('names no host');
  }

  // URL parsing refuses a port that is not a number and one above 65535, so zero
  // is the one unusable value that reaches here — and it would fail as a socket
  // error at send time rather than as something an operator can read.
  const port = parsed.port === '' ? (secure ? IMPLICIT_TLS_PORT : STARTTLS_PORT) : Number(parsed.port);
  if (port < 1) {
    return refuse('names port 0, which is not a port');
  }

  if (secure && port === STARTTLS_PORT) {
    return refuse(`asks for implicit TLS on ${STARTTLS_PORT}, which expects STARTTLS — use smtp:// on that port`);
  }
  if (!secure && port === IMPLICIT_TLS_PORT) {
    return refuse(`asks for STARTTLS on ${IMPLICIT_TLS_PORT}, which is TLS from the first byte — use smtps:// on that port`);
  }

  if (parsed.username === '' && parsed.password !== '') {
    return refuse('carries a password and no username');
  }

  const auth =
    parsed.username === ''
      ? undefined
      : { user: decodeURIComponent(parsed.username), pass: decodeURIComponent(parsed.password) };

  return {
    host,
    port,
    secure,
    requireTLS: true,
    tls: { rejectUnauthorized: true },
    pool: true,
    maxConnections: 1,
    maxMessages: MESSAGES_PER_CONNECTION,
    ...(auth === undefined ? {} : { auth }),
  };
}

function refuse(problem: string): never {
  throw new SmtpUrlError(problem);
}

/**
 * The queue id out of the server's `250`, made safe to keep for two years.
 *
 * A multi-line reply ends with the line that carries the outcome, so the last
 * one is read. The status code and the enhanced status code are stripped because
 * they are the same on every accepted message and say nothing about which one;
 * what is left is the server's own identifier in whatever shape it uses, which
 * has no cross-server format worth guessing at — parsing for one vendor's would
 * silently drop another's.
 *
 * A `250` for a message is not a place an address appears, but the value lands
 * in a column kept two years and shown on the admin log, so it goes through the
 * shared scrubber for the same reason a refusal does (`DATA-R02`) and is capped.
 * An empty reply is named rather than left blank, so a row never claims a queue
 * id it does not hold.
 */
export function queueIdOf(response: string | undefined): string {
  const lines = (response ?? '').split(/\r?\n/).filter((line) => line.trim() !== '');
  const last = lines[lines.length - 1] ?? '';
  const text = last
    .replace(/^\s*\d{3}[ -]/, '')
    .replace(/^\s*\d\.\d\.\d\s+/, '')
    .trim();
  const masked = scrub(text);
  const capped = masked.length > MAX_QUEUE_ID ? `${masked.slice(0, MAX_QUEUE_ID)}...` : masked;

  return capped === '' ? NO_QUEUE_ID : capped;
}

/** A connection held open across one send, and the port that rides it. */
export interface MailerSession {
  readonly mailer: Mailer;
  /** Ends the connection. Called once, after the last recipient, however the send ended. */
  close(): void;
}

/** The production transport: `nodemailer`, built from the options decided above. */
function nodemailerTransport(options: SmtpTransportOptions): SmtpTransport {
  const transport = createTransport({ ...options });

  return {
    sendMail: (message: SmtpMessage) => transport.sendMail({ ...message }),
    close: () => transport.close(),
  };
}

/**
 * Open one connection and hand back the port that sends over it.
 *
 * The session is closed by whoever opened it, in a `finally`, so a refused
 * recipient or an abandoned send leaves no connection held against the mailbox.
 *
 * A hand-off that the server took for nobody is refused rather than receipted.
 * `nodemailer` already rejects when every recipient is refused, and with one
 * recipient per message that is every case there is; the check stands because a
 * receipt is this system's only record that a message was accepted, and a receipt
 * for a message nobody accepted would be the one lie `MAIL-002` cannot detect
 * afterwards. The refusal names no address — it is `mail_log.error`'s text
 * (`DATA-R02`).
 */
export function openSmtpMailer(
  mail: AvailableMail,
  createTransportFor: TransportFactory = nodemailerTransport,
): MailerSession {
  const transport = createTransportFor(smtpTransportOptions(mail.url.value));

  const mailer: Mailer = {
    async send(to: string, subject: string, text: string, html: string): Promise<Receipt> {
      const info = await transport.sendMail({ from: mail.from, to, subject, text, html });

      if ((info.accepted ?? []).length === 0) {
        throw new Error('the server took the message for no recipient');
      }

      return { queueId: queueIdOf(info.response) };
    },
  };

  return { mailer, close: () => transport.close() };
}
