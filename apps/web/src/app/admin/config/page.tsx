import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { settingsForConsole } from '../../../config/settings';

import styles from './config.module.css';
import { SettingControl } from './settings-control';

export const metadata: Metadata = { title: 'Settings' };

/**
 * `GET /admin/config` (`CFG-001/T8`) — the short list of values that change
 * without a deploy.
 *
 * The list is the **registry**, not the table: a key nobody has changed still
 * appears, showing the default the application is reading. Listing the rows
 * instead would show only what somebody had already touched, and the setting an
 * operator needs at three in the morning is usually the one nobody has.
 *
 * Each setting carries the sentence explaining it from the registry rather than
 * from this page, so the key and its meaning cannot drift apart. The one that
 * justifies the whole feature is `mail.enabled`: when something is going wrong
 * with sending, the person who needs to stop it is not in a position to deploy.
 *
 * The `/admin` segment layout has already resolved the admin (`ADMIN-002/T1`),
 * and this read is a staff read composing no audience predicate, so the page
 * needs no actor of its own.
 */
export default async function ConfigPage(): Promise<ReactElement> {
  const settings = await settingsForConsole();

  return (
    <>
      <h1>Settings</h1>
      <p className={styles.lead}>
        The values that change without a deploy. Everything else is code or environment — and no
        credential is ever here, because this table is readable by anyone who can read the database.
      </p>

      <div className={styles.settings}>
        {settings.map((setting) => (
          <SettingControl
            key={setting.key}
            setting={{
              key: setting.key,
              type: setting.type,
              what: setting.what,
              value: setting.value,
              fallback: setting.fallback,
              previousValue: setting.previousValue,
              changedBy: setting.changedBy,
              // Serialised here rather than in the client control: the column is
              // UTC (`OPS-R02`), so the page says which clock it is, once.
              changedAt:
                setting.changedAt === null
                  ? null
                  : setting.changedAt.toISOString().slice(0, 16).replace('T', ' '),
            }}
          />
        ))}
      </div>
    </>
  );
}
