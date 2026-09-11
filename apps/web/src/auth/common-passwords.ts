/**
 * The passwords a set-password form refuses outright (`AUTH-003`): the ones that
 * appear at the top of every breach corpus, so an attacker guesses them first.
 *
 * Held lowercased and compared lowercased, because `Password1234` and
 * `password1234` are one guess to anyone trying the list. The twelve-character
 * floor in `password-policy.ts` already turns away the most famous entries —
 * `password`, `123456`, `qwerty` are all shorter — so the value here is the
 * backstop for the ones that clear the floor: a common word padded to length, a
 * keyboard walk, a repeated digit run. The famous short ones are kept anyway, so
 * the refusal does not depend on the floor never moving.
 *
 * A curated list rather than an exhaustive one: it is the set a maintainer can
 * read and justify, and a larger corpus can replace it behind `checkPassword`
 * without touching a caller. This is a declarative table (§5.3) — its point is
 * that it can be read top to bottom.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  // The short classics, kept though the length floor already refuses them.
  'password', 'passw0rd', 'p@ssw0rd', '123456', '1234567', '12345678', '123456789',
  'qwerty', 'qwertyuiop', 'abc123', 'monkey', 'letmein', 'dragon', '111111', 'iloveyou',
  'master', 'sunshine', 'shadow', 'ashley', 'football', 'baseball', 'welcome', 'jesus',
  'ninja', 'mustang', 'password1', 'superman', 'batman', 'trustno1', 'hello', 'login',
  'admin', 'root', 'guest', 'starwars', 'whatever', 'princess', 'freedom', 'computer',
  // Twelve characters or more — the ones that clear the floor and still rank.
  '123456789012', '1234567890123', '12345678901234', '123456789012345', '000000000000',
  '111111111111', '123123123123', '121212121212', '112233445566', '123321123321',
  'password1234', 'password12345', 'password1234567', 'passwordpassword', 'password123456',
  'passw0rd1234', 'p@ssw0rd1234', 'passwordpass', 'mypasswordisthis', 'letmein12345',
  'letmein123456', 'welcome123456', 'welcome1welcome', 'iloveyou1234', 'iloveyou12345',
  'iloveyouforever', 'qwertyuiop123', 'qwertyuiop1234', 'qwertyuiopasdf', 'qwertyuiopasdfgh',
  'qwerty123456', 'qwerty1234567', 'qwertyuiopqwerty', 'asdfghjkl123', 'asdfghjklqwerty',
  'zxcvbnm12345', 'zxcvbnmasdf', '1qaz2wsx3edc', '1qaz2wsx3edc4rfv', 'qazwsxedcrfv',
  'abcdefghijkl', 'abcdefghijklm', 'abcd1234abcd', 'abcd1234efgh', 'aaaaaaaaaaaa',
  'administrator', 'administrador', 'changemechangeme', 'changeme1234', 'trustno1trustno1',
  'monkey123456', 'dragon123456', 'superman1234', 'princess1234', 'sunshine1234',
  'football1234', 'baseball1234', 'michael12345', 'jennifer1234', 'thomas123456',
  'qwerasdfzxcv', 'passwordqwerty', '1234qwerasdf', 'loveme123456', 'starwars1234',
  'computer1234', 'internet1234', 'whatever1234', 'freedom12345', 'liverpool123',
  'arsenal12345', 'chelsea12345', 'manchester12', 'barcelona123', 'realmadrid123',
]);
