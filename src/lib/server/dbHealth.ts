import type { D1Database } from '@cloudflare/workers-types';
import { getDB } from '@/lib/db/index';

/**
 * Safe D1 health-check helpers for the INFAIX Study infrastructure audit.
 *
 * These never expose secrets or mutate data: the only queries issued are a
 * bare `SELECT 1` and read-only `sqlite_master` lookups against the core
 * tables the app depends on.
 *
 * Wiring: `/api/health` calls `getDbHealth()` and exposes only
 * `summarizeHealth()` (a minimal `{ status, database }` payload) so probes
 * never receive binding names, table lists, errors or IDs.
 */

export const REQUIRED_TABLES = ['users', 'user_profiles', 'study_sessions', 'study_goals', 'xp_transactions'] as const;

export interface DbHealthResult {
  ok: boolean;
  /** Whether the D1 `DATABASE` binding resolves in the current environment. */
  binding: 'present' | 'missing';
  /** Per-table presence derived from sqlite_master. */
  tables: { name: string; present: boolean }[];
  /** Human-readable reason when the check fails; absent on success. */
  error?: string;
}

function tableResult(name: string, present: boolean) {
  return { name, present };
}

/** Pure check against an already-resolved D1 handle. Never throws. */
export async function checkD1Health(db: D1Database): Promise<DbHealthResult> {
  try {
    const probe = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    if (!probe) {
      return { ok: false, binding: 'present', tables: [], error: 'D1 probe returned no rows' };
    }

    const tables: DbHealthResult['tables'] = [];
    for (const name of REQUIRED_TABLES) {
      const row = await db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .bind(name)
        .first<{ name: string }>();
      tables.push(tableResult(name, Boolean(row)));
    }

    const missing = tables.filter((t) => !t.present);
    return {
      ok: missing.length === 0,
      binding: 'present',
      tables,
      error: missing.length > 0 ? `Missing tables: ${missing.map((t) => t.name).join(', ')}` : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      binding: 'present',
      tables: [],
      error: err instanceof Error ? err.message : 'Unknown D1 failure',
    };
  }
}

/** Resolves the `DATABASE` binding and returns a full health snapshot. Never throws. */
export async function getDbHealth(): Promise<DbHealthResult> {
  let db: D1Database;
  try {
    db = getDB();
  } catch (err) {
    return {
      ok: false,
      binding: 'missing',
      tables: [],
      error: err instanceof Error ? err.message : 'DATABASE binding not found',
    };
  }
  return checkD1Health(db);
}

export interface HealthSummary {
  status: 'ok' | 'degraded';
  database: 'ok' | 'unavailable';
}

/**
 * Collapses a DbHealthResult into the minimal public payload exposed by the
 * health endpoint. Never leaks binding names, table lists, errors or IDs.
 * `ok` → 200; everything else → 503 (degraded, database unavailable).
 */
export function summarizeHealth(result: DbHealthResult): HealthSummary {
  return result.ok
    ? { status: 'ok', database: 'ok' }
    : { status: 'degraded', database: 'unavailable' };
}