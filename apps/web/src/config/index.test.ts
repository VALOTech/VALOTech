import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { ConfigError, DECLARED_VARIABLES, Secret, getConfig, loadConfig } from './index';

// Distinguishable secrets, so a leak test can look for the exact bytes rather
// than a shape. If any of these strings appears in a generic serialisation, a
// credential reached it.
const DB_SECRET = 'dbPASS_a1b2c3_SECRET';
const SESSION_SECRET = 'session_d4e5f6_SECRET_at_least_thirty_two_chars';
const SMTP_SECRET = 'smtpPASS_g7h8i9_SECRET';
const LEAKABLE = [DB_SECRET, SESSION_SECRET, SMTP_SECRET];

function validEnv(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    APP_ENV: 'development',
    APP_ORIGIN: 'http://localhost:3100',
    DATABASE_URL: `postgres://valotech:${DB_SECRET}@127.0.0.1:5434/valotech`,
    SESSION_SECRET,
    ...over,
  };
}

const ENV_EXAMPLE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'env.example');

describe('loadConfig', () => {
  it('reads a complete environment into a frozen, typed object', () => {
    const config = loadConfig(validEnv({ PORT: '3100', SESSION_TTL_SECONDS: '600' }));

    expect(config.app.env).toBe('development');
    expect(config.app.origin).toBe('http://localhost:3100');
    expect(config.app.port).toBe(3100);
    expect(config.db.url.value).toBe(`postgres://valotech:${DB_SECRET}@127.0.0.1:5434/valotech`);
    expect(config.db.sslmode).toBe('disable');
    expect(config.session.secret.value).toBe(SESSION_SECRET);
    expect(config.session.ttlSeconds).toBe(600);
    expect(config.auth).toEqual({ maxAttempts: 5, windowSeconds: 900 });

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.app)).toBe(true);
    expect(Object.isFrozen(config.auth)).toBe(true);
    expect(() => {
      (config as { app: { port: number } }).app.port = 9999;
    }).toThrow();
  });

  it('applies each optional default when the variable is absent', () => {
    const config = loadConfig(validEnv());

    expect(config.app.port).toBe(3100);
    expect(config.session.ttlSeconds).toBe(43200);
    expect(config.auth.maxAttempts).toBe(5);
    expect(config.auth.windowSeconds).toBe(900);
  });

  describe('a required variable that is absent stops the load, naming it (CRED-001/T2)', () => {
    it('names every missing required variable, not only the first', () => {
      let error: unknown;
      try {
        loadConfig({});
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ConfigError);
      const problems = (error as ConfigError).problems.join('\n');
      expect(problems).toContain('APP_ENV');
      expect(problems).toContain('APP_ORIGIN');
      expect(problems).toContain('DATABASE_URL');
      expect(problems).toContain('SESSION_SECRET');
    });

    it.each(['APP_ENV', 'APP_ORIGIN', 'DATABASE_URL', 'SESSION_SECRET'])(
      'refuses to load when %s alone is missing',
      (missing) => {
        const source = validEnv();
        delete source[missing];
        expect(() => loadConfig(source)).toThrow(new RegExp(missing));
      },
    );

    it('treats a whitespace-only value as absent', () => {
      expect(() => loadConfig(validEnv({ DATABASE_URL: '   ' }))).toThrow(/DATABASE_URL/);
    });

    it('rejects a DATABASE_URL that is not a postgres URL', () => {
      expect(() => loadConfig(validEnv({ DATABASE_URL: 'mysql://x/y' }))).toThrow(/DATABASE_URL/);
    });

    it('rejects an APP_ORIGIN that carries a path', () => {
      expect(() => loadConfig(validEnv({ APP_ORIGIN: 'http://localhost:3100/app' }))).toThrow(/APP_ORIGIN/);
    });

    it('rejects a SESSION_SECRET shorter than 32 characters', () => {
      expect(() => loadConfig(validEnv({ SESSION_SECRET: 'tooshort' }))).toThrow(/SESSION_SECRET/);
    });

    it('refuses a DATABASE_URL that disables TLS through its own sslmode outside development', () => {
      expect(() =>
        loadConfig(
          validEnv({
            APP_ENV: 'production',
            APP_ORIGIN: 'https://valotech.org',
            DB_SSLMODE: 'require',
            DATABASE_URL: `postgres://valotech:${DB_SECRET}@db.internal:5432/valotech?sslmode=disable`,
          }),
        ),
      ).toThrow(/DATABASE_URL must not carry sslmode/);
    });

    it("refuses DB_SSLMODE 'disable' outside development", () => {
      expect(() =>
        loadConfig(validEnv({ APP_ENV: 'production', APP_ORIGIN: 'https://valotech.org', DB_SSLMODE: 'disable' })),
      ).toThrow(/DB_SSLMODE/);
    });

    it('rejects a non-integer numeric option', () => {
      expect(() => loadConfig(validEnv({ PORT: 'nope' }))).toThrow(/PORT/);
    });
  });

  describe('an absent optional credential degrades its feature, system stays up (CRED-001/T3)', () => {
    it('disables mail with a reason when SMTP_URL is absent', () => {
      const config = loadConfig(validEnv());
      expect(config.mail.available).toBe(false);
      if (!config.mail.available) {
        expect(config.mail.unavailable).toMatch(/SMTP_URL/);
      }
    });

    it('disables backups with a reason when BACKUP_TARGET is absent', () => {
      const config = loadConfig(validEnv());
      expect(config.backup.available).toBe(false);
      if (!config.backup.available) {
        expect(config.backup.unavailable).toMatch(/BACKUP_TARGET/);
      }
    });

    it('enables mail when SMTP_URL and MAIL_FROM are both set', () => {
      const config = loadConfig(
        validEnv({ SMTP_URL: `smtps://user:${SMTP_SECRET}@mail.example.com:465`, MAIL_FROM: 'no-reply@valotech.org' }),
      );
      expect(config.mail.available).toBe(true);
      if (config.mail.available) {
        expect(config.mail.url).toBeInstanceOf(Secret);
        expect(config.mail.url.value).toContain(SMTP_SECRET);
        expect(config.mail.from).toBe('no-reply@valotech.org');
      }
    });

    it('requires MAIL_FROM once SMTP_URL is set — a required-when, not a silent enable', () => {
      expect(() => loadConfig(validEnv({ SMTP_URL: 'smtps://user@mail.example.com:465' }))).toThrow(/MAIL_FROM/);
    });

    it('enables backups when BACKUP_TARGET is set', () => {
      const config = loadConfig(validEnv({ BACKUP_TARGET: 's3://valotech-backups' }));
      expect(config.backup.available).toBe(true);
      if (config.backup.available) {
        expect(config.backup.target).toBe('s3://valotech-backups');
      }
    });
  });

  describe('a credential never reaches a generic serialisation (CRED-001/T4)', () => {
    const config = loadConfig(
      validEnv({ SMTP_URL: `smtps://user:${SMTP_SECRET}@mail.example.com:465`, MAIL_FROM: 'no-reply@valotech.org' }),
    );

    it('redacts every secret under JSON.stringify of the whole config', () => {
      const json = JSON.stringify(config);
      for (const secret of LEAKABLE) {
        expect(json).not.toContain(secret);
      }
      expect(json).toContain('[redacted]');
    });

    it('redacts every secret under util.inspect of the whole config', () => {
      const shown = inspect(config, { depth: null });
      for (const secret of LEAKABLE) {
        expect(shown).not.toContain(secret);
      }
    });

    it('redacts a secret that is serialised or coerced on its own', () => {
      expect(String(config.db.url)).toBe('[redacted]');
      expect(`${config.session.secret}`).toBe('[redacted]');
      expect(config.session.secret.toJSON()).toBe('[redacted]');
      expect(JSON.stringify({ leak: config.db.url })).not.toContain(DB_SECRET);
      expect(inspect(config.session.secret)).not.toContain(SESSION_SECRET);
    });

    it('does not leak through an error built from the config', () => {
      const message = new Error(`boot failed with ${JSON.stringify(config)}`).message;
      for (const secret of LEAKABLE) {
        expect(message).not.toContain(secret);
      }
    });

    it('still hands the real value to an explicit reader', () => {
      expect(config.db.url.value).toContain(DB_SECRET);
      expect(config.session.secret.value).toBe(SESSION_SECRET);
    });
  });
});

describe('the reader and env.example declare the same variables (INFRA-001/T2)', () => {
  it('every variable env.example names is read, and every variable read is named', () => {
    const declaredInFile = [
      ...new Set(
        readFileSync(ENV_EXAMPLE, 'utf8')
          .split('\n')
          .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
          .filter((name): name is string => name !== undefined),
      ),
    ];
    expect([...DECLARED_VARIABLES].sort()).toEqual(declaredInFile.sort());
  });
});

describe('getConfig', () => {
  it('reads the process environment once and returns the same frozen object', () => {
    // getConfig() reads process.env, which under `npm test` carries none of the
    // required variables; set them so the first (and only) call validates.
    process.env.APP_ENV = 'development';
    process.env.APP_ORIGIN = 'http://localhost:3100';
    process.env.DATABASE_URL = 'postgres://valotech:pw@127.0.0.1:5434/valotech';
    process.env.SESSION_SECRET = 'x'.repeat(40);

    const first = getConfig();
    const second = getConfig();
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
