import type { ReactElement } from 'react';

import { type AuditFilter, recentAudit } from '../../../audit/read';
import { AUDIT_ACTIONS, type AuditAction } from '../../../db/types';

import styles from './audit.module.css';

/**
 * The audit trail, read-only (`SEC-002/T5`). It lists the most recent entries
 * newest first and narrows by actor, subject or action. There is no edit or
 * delete control — the trail is append-only in the database, and a control that
 * does not exist cannot be reached by a bug. The `/admin` layout's role check
 * gates the page; it does not re-check.
 */

const WINDOW = 100;

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first !== undefined && first.trim() !== '' ? first.trim() : undefined;
}

function asAction(value: string | undefined): AuditAction | undefined {
  return value !== undefined && (AUDIT_ACTIONS as readonly string[]).includes(value)
    ? (value as AuditAction)
    : undefined;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const filter: AuditFilter = {
    actorId: one(params.actor),
    subjectId: one(params.subject),
    action: asAction(one(params.action)),
  };
  const rows = await recentAudit(filter, WINDOW);
  const narrowed = filter.actorId !== undefined || filter.subjectId !== undefined || filter.action !== undefined;

  return (
    <>
      <h1>Audit</h1>

      <form className={styles.filters} method="get">
        <label>
          Action
          <select name="action" defaultValue={filter.action ?? ''}>
            <option value="">any</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label>
          Actor
          <input name="actor" defaultValue={filter.actorId ?? ''} placeholder="account id" />
        </label>
        <label>
          Subject
          <input name="subject" defaultValue={filter.subjectId ?? ''} placeholder="subject id" />
        </label>
        <button type="submit">Filter</button>
      </form>

      {rows.length === 0 ? (
        <p>{narrowed ? 'No entries match these filters.' : 'No entries yet.'}</p>
      ) : (
        <table className={styles.trail}>
          <thead>
            <tr>
              <th>When (UTC)</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Subject</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.at.toISOString()}</td>
                <td>{row.actor_id ?? 'system'}</td>
                <td>{row.action}</td>
                <td>{row.subject_type === null ? '—' : `${row.subject_type} ${row.subject_id ?? ''}`.trim()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
