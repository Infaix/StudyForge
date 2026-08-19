import { NextRequest, NextResponse } from 'next/server';
import { getDB, ENTITIES, toCamelCase, toSnakeCase, serializeJsonFields, deserializeJsonFields, FILTER_ALIASES } from '@/lib/db';

const MUTATION_BLOCKED = new Set(['achievements', 'friend-requests', 'group-members', 'group-invites', 'user-achievements', 'xp-transactions']);

export async function GET(request: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const config = ENTITIES[entity];
  if (!config) return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 404 });

  const userId = request.headers.get('x-user-id');
  if (!userId && config.hasUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDB();
    const { searchParams } = new URL(request.url);
    const validColumns = new Set(Object.values(config.columns));

    let sql = `SELECT * FROM ${config.table}`;
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (config.hasUserId && userId) {
      conditions.push('user_id = ?');
      bindings.push(userId);
    }

    for (const [key, value] of searchParams.entries()) {
      if (key === 'userId' || key === 'limit') continue;
      const sqlKey = FILTER_ALIASES[key] || key;
      if (!validColumns.has(sqlKey)) continue;
      conditions.push(`${sqlKey} = ?`);
      bindings.push(value);
    }

    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY rowid DESC';

    const limit = searchParams.get('limit');
    if (limit) {
      const n = parseInt(limit);
      if (!isNaN(n) && n > 0 && n <= 100) sql += ` LIMIT ${n}`;
    }

    const stmt = bindings.length ? db.prepare(sql).bind(...bindings) : db.prepare(sql);
    const { results } = await stmt.all();

    const mapped = results.map((row) => {
      let mapped = toCamelCase(row as Record<string, unknown>, config.columns);
      if (config.jsonFields) mapped = deserializeJsonFields(mapped, config.jsonFields);
      return mapped;
    });

    return NextResponse.json(mapped);
  } catch (error) {
    console.error(`GET ${entity} error:`, error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const config = ENTITIES[entity];
  if (!config) return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 404 });

  if (MUTATION_BLOCKED.has(entity)) {
    return NextResponse.json({ error: 'Entity is read-only via this endpoint' }, { status: 403 });
  }

  const userId = request.headers.get('x-user-id');
  if (!userId && config.hasUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDB();
    const body = await request.json();

    const id = body.id || crypto.randomUUID();

    const record: Record<string, unknown> = { ...body, id };

    let snakeData = toSnakeCase(record, config.columns);
    if (config.jsonFields) snakeData = serializeJsonFields(snakeData, config.jsonFields);

    if (config.hasUserId && userId) snakeData.user_id = userId;

    const keys = Object.keys(snakeData);
    const placeholders = keys.map(() => '?').join(', ');
    const values = Object.values(snakeData);

    await db.prepare(`INSERT INTO ${config.table} (${keys.join(', ')}) VALUES (${placeholders})`).bind(...values).run();

    let result = toCamelCase(snakeData, config.columns);
    if (config.jsonFields) result = deserializeJsonFields(result, config.jsonFields);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error(`POST ${entity} error:`, error);
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }
}
