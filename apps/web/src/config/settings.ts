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

type SettingType = 'text' | 'bool';

interface SettingSpec {
  readonly type: SettingType;
  readonly fallback: string | boolean;
  /**
   * What the value does, in the words the console shows beside it. It lives
   * here rather than on the screen because a key and the sentence explaining it
   * are one thing: a registry that carried only the key would let the two drift,
   * and the drift would be invisible until somebody changed the wrong setting.
   */
  readonly what: string;
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
  'room.banner': {
    type: 'text',
    fallback: '',
    maxLength: 280,
    what: 'A line at the top of the investor hall. Empty shows nothing.',
  },
  'room.signin_message': {
    type: 'text',
    fallback: '',
    maxLength: 280,
    what: 'A line on the sign-in page — planned maintenance, say. Empty shows nothing.',
  },
  'mail.enabled': {
    type: 'bool',
    fallback: true,
    what: 'Whether mail is sent at all. Turning it off stops sending without a deploy and without touching the credential.',
  },
  // The address the privacy notice publishes (`LEGAL-SG-001/T1`). It is a
  // setting rather than a string in the dictionary because the notice names
  // where to write, the PDPA asks for a designated contact, and who holds that
  // mailbox changes without the words around it changing — a deploy to move an
  // address is a deploy nobody makes, and a notice naming a mailbox nobody
  // reads is worse than one naming a general address honestly. The default is
  // the address the gateway already publishes, so the notice is true before
  // anybody sets anything; naming a data protection officer is
  // `LEGAL-SG-001/T4`, and that is the owner's act, not a code change.
  'privacy.contact': {
    type: 'text',
    fallback: 'hello@valotech.org',
    maxLength: 120,
    what: 'The address the privacy notice tells a reader to write to. Empty falls back to the published company address.',
  },
} as const satisfies Record<string, SettingSpec>;

export type SettingKey = keyof typeof SETTINGS;

/**
 * The address the privacy notice publishes (`LEGAL-SG-001/T1`).
 *
 * A row set to nothing is treated as no row. `get` returns the declared default
 * only when the key is absent, so an operator who clears the field would
 * otherwise leave the notice telling a reader to write to nowhere — and a
 * privacy notice naming no contact is the one sentence in it that must never be
 * empty. Surrounding space is dropped for the same reason: an address that is
 * one space is a field somebody cleared.
 */
export function publishedContact(configured: string): string {
  const trimmed = configured.trim();
  return trimmed === '' ? SETTINGS['privacy.contact'].fallback : trimmed;
}

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
  if (SETTINGS[key].type === 'bool') {
    return (raw === 'true') as SettingValue<K>;
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

/** One setting as the console shows it (`CFG-001/T8`). */
export interface ConsoleSetting {
  readonly key: SettingKey;
  readonly type: SettingType;
  readonly what: string;
  /** The value in force, which is the declared default when no row exists. */
  readonly value: string;
  /** The declared default, so a screen can say what changing it moved away from. */
  readonly fallback: string;
  /** What a revert would restore, or `null` when there is nothing to go back to. */
  readonly previousValue: string | null;
  /** Who last changed it, or `null` for a default nobody has moved or an erased account. */
  readonly changedBy: string | null;
  readonly changedAt: Date | null;
}

/**
 * Every setting, in the registry's own order, with what is in force and what a
 * revert would restore (`CFG-001/T8`).
 *
 * The registry is the list, not the table: a key with no row has never been
 * changed and shows its declared default, which is exactly what the application
 * reads. Listing the table instead would show only the keys somebody had already
 * touched, and the one an operator needs at three in the morning is usually the
 * one nobody has.
 *
 * A staff read behind the admin gate, so it composes no audience predicate. The
 * changer is left-joined by name, so a setting outlives the erasure of whoever
 * changed it (`DATA-002`) while naming nobody.
 */
export async function settingsForConsole(): Promise<ConsoleSetting[]> {
  const rows = await getDb()
    .selectFrom('config')
    .leftJoin('accounts', 'accounts.id', 'config.changed_by')
    .select(['config.key', 'config.value', 'config.previous_value', 'config.changed_at', 'accounts.name'])
    .execute();

  const stored = new Map(rows.map((row) => [row.key, row]));

  return (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
    const row = stored.get(key);
    const fallback = String(SETTINGS[key].fallback);

    return {
      key,
      type: SETTINGS[key].type,
      what: SETTINGS[key].what,
      value: row?.value ?? fallback,
      fallback,
      previousValue: row?.previous_value ?? null,
      changedBy: row?.name ?? null,
      changedAt: row?.changed_at ?? null,
    };
  });
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
 * new value is written, and `config.change` is audited (`SEC-R04`). The audit
 * row carries the key beside both values (`SEC-DEC-01`): the key because
 * `subject_id` is a uuid and cannot hold it, and both values because a trail
 * that named only the setting could not say which way it moved. The config row
 * carries the same pair plus who and when, which is what a revert and the
 * console read; the audit is the history that row does not keep. A
 * secret-shaped key is refused before any write, the same backstop the read
 * path applies (`SEC-R05`).
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
        before: { key, value: previous },
        after: { key, value: validated.stored },
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
        before: { key, value: row.value },
        after: { key, value: row.previous_value },
      });

      return true;
    });
}
