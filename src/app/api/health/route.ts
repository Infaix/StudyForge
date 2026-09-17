import { NextResponse } from 'next/server';
import { getDbHealth, summarizeHealth } from '@/lib/server/dbHealth';

/**
 * Public liveness + database-connectivity probe (see PUBLIC_PATHS).
 *
 * Returns a fixed-shape payload with no binding names, table lists, errors,
 * SQL or identifiers: 200 `{ status: 'ok', database: 'ok' }` when D1 answers
 * and the core tables exist, otherwise 503 `{ status: 'degraded', database:
 * 'unavailable' }`. Suitable for Cloudflare health checks and the deployment
 * smoke test.
 */
export async function GET() {
  const health = await getDbHealth();
  const summary = summarizeHealth(health);
  return NextResponse.json(summary, { status: summary.status === 'ok' ? 200 : 503 });
}