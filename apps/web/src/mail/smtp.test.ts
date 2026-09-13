/**
 * The SMTP adapter (`MAIL-001/T8`).
 *
 * Pure, and deliberately so. What this file proves is everything about the
 * adapter that is *this* system's decision: the connection it asks for, the fact
 * that every security property is fixed here rather than read from the URL, that
 * one connection is built per send and reused for every recipient and closed at
 * the end, and that a receipt carries the queue id and nothing else.
 *
 * What it does not prove, and cannot without a mail server, is `nodemailer`'s
 * half: that a pooled transport holding a single connection opens one TCP
 * connection, that `requireTLS` really aborts against a server which will not
 * upgrade, and that `rejectUnauthorized` really refuses a certificate that does
 * not verify. Those rest on the library, and adding a test-only SMTP server to
 * prove them is a dependency nobody has agreed to. The line between the two is
 * drawn here rather than blurred: an options object is checked, a handshake is
 * not.
 */

import { describe, expect, it } from 'vitest';

import { Secret } from '../config/index';

import type { AvailableMail } from './availability';
import {
  SmtpUrlError,
  openSmtpMailer,
  queueIdOf,
  smtpTransportOptions,
  type SmtpMessage,
  type SmtpSendInfo,
  type SmtpTransport,
  type SmtpTransportOptions,
} from './smtp';

const FROM = 'VALO Tech <investors@valotech.test>';

function mailWith(url: string): AvailableMail {
  return { available: true, url: new Secret(url), from: FROM };
}

/** A transport that opens nothing, remembering what it was built with and handed. */
interface FakeTransport extends SmtpTransport {
  readonly handed: readonly SmtpMessage[];
  readonly closes: () => number;
}

function fakeTransport(reply: SmtpSendInfo): FakeTransport {
  const handed: SmtpMessage[] = [];
  let closed = 0;

  return {
    handed,
    closes: () => closed,
    async sendMail(message: SmtpMessage): Promise<SmtpSendInfo> {
      handed.push(message);
      return reply;
    },
    close(): void {
      closed += 1;
    },
  };
}

describe('smtpTransportOptions (MAIL-001/T8)', () => {
  it('asks for implicit TLS on 465 from an smtps:// URL, with the credentials it carries', () => {
    expect(smtpTransportOptions('smtps://post:hunter2@mail.example.test:465')).toEqual({
      host: 'mail.example.test',
      port: 465,
      secure: true,
      requireTLS: true,
      tls: { rejectUnauthorized: true },
      pool: true,
      maxConnections: 1,
      maxMessages: Number.POSITIVE_INFINITY,
      auth: { user: 'post', pass: 'hunter2' },
    } satisfies SmtpTransportOptions);
  });

  it('asks for STARTTLS on 587 from an smtp:// URL', () => {
    const options = smtpTransportOptions('smtp://post:hunter2@mail.example.test:587');

    expect(options.secure).toBe(false);
    expect(options.port).toBe(587);
    expect(options.requireTLS).toBe(true);
  });

  it('demands TLS on both shapes and never offers a way to continue without it', () => {
    for (const url of ['smtps://mail.example.test:465', 'smtp://mail.example.test:587']) {
      const options = smtpTransportOptions(url);

      // `requireTLS` is what refuses a server that will not upgrade; the absence
      // of `ignoreTLS` and `opportunisticTLS` is what leaves no way back to
      // plaintext. Read as keys, so setting either to `false` would still fail —
      // the property is that this adapter never mentions them.
      expect(options.requireTLS).toBe(true);
      expect(Object.keys(options)).not.toContain('ignoreTLS');
      expect(Object.keys(options)).not.toContain('opportunisticTLS');
    }
  });

  it('verifies the server’s certificate on both shapes', () => {
    for (const url of ['smtps://mail.example.test:465', 'smtp://mail.example.test:587']) {
      expect(smtpTransportOptions(url).tls.rejectUnauthorized).toBe(true);
    }
  });

  it('holds one connection for the whole send and never retires it for having carried enough', () => {
    const options = smtpTransportOptions('smtps://mail.example.test:465');

    expect(options.pool).toBe(true);
    expect(options.maxConnections).toBe(1);
    expect(options.maxMessages).toBe(Number.POSITIVE_INFINITY);
  });

  it('takes the conventional port for the scheme when the URL names none', () => {
    expect(smtpTransportOptions('smtps://mail.example.test').port).toBe(465);
    expect(smtpTransportOptions('smtp://mail.example.test').port).toBe(587);
  });

  it('leaves any other port alone — only the two crossed pairings are knowably broken', () => {
    expect(smtpTransportOptions('smtps://mail.example.test:2465').port).toBe(2465);
    expect(smtpTransportOptions('smtp://mail.example.test:2525').port).toBe(2525);
  });

  it('refuses a scheme and port that contradict each other rather than timing out at send time', () => {
    expect(() => smtpTransportOptions('smtp://mail.example.test:465')).toThrow(SmtpUrlError);
    expect(() => smtpTransportOptions('smtps://mail.example.test:587')).toThrow(SmtpUrlError);
  });

  it('refuses anything that is not an SMTP URL', () => {
    for (const url of ['http://mail.example.test', 'smtps:///nowhere', 'not a url at all', '']) {
      expect(() => smtpTransportOptions(url)).toThrow(SmtpUrlError);
    }
  });

  it('refuses port zero, which URL parsing lets through and no socket can use', () => {
    expect(() => smtpTransportOptions('smtps://mail.example.test:0')).toThrow(SmtpUrlError);
  });

  it('hands the server the password rather than its percent-encoding', () => {
    const options = smtpTransportOptions('smtps://po%40st:p%40ss%3Aword%2F1@mail.example.test:465');

    expect(options.auth).toEqual({ user: 'po@st', pass: 'p@ss:word/1' });
  });

  it('sends unauthenticated only when the URL carries no user at all', () => {
    expect(smtpTransportOptions('smtps://mail.example.test:465').auth).toBeUndefined();
    // A password with no user authenticates as nobody, which surfaces as somebody
    // else's spam folder rather than as an error.
    expect(() => smtpTransportOptions('smtps://:hunter2@mail.example.test:465')).toThrow(SmtpUrlError);
  });

  it('reads nothing about security from the URL, so a URL asking for a weaker connection asks nobody', () => {
    const options = smtpTransportOptions(
      'smtps://mail.example.test:465?rejectUnauthorized=false&ignoreTLS=true&secure=false',
    );

    expect(options.secure).toBe(true);
    expect(options.requireTLS).toBe(true);
    expect(options.tls.rejectUnauthorized).toBe(true);
  });
});

describe('queueIdOf (MAIL-001/T8)', () => {
  it('keeps the server’s identifier and drops the status codes, which are the same on every message', () => {
    expect(queueIdOf('250 2.0.0 Ok: queued as D6EA0C0A9')).toBe('Ok: queued as D6EA0C0A9');
    expect(queueIdOf('250 OK id=1abcd-0001-XY')).toBe('OK id=1abcd-0001-XY');
  });

  it('reads the last line of a multi-line reply, which is the one carrying the outcome', () => {
    expect(queueIdOf('250-first line\r\n250 2.0.0 queued as ABC123')).toBe('queued as ABC123');
  });

  it('names an absent id rather than leaving the row claiming one it does not hold', () => {
    expect(queueIdOf(undefined)).toBe('no queue id in the reply');
    expect(queueIdOf('')).toBe('no queue id in the reply');
    expect(queueIdOf('250 ')).toBe('no queue id in the reply');
  });

  it('masks an address a server echoed, because the value is kept two years', () => {
    const id = queueIdOf('250 2.0.0 Ok: queued for investor@example.test as D6EA0C0A9');

    expect(id).not.toContain('investor@example.test');
    expect(id).toContain('[redacted]');
  });

  it('caps a verbose reply so it cannot fill a column kept two years', () => {
    // Ordinary words, because a single run of forty or more opaque characters is
    // what the scrubber masks as a token — which is itself the right answer, and
    // would hide what is being measured here.
    const id = queueIdOf(`250 ${'ab '.repeat(150)}`);

    expect(id).toHaveLength(203);
    expect(id.endsWith('...')).toBe(true);
  });
});

describe('openSmtpMailer (MAIL-001/T8)', () => {
  const accepted: SmtpSendInfo = {
    accepted: ['investor@example.test'],
    rejected: [],
    response: '250 2.0.0 Ok: queued as D6EA0C0A9',
  };

  it('builds one connection for the send, reuses it for every recipient, and closes it once', async () => {
    let built = 0;
    const transport = fakeTransport(accepted);
    const session = openSmtpMailer(mailWith('smtps://mail.example.test:465'), () => {
      built += 1;
      return transport;
    });

    await session.mailer.send('one@example.test', 'Q3', 'text', '<p>text</p>');
    await session.mailer.send('two@example.test', 'Q3', 'text', '<p>text</p>');
    await session.mailer.send('three@example.test', 'Q3', 'text', '<p>text</p>');
    session.close();

    // One transport for three messages: opening one per message is how a mailbox
    // provider decides this is a script.
    expect(built).toBe(1);
    expect(transport.handed).toHaveLength(3);
    expect(transport.closes()).toBe(1);
  });

  it('sends from MAIL_FROM, to the one recipient, carrying both halves', async () => {
    const transport = fakeTransport(accepted);
    const session = openSmtpMailer(mailWith('smtps://mail.example.test:465'), () => transport);

    await session.mailer.send('one@example.test', 'Q3 is live', 'the text half', '<p>the text half</p>');

    expect(transport.handed[0]).toEqual({
      from: FROM,
      to: 'one@example.test',
      subject: 'Q3 is live',
      text: 'the text half',
      html: '<p>the text half</p>',
    });
  });

  it('receipts the queue id and nothing else — there is no delivery to report', async () => {
    const session = openSmtpMailer(mailWith('smtps://mail.example.test:465'), () => fakeTransport(accepted));

    const receipt = await session.mailer.send('one@example.test', 'Q3', 'text', '<p>text</p>');

    expect(Object.keys(receipt)).toEqual(['queueId']);
    expect(receipt.queueId).toBe('Ok: queued as D6EA0C0A9');
  });

  it('refuses to receipt a hand-off the server took for nobody', async () => {
    const session = openSmtpMailer(mailWith('smtps://mail.example.test:465'), () =>
      fakeTransport({ accepted: [], rejected: ['one@example.test'], response: '550 5.1.1 unknown' }),
    );

    await expect(session.mailer.send('one@example.test', 'Q3', 'text', '<p>text</p>')).rejects.toThrow(
      /no recipient/,
    );
  });

  it('refuses a URL it cannot make a secured connection from, before anything is opened', () => {
    let built = 0;

    expect(() =>
      openSmtpMailer(mailWith('smtp://mail.example.test:465'), () => {
        built += 1;
        return fakeTransport(accepted);
      }),
    ).toThrow(SmtpUrlError);
    expect(built).toBe(0);
  });
});
