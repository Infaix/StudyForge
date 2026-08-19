import { NextRequest, NextResponse } from 'next/server';
import { getDB, ENTITIES, toCamelCase, toSnakeCase, serializeJsonFields, deserializeJsonFields, FILTER_ALIASES } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const config = ENTITIES[entity];
  if (!config) return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 404 });

  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    const { searchParams } = new URL(request.url);

    let sql = `SELECT * FROM ${config.table}`;
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (config.hasUserId && userId) {
      conditions.push('user_id = ?');
      bindings.push(userId);
    }

    for (const [key, value] of searchParams.entries()) {
      if (key === 'userId') continue;
      const sqlKey = FILTER_ALIASES[key] || key;
      conditions.push(`${sqlKey} = ?`);
      bindings.push(value);
    }

    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY rowid DESC';

    const limit = searchParams.get('limit');
    if (limit) {
      sql += ` LIMIT ${parseInt(limit)}`;
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

  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    const body = await request.json();

    if (!body.id) body.id = crypto.randomUUID();
    if (config.hasUserId && userId) body.userId = userId;

    let snakeData = toSnakeCase(body, config.columns);
    if (config.jsonFields) snakeData = serializeJsonFields(snakeData, config.jsonFields);

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
