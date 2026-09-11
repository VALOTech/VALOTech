import { describe, expect, it } from 'vitest';

import { checkPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password-policy';

describe('checkPassword', () => {
  it('refuses a password below the length floor', () => {
    expect(checkPassword('short')).toBe('too-short');
    expect(checkPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe('too-short');
  });

  it('accepts a password at the floor that is not common', () => {
    expect('r7pX2mQ9vLkW'.length).toBe(MIN_PASSWORD_LENGTH);
    expect(checkPassword('r7pX2mQ9vLkW')).toBeNull();
  });

  it('refuses a password above the ceiling and accepts one at it', () => {
    expect(checkPassword('a1B2'.repeat(60))).toBe('too-long'); // 240 chars, not common
    expect('a1B2'.repeat(60).length).toBeGreaterThan(MAX_PASSWORD_LENGTH);
    const atCeiling = `zQ${'x7'.repeat((MAX_PASSWORD_LENGTH - 2) / 2)}`;
    expect(atCeiling.length).toBe(MAX_PASSWORD_LENGTH);
    expect(checkPassword(atCeiling)).toBeNull();
  });

  it('refuses a common password that clears the length floor', () => {
    expect(checkPassword('password1234')).toBe('too-common');
    expect(checkPassword('qwertyuiop123')).toBe('too-common');
    expect(checkPassword('123456789012')).toBe('too-common');
  });

  it('folds case before the common-list check', () => {
    expect(checkPassword('PASSWORD1234')).toBe('too-common');
    expect(checkPassword('Password1234')).toBe('too-common');
  });

  it('reports length before commonness, so the person fixes length first', () => {
    // "password" is common but short; length is the first thing to fix.
    expect(checkPassword('password')).toBe('too-short');
  });
});
