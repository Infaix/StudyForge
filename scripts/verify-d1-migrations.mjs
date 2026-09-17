// Offline D1-equivalent migration verification for INFAIX Study.
//
// Applies the migration files in order against an in-memory SQLite database
// using the built-in `node:sqlite` (Node >= 22.5), then asserts the tables,
// columns, indexes and /api/health queries the application relies on.
//
// This mirrors what `wrangler d1 migrations apply` does to a NEW database —
// without touching production, network or a workerd binary (which is why it
// also works on platforms where workerd cannot run, e.g. Windows ARM64).
//
// Usage:
//   node scripts/verify-d1-migrations.mjs          # uses ./migrations
//   node scripts/verify-d1-migrations.mjs <dir>    # custom migrations dir
//
// Exits non-zero on ANY failure. Designed for CI and pre-deploy checks.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = process.argv[2] ? resolve(process.argv[2]) : resolve(process.cwd(), 'migrations');
const files = readdirSync(dir)
  .filter((f) => /^\d{4}_[A-Za-z0-9_]+\.sql$/.test(f))
  .sort();

if (files.length === 0) {
  console.error(`verify-d1-migrations: no migration files found in ${dir}`);
  process.exit(1);
}

const db = new DatabaseSync(':memory:');

for (const file of files) {
  try {
    db.exec(readFileSync(join(dir, file), 'utf8'));
    console.log(`applied ${file}`);
  } catch (err) {
    console.error(`FAILED ${file}: ${err.message}`);
    process.exitCode = 1;
    break;
  }
}

const requiredTables = ['users', 'user_profiles', 'study_sessions', 'study_goals', 'xp_transactions'];

const tableSet = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
);

for (const table of requiredTables) {
  const ok = tableSet.has(table);
  console.log(`${ok ? 'ok  ' : 'MISS'} table ${table}`);
  if (!ok) process.exitCode = 1;
}

const columnSets = {
  study_sessions: ['duration_seconds', 'segment_id', 'mode', 'completed', 'created_at', 'session_id', 'device_id'],
  xp_transactions: ['event_type'],
  user_profiles: ['xp_minutes_total', 'xp_carry_seconds'],
};
for (const [table, columns] of Object.entries(columnSets)) {
  const got = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name));
  for (const column of columns) {
    const ok = got.has(column);
    console.log(`${ok ? 'ok  ' : 'MISS'} ${table}.${column}`);
    if (!ok) process.exitCode = 1;
  }
}

const requiredIndexes = [
  'idx_study_sessions_segment_id',
  'idx_study_sessions_user_created',
  'idx_study_sessions_user_start',
  'idx_study_sessions_user_session',
  'idx_study_sessions_user_subject_start',
  'idx_study_sessions_user_device_start',
  'idx_xp_transactions_user_related',
  'idx_study_goals_user_overall',
  'idx_study_goals_user_subject',
];
const indexSet = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' " + "AND name != 'sqlite_autoindex%'").all().map((r) => r.name)
);
for (const index of requiredIndexes) {
  const ok = indexSet.has(index);
  console.log(`${ok ? 'ok  ' : 'MISS'} index ${index}`);
  if (!ok) process.exitCode = 1;
}

// Exact queries /api/health depends on (read-only, no secrets).
const probe = db.prepare('SELECT 1 AS ok').get();
if (probe && probe.ok === 1) console.log('ok   health probe (SELECT 1)');
else {
  console.log('MISS health probe (SELECT 1)');
  process.exitCode = 1;
}
const healthTablesOk = requiredTables.every((t) =>
  Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))
);
console.log(healthTablesOk ? 'ok   sqlite_master health lookups' : 'MISS sqlite_master health lookups');
if (!healthTablesOk) process.exitCode = 1;

if (process.exitCode) {
  console.log('verify-d1-migrations: FAILED');
} else {
  console.log('verify-d1-migrations: PASS — a fresh database correctly applies all migrations');
}
process.exit(process.exitCode ?? 0);