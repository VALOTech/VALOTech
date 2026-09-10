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

import { sql } from 'kysely';

import { recordAudit } from '../audit/record';
import { getDb } from '../db/index';

type SettingType = 'text' | 'int' | 'bool';

interface SettingSpec {
  readonly type: SettingType;
  readonly fallback: string | number | boolean;
  /** For an `int` key: the inclusive range a change is validated against (`CFG-001/T2`). */
  readonly min?: number;
  readonly max?: number;
  /** For a `text` key: the longest value a change accepts. */
  readonly maxLength?: number;
}

/**
 * Every runtime setting, its type, and the default an absent row falls back to.
 * `as const` makes each `fallback` a literal type, so the accessor's return
 * type is the key's own — `session.max_age_days` reads back as a `number`, not a
 * `string | number | boolean`.
 */
export const SETTINGS = {
  'room.banner': { type: 'text', fallback: '', maxLength: 280 },
  'room.signin_message': { type: 'text', fallback: '', maxLength: 280 },
  'mail.enabled': { type: 'bool', fallback: true },
  'session.max_age_days': { type: 'int', fallback: 30, min: 1, max: 90 },
  'signin.rate_per_hour': { type: 'int', fallback: 10, min: 1, max: 1000 },
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

/** A change: accepted with the value as it will be stored, or refused with a reason. */
export type ChangeResult =
  | { readonly ok: true; readonly stored: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Validate a raw value against the key's declared type and bounds (`CFG-001/T2`).
 *
 * An out-of-range value is refused with the range rather than accepted and
 * clamped: a setting silently clamped to its bound disagrees with what the
 * caller typed and what the screen then shows, and that disagreement surfaces
 * later as a bug report about a value nobody set. A `bool` parses back from the
 * two words it is stored as, an `int` must be whole and within its range, and a
 * `text` value is bounded in length. The returned `stored` is the normalised
 * string the row will hold, so an integer is stored without whatever formatting
 * the caller sent.
 */
export function validateSetting<K extends SettingKey>(key: K, raw: string): ChangeResult {
  const spec = SETTINGS[key];

  if (spec.type === 'bool') {
    return raw === 'true' || raw === 'false'
      ? { ok: true, stored: raw }
      : { ok: false, reason: `${key} is true or false` };
  }

  if (spec.type === 'int') {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isInteger(parsed)) {
      return { ok: false, reason: `${key} is a whole number` };
    }
    const min = spec.min ?? Number.MIN_SAFE_INTEGER;
    const max = spec.max ?? Number.MAX_SAFE_INTEGER;
    return parsed >= min && parsed <= max
      ? { ok: true, stored: String(parsed) }
      : { ok: false, reason: `${key} is a whole number between ${min} and ${max}` };
  }

  const max = spec.maxLength ?? Number.MAX_SAFE_INTEGER;
  return raw.length <= max
    ? { ok: true, stored: raw }
    : { ok: false, reason: `${key} is at most ${max} characters` };
}

/**
 * Change one setting, validating it first and recording the act (`CFG-001/T3`).
 *
 * A refused value comes back for the caller to show; it is never thrown and
 * never clamped. An accepted change is one transaction: the previous value is
 * captured from the current row — or the declared default when no row exists
 * yet, so reverting the first change restores the default rather than null — the
 * new value is written, and `config.change` is audited (`SEC-R04`). The audit's
 * field values wait on `SEC-DEC-01` (`before`/`after` are null until `SEC-002/T4`,
 * and the key is a string the uuid `subject_id` cannot hold); the config row
 * itself carries the key, both values, who and when, which is what a revert and
 * the console read. A secret-shaped key is refused before any write, the same
 * backstop the read path applies (`SEC-R05`).
 */
export async function changeSetting<K extends SettingKey>(
  key: K,
  raw: string,
  actorId: string,
): Promise<ChangeResult> {
  if (isSecretShaped(key)) {
    return { ok: false, reason: 'a secret-shaped key is never a runtime setting' };
  }

  const validated = validateSetting(key, raw);
  if (!validated.ok) {
    return validated;
  }

  await getDb()
    .transaction()
    .execute(async (trx) => {
      const current = await trx
        .selectFrom('config')
        .select('value')
        .where('key', '=', key)
        .forUpdate()
        .executeTakeFirst();

      const previous = current?.value ?? String(SETTINGS[key].fallback);

      await trx
        .insertInto('config')
        .values({ key, value: validated.stored, previous_value: previous, changed_by: actorId })
        .onConflict((oc) =>
          oc.column('key').doUpdateSet({
            value: validated.stored,
            previous_value: previous,
            changed_by: actorId,
            changed_at: sql`now()`,
          }),
        )
        .execute();

      await recordAudit(trx, {
        actorId,
        action: 'config.change',
        subjectType: 'config',
        subjectId: null,
      });
    });

  return validated;
}

/**
 * Revert a setting to its previous value, in one action (`CFG-001/T4`).
 *
 * Reverting is itself a change: it swaps the current and previous values, so
 * reverting twice returns to where it started and the trail carries both moves.
 * The row is read and written under a lock so two reverts cannot read the same
 * pair and both apply it. Returns whether anything was reverted — `false` when
 * the key holds no previous value, in which case nothing is written and nothing
 * is recorded, the no-op for a key that has never changed. It too is audited as
 * a `config.change` (`SEC-R04`); there is no separate revert action, because a
 * revert is a change back.
 */
export async function revertSetting<K extends SettingKey>(
  key: K,
  actorId: string,
): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const row = await trx
        .selectFrom('config')
        .select(['value', 'previous_value'])
        .where('key', '=', key)
        .forUpdate()
        .executeTakeFirst();

      if (row === undefined || row.previous_value === null) {
        return false;
      }

      await trx
        .updateTable('config')
        .set({
          value: row.previous_value,
          previous_value: row.value,
          changed_by: actorId,
          changed_at: sql`now()`,
        })
        .where('key', '=', key)
        .execute();

      await recordAudit(trx, {
        actorId,
        action: 'config.change',
        subjectType: 'config',
        subjectId: null,
      });

      return true;
    });
}
