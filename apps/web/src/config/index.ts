/**
 * The one place the application reads its environment (CRED-001, SEC-R05).
 *
 * Every variable in `env.example` is read here, once, validated as a set, and
 * frozen. Nothing else in the application touches `process.env`: a scattered
 * read is how a variable comes to be required in production and unnamed in
 * `env.example`, and the two drifting apart is the failure this module exists
 * to make impossible. `DECLARED_VARIABLES` is the list, and a test holds it to
 * `env.example` (INFRA-001/T2).
 *
 * Required variables are validated before the server listens (see
 * `instrumentation.ts`): a misconfigured deployment fails at deploy, where an
 * operator sees it, rather than at the first request, where an investor does.
 * An absent optional credential disables its own feature and leaves the rest of
 * the system up — the distinction is between a feature that cannot run and a
 * system that cannot run, and only the second may stop anything.
 */

/**
 * A credential string whose value is available explicitly and nowhere else.
 * `toString`, `toJSON` and Node's inspection all redact, because the way a
 * secret reaches a log is almost always an object serialised whole by something
 * generic — `JSON.stringify(config)`, `console.log(config)`, an error built
 * from either (CRED-001/T4, DATA-R02). Wrapping the value rather than redacting
 * the config object keeps that guarantee even when a sub-object is serialised on
 * its own, and it cannot be forgotten for a credential added later: a value that
 * is a `Secret` is redacted everywhere by construction.
 */
const REDACTED = '[redacted]';

export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** The credential itself. The only path to it, and never implicit. */
  get value(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}

export type AppEnv = 'development' | 'staging' | 'production';

export type MailConfig =
  | { readonly available: true; readonly url: Secret; readonly from: string }
  | { readonly available: false; readonly unavailable: string };

export type BackupConfig =
  | { readonly available: true; readonly target: string; readonly key: Secret }
  | { readonly available: false; readonly unavailable: string };

export interface Config {
  readonly app: { readonly env: AppEnv; readonly origin: string; readonly port: number };
  readonly db: { readonly url: Secret; readonly sslmode: string };
  readonly session: { readonly secret: Secret; readonly ttlSeconds: number };
  readonly mail: MailConfig;
  readonly backup: BackupConfig;
  readonly auth: { readonly maxAttempts: number; readonly windowSeconds: number };
}

/**
 * Every variable this module reads, in `env.example` order. A test asserts this
 * is exactly the set `env.example` declares, so the reader and the file that
 * documents it cannot drift (INFRA-001/T2).
 */
export const DECLARED_VARIABLES = [
  'APP_ENV',
  'APP_ORIGIN',
  'PORT',
  'DATABASE_URL',
  'DB_SSLMODE',
  'SESSION_SECRET',
  'SESSION_TTL_SECONDS',
  'SMTP_URL',
  'MAIL_FROM',
  'BACKUP_TARGET',
  'BACKUP_KEY',
  'AUTH_MAX_ATTEMPTS',
  'AUTH_WINDOW_SECONDS',
] as const;

/** At least this many characters of session secret; the generator emits 43. */
const SESSION_SECRET_MIN_LENGTH = 32;

/**
 * Thrown when a required variable is absent or unparseable. It carries every
 * problem found, not the first, so a misconfigured deployment is fixed in one
 * pass rather than one restart at a time. The message names variables and never
 * prints a value, so throwing it near a secret does not leak one.
 */
export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`environment is not valid:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

type Source = Record<string, string | undefined>;

function present(source: Source, name: string): string | undefined {
  const raw = source[name];
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * PostgreSQL's `int4` ceiling. Several of these values reach the database as
 * an integer -- a session TTL becomes `make_interval(secs => ...)`, cast to
 * int4 -- so a value the parser accepts but the column cannot hold turns a
 * successful sign-in into a 500 on every read that follows. Bounding it here
 * keeps the failure at startup, where the docstring above promises it.
 */
const INT4_MAX = 2147483647;

function parsePositiveInt(
  value: string,
  name: string,
  problems: string[],
): number | undefined {
  if (!/^[0-9]+$/.test(value) || Number(value) <= 0) {
    problems.push(`${name} must be a positive integer`);
    return undefined;
  }

  const parsed = Number(value);

  if (parsed > INT4_MAX) {
    problems.push(`${name} must be at most ${INT4_MAX}`);
    return undefined;
  }

  return parsed;
}

function optionalPositiveInt(
  source: Source,
  name: string,
  fallback: number,
  problems: string[],
): number {
  const value = present(source, name);
  if (value === undefined) {
    return fallback;
  }
  return parsePositiveInt(value, name, problems) ?? fallback;
}

/**
 * Read, validate and freeze the whole environment. Pure in its argument so a
 * test drives it with a constructed source; the running application calls it
 * through `getConfig()` with `process.env`.
 */
export function loadConfig(source: Source = process.env): Config {
  const problems: string[] = [];

  const envRaw = present(source, 'APP_ENV');
  let env: AppEnv = 'development';
  if (envRaw === undefined) {
    problems.push('APP_ENV is required (development | staging | production)');
  } else if (envRaw === 'development' || envRaw === 'staging' || envRaw === 'production') {
    env = envRaw;
  } else {
    problems.push(`APP_ENV must be development, staging or production, not ${JSON.stringify(envRaw)}`);
  }
  const isProduction = env !== 'development';

  const originRaw = present(source, 'APP_ORIGIN');
  let origin = '';
  if (originRaw === undefined) {
    problems.push('APP_ORIGIN is required (scheme, host and port, no trailing slash)');
  } else {
    try {
      const url = new URL(originRaw);
      if (originRaw !== url.origin) {
        problems.push('APP_ORIGIN must be an origin only — scheme, host and port, with no path or trailing slash');
      } else {
        origin = url.origin;
      }
    } catch {
      problems.push(`APP_ORIGIN is not a valid URL: ${JSON.stringify(originRaw)}`);
    }
  }

  const port = optionalPositiveInt(source, 'PORT', 3100, problems);

  const databaseUrlRaw = present(source, 'DATABASE_URL');
  let databaseUrl = '';
  if (databaseUrlRaw === undefined) {
    problems.push('DATABASE_URL is required — the application will not start without a database');
  } else if (!/^postgres(?:ql)?:\/\//.test(databaseUrlRaw)) {
    problems.push('DATABASE_URL must be a postgres:// connection string');
  } else {
    databaseUrl = databaseUrlRaw;
  }

  // Optional, default 'disable' in development; outside development a value of
  // 'disable' is refused, because a production process talking to its database
  // in the clear is a misconfiguration that must fail at deploy.
  const sslmode = present(source, 'DB_SSLMODE') ?? 'disable';
  if (isProduction && sslmode === 'disable') {
    problems.push(`DB_SSLMODE must not be 'disable' when APP_ENV is ${env}`);
  }

  // `pg` applies an `sslmode` inside the connection string over the ssl option
  // the pool is built with, so a URL carrying one silently overrides DB_SSLMODE
  // and the guard above -- a `?sslmode=disable` would send password and session
  // hashes in the clear while everything here claimed otherwise. Outside
  // development, refuse a URL whose sslmode does not guarantee TLS; DB_SSLMODE is
  // the one place the policy is set.
  if (isProduction && databaseUrl !== '') {
    const urlSslmode = new URL(databaseUrl).searchParams.get('sslmode');
    if (urlSslmode !== null && !['require', 'verify-ca', 'verify-full'].includes(urlSslmode)) {
      problems.push(
        `DATABASE_URL must not carry sslmode=${urlSslmode} when APP_ENV is ${env}; DB_SSLMODE governs TLS`,
      );
    }
  }

  const secretRaw = present(source, 'SESSION_SECRET');
  let sessionSecret = '';
  if (secretRaw === undefined) {
    problems.push('SESSION_SECRET is required — it secures the session cookie');
  } else if (secretRaw.length < SESSION_SECRET_MIN_LENGTH) {
    problems.push(`SESSION_SECRET must be at least ${SESSION_SECRET_MIN_LENGTH} characters`);
  } else {
    sessionSecret = secretRaw;
  }
  const sessionTtlSeconds = optionalPositiveInt(source, 'SESSION_TTL_SECONDS', 43200, problems);

  // Mail degrades when absent: an invitation is still created and its link shown
  // to the admin to deliver by hand (MAIL-001, AUTH-003). MAIL_FROM is required
  // only once SMTP_URL is set — the sender an SMTP hand-off needs.
  const smtpUrl = present(source, 'SMTP_URL');
  const mailFrom = present(source, 'MAIL_FROM');
  let mail: MailConfig;
  if (smtpUrl === undefined) {
    mail = { available: false, unavailable: 'SMTP_URL is not set; invitations and messages are shown on screen to send by hand' };
  } else if (!/^smtps?:\/\//.test(smtpUrl)) {
    problems.push('SMTP_URL must be an smtp:// or smtps:// URL');
    mail = { available: false, unavailable: 'SMTP_URL is invalid' };
  } else if (mailFrom === undefined) {
    problems.push('MAIL_FROM is required whenever SMTP_URL is set — the envelope sender bounces come back to');
    mail = { available: false, unavailable: 'MAIL_FROM is not set' };
  } else {
    mail = { available: true, url: new Secret(smtpUrl), from: mailFrom };
  }

  // Backups degrade when absent: none are taken and `make doctor` says so,
  // rather than the system implying otherwise (DATA-003).
  const backupTarget = present(source, 'BACKUP_TARGET');
  const backupKey = present(source, 'BACKUP_KEY');
  let backup: BackupConfig;
  if (backupTarget === undefined) {
    backup = { available: false, unavailable: 'BACKUP_TARGET is not set; no backup is taken' };
  } else if (backupKey === undefined) {
    backup = { available: false, unavailable: 'BACKUP_KEY is not set; a backup would be written unencrypted, so none is taken' };
  } else {
    backup = { available: true, target: backupTarget, key: new Secret(backupKey) };
  }

  const maxAttempts = optionalPositiveInt(source, 'AUTH_MAX_ATTEMPTS', 5, problems);
  const windowSeconds = optionalPositiveInt(source, 'AUTH_WINDOW_SECONDS', 900, problems);

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  const config: Config = {
    app: { env, origin, port },
    db: { url: new Secret(databaseUrl), sslmode },
    session: { secret: new Secret(sessionSecret), ttlSeconds: sessionTtlSeconds },
    mail,
    backup,
    auth: { maxAttempts, windowSeconds },
  };

  return deepFreeze(config);
}

function deepFreeze<T>(value: T): T {
  for (const key of Object.getOwnPropertyNames(value)) {
    const inner = (value as Record<string, unknown>)[key];
    if (inner !== null && typeof inner === 'object' && !(inner instanceof Secret) && !Object.isFrozen(inner)) {
      deepFreeze(inner);
    }
  }
  return Object.freeze(value);
}

let cached: Config | undefined;

/**
 * The validated environment, read once. The first caller pays the validation;
 * every caller after reads the frozen object. `instrumentation.ts` is the first
 * caller, at startup, so a missing required variable stops the process before it
 * listens rather than on a request.
 */
export function getConfig(): Config {
  if (cached === undefined) {
    cached = loadConfig();
  }
  return cached;
}
