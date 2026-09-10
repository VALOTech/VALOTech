/**
 * Runtime configuration (`CFG-001`): the short list of values an operator
 * changes without a deploy. Distinct from `config/index.ts`, which reads the
 * environment once at boot — this reads a handful of rows a person edits while
 * the application runs, so a banner goes up or sending stops without a release.
 *
 * The registry below is the whole of what is configurable, and the defaults
 * live here in code beside the keys rather than as seed rows: a database with
 * no `config` rows must produce a working application, so an absent key returns
 * its declared default. Adding a key here is how a value becomes
 * runtime-configurable; everything else is code or environment.
 *
 * No secret is ever a runtime setting (`SEC-R05`). The `config` table is
 * readable by anyone who can read the database, so a credential placed in it
 * would be a credential in the clear; credentials come from the environment
 * (`CRED-001`). The accessor refuses a secret-shaped key to make that structural
 * rather than a rule the registry is trusted to keep.
 *
 * The value is cached and refreshed on a short interval, so a change takes
 * effect within seconds without a database read on every request. The cost is
 * that a reader may see the previous value for that interval, which for a value
 * that changes monthly is the right trade.
 */

import { performance } from 'node:perf_hooks';

import { getDb } from '../db/index';

type SettingType = 'text' | 'int' | 'bool';

interface SettingSpec {
  readonly type: SettingType;
  readonly fallback: string | number | boolean;
}

/**
 * Every runtime setting, its type, and the default an absent row falls back to.
 * `as const` makes each `fallback` a literal type, so the accessor's return
 * type is the key's own — `session.max_age_days` reads back as a `number`, not a
 * `string | number | boolean`.
 */
export const SETTINGS = {
  'room.banner': { type: 'text', fallback: '' },
  'room.signin_message': { type: 'text', fallback: '' },
  'mail.enabled': { type: 'bool', fallback: true },
  'session.max_age_days': { type: 'int', fallback: 30 },
  'signin.rate_per_hour': { type: 'int', fallback: 10 },
} as const satisfies Record<string, SettingSpec>;

export type SettingKey = keyof typeof SETTINGS;

/** The value a key reads back as — the type of its declared default. */
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['fallback'];

/**
 * The shapes a key must never take, because each is how a credential would be
 * named. The guard is a backstop behind the registry being short and reviewed:
 * a key matching any of these cannot be read, so the table cannot become a place
 * a secret is kept even if one were added to the registry by mistake.
 */
const SECRET_SHAPED = /secret|password|passphrase|token|credential|private|api[-_]?key|[-_.]key$/i;

export function isSecretShaped(key: string): boolean {
  return SECRET_SHAPED.test(key);
}

/** Parse one stored string into the key's declared type. */
function parse<K extends SettingKey>(key: K, raw: string): SettingValue<K> {
  const { type } = SETTINGS[key];
  if (type === 'bool') {
    return (raw === 'true') as SettingValue<K>;
  }
  if (type === 'int') {
    const parsed = Number(raw);
    // A row outside the type is a write that bypassed validation (`CFG-001/T2`);
    // the default is the fail-safe, so a corrupt row degrades to the declared
    // value rather than handing a caller a NaN.
    return (Number.isInteger(parsed) ? parsed : SETTINGS[key].fallback) as SettingValue<K>;
  }
  return raw as SettingValue<K>;
}

const REFRESH_MS = 5000;

/**
 * The runtime settings, read through a cache refreshed at most every
 * `REFRESH_MS`. The clock is injected so a test can cross the refresh boundary
 * without waiting it, defaulting to a monotonic source — a wall clock stepped by
 * an NTP correction would refresh early or hold the cache too long.
 */
export class Settings {
  #cache: Map<string, string> | undefined;
  #loadedAt = 0;
  readonly #now: () => number;
  readonly #refreshMs: number;

  constructor(now: () => number = () => performance.now(), refreshMs: number = REFRESH_MS) {
    this.#now = now;
    this.#refreshMs = refreshMs;
  }

  /**
   * Read one setting. An absent row returns the declared default, so an empty
   * table is a working application. A secret-shaped key is refused before any
   * read — it is not a configurable value and never will be.
   */
  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    if (isSecretShaped(key)) {
      throw new Error('a secret-shaped key is never a runtime setting');
    }

    const rows = await this.#load();
    const raw = rows.get(key);

    return raw === undefined ? (SETTINGS[key].fallback as SettingValue<K>) : parse(key, raw);
  }

  async #load(): Promise<Map<string, string>> {
    const now = this.#now();
    if (this.#cache !== undefined && now - this.#loadedAt < this.#refreshMs) {
      return this.#cache;
    }

    const rows = await getDb().selectFrom('config').select(['key', 'value']).execute();
    this.#cache = new Map(rows.map((row) => [row.key, row.value]));
    this.#loadedAt = now;

    return this.#cache;
  }
}

let shared: Settings | undefined;

/** The settings the application reads, built once so the cache is shared. */
export function getSettings(): Settings {
  if (shared === undefined) {
    shared = new Settings();
  }
  return shared;
}
