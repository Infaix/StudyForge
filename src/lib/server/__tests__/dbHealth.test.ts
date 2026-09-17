import { describe, it, expect } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { REQUIRED_TABLES, checkD1Health, getDbHealth, summarizeHealth } from '../dbHealth';

interface Statement {
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
  all(): Promise<unknown>;
}

function fakeD1(presentTables: Set<string>, opts: { throwOnPrepare?: boolean; throwOnProbe?: boolean } = {}): D1Database {
  const makeStatement = (sql: string, opts_: typeof opts, boundArgs: unknown[] = []): Statement => ({
    first: async <T = unknown>(): Promise<T | null> => {
      if (opts_.throwOnProbe && sql.includes('SELECT 1')) throw new Error('probe failed');
      if (sql.includes('SELECT 1')) return { ok: 1 } as T;
      if (sql.includes('sqlite_master')) {
        const name = boundArgs[0] as string;
        return (presentTables.has(name) ? { name } : null) as unknown as T;
      }
      return null as unknown as T;
    },
    run: async () => ({ success: true, meta: {} }),
    all: async () => ({ success: true, results: [] }),
  });

  return {
    prepare: (sql: string) => {
      if (opts.throwOnPrepare) throw new Error('boom');
      const bound = (): Statement => makeStatement(sql, opts);
      const unbound: Statement & { bind: (...args: unknown[]) => Statement } = {
        ...bound(),
        bind: (...args: unknown[]) => makeStatement(sql, opts, args),
      };
      return unbound;
    },
    batch: async () => [],
    exec: async () => {},
  } as unknown as D1Database;
}

describe('checkD1Health', () => {
  it('reports ok when the core tables exist', async () => {
    const result = await checkD1Health(fakeD1(new Set(REQUIRED_TABLES)));
    expect(result.ok).toBe(true);
    expect(result.binding).toBe('present');
    expect(result.error).toBeUndefined();
    expect(result.tables).toHaveLength(REQUIRED_TABLES.length);
    expect(result.tables.every((t) => t.present)).toBe(true);
  });

  it('flags missing tables without throwing', async () => {
    const result = await checkD1Health(fakeD1(new Set(['users', 'study_sessions'])));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Missing tables/);
    expect(result.tables.find((t) => t.name === 'study_goals')?.present).toBe(false);
  });

  it('reports a degraded D1 without throwing on query failure', async () => {
    const result = await checkD1Health(fakeD1(new Set(REQUIRED_TABLES), { throwOnProbe: true }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('probe failed');
    expect(result.tables).toHaveLength(0);
  });

  it('only queries read-only support tables (no data, no secrets)', async () => {
    const sql: string[] = [];
    const db = {
      prepare: (s: string) => {
        sql.push(s);
        return {
          first: async <T = unknown>(): Promise<T | null> =>
            ({ ok: s.includes('SELECT 1') ? 1 : null }) as unknown as T,
          bind: (...args: unknown[]) => ({
            first: async <T = unknown>(): Promise<T | null> =>
              (new Set<string>(REQUIRED_TABLES).has(args[0] as string) ? { name: args[0] } : null) as unknown as T,
          }),
        };
      },
    } as unknown as D1Database;
    await checkD1Health(db);
    expect(sql[0]).toContain('SELECT 1');
    for (const q of sql) {
      expect(q.toLowerCase()).not.toMatch(/insert|update|delete|drop|alter/);
    }
  });
});

describe('getDbHealth', () => {
  it('reports a missing binding without throwing when getDB fails', async () => {
    // In the node test environment there is no Cloudflare context, so getDB()
    // throws — getDbHealth must translate that into binding: 'missing'.
    const result = await getDbHealth();
    expect(result.ok).toBe(false);
    expect(result.binding).toBe('missing');
    expect(Array.isArray(result.tables)).toBe(true);
  });
});

describe('summarizeHealth', () => {
  it('maps a healthy result to the 200-shape payload', () => {
    expect(summarizeHealth({ ok: true, binding: 'present', tables: [] })).toEqual({
      status: 'ok',
      database: 'ok',
    });
  });

  it('maps every unhealthy shape to degraded/unavailable', () => {
    expect(summarizeHealth({ ok: false, binding: 'present', tables: [], error: 'probe failed' })).toEqual({
      status: 'degraded',
      database: 'unavailable',
    });
    expect(summarizeHealth({ ok: false, binding: 'missing', tables: [] })).toEqual({
      status: 'degraded',
      database: 'unavailable',
    });
    expect(
      summarizeHealth({ ok: false, binding: 'present', tables: [{ name: 'study_goals', present: false }] }).status
    ).toBe('degraded');
  });

  it('never leaks identifiers, errors, SQL or binding names in the public payload', () => {
    const summary = summarizeHealth({
      ok: false,
      binding: 'missing',
      tables: [],
      error: 'PRAGMA failure on d3a604ef-2ba8-401b-862f-b13b98b62290: no such table: users',
    });
    expect(Object.keys(summary).sort()).toEqual(['database', 'status']);
    expect(JSON.stringify(summary)).not.toMatch(/d3a604ef|PRAGMA|users|no such table/i);
  });
});