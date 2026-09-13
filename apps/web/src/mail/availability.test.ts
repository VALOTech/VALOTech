/**
 * Whether a send may happen, and what is said when it may not (`MAIL-001/T7`).
 *
 * Pure — the credential and the setting both arrive as arguments — so the whole
 * table of four cases is exercised without an environment or a database. That is
 * the point of the function being pure: the case that matters most is the one
 * where both are absent, and an environment-driven test could only reach one of
 * the four per process.
 */

import { describe, expect, it } from 'vitest';

import { Secret, type MailConfig } from '../config/index';

import { TURNED_OFF, sendingAvailability, type MailAvailability } from './availability';

const CREDENTIAL = {
  available: true,
  url: new Secret('smtps://user:pass@mail.example.test:465'),
  from: 'VALO Tech <investors@valotech.test>',
} as const satisfies MailConfig;

const ABSENT_REASON = 'SMTP_URL is not set; invitations and messages are shown on screen to send by hand';

const NO_CREDENTIAL = { available: false, unavailable: ABSENT_REASON } as const satisfies MailConfig;

/** The reason a send was withheld; an available answer has none and fails here. */
function reasonOf(answer: MailAvailability): string {
  if (answer.available) {
    throw new Error('the send was permitted, so there is no reason to read');
  }
  return answer.reason;
}

describe('sendingAvailability (MAIL-001/T7)', () => {
  it('permits a send when the credential is there and the setting is on', () => {
    const answer = sendingAvailability(CREDENTIAL, true);

    expect(answer.available).toBe(true);
    // The positive answer carries the credential, so the one caller that opens a
    // connection takes it from the check that admitted it.
    expect(answer.available && answer.mail).toBe(CREDENTIAL);
  });

  it('withholds a send with the configuration’s own reason when there is no credential', () => {
    expect(reasonOf(sendingAvailability(NO_CREDENTIAL, true))).toBe(ABSENT_REASON);
  });

  it('withholds a send, naming the setting, when an operator has turned sending off', () => {
    expect(reasonOf(sendingAvailability(CREDENTIAL, false))).toBe(TURNED_OFF);
    expect(TURNED_OFF).toContain('mail.enabled');
  });

  it('names the credential first when both are absent — the switch alone would not make a send possible', () => {
    expect(reasonOf(sendingAvailability(NO_CREDENTIAL, false))).toBe(ABSENT_REASON);
  });
});
