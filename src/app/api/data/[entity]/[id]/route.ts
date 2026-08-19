import { NextRequest, NextResponse } from 'next/server';
import { getDB, ENTITIES, toCamelCase, toSnakeCase, serializeJsonFields, deserializeJsonFields } from '@/lib/db';

const MUTATION_BLOCKED = new Set(['achievements', 'friend-requests', 'group-members', 'group-invites', 'user-achievements', 'xp-transactions']);

export async function GET(request: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  const config = ENTITIES[entity];
  if (!config) return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 404 });

  const userId = request.headers.get('x-user-id');
  if (!userId && config.hasUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDB();

    let sql = `SELECT * FROM ${config.table} WHERE id = ?`;
    const bindings: unknown[] = [id];

    if (config.hasUserId && userId) {
      sql += ' AND user_id = ?';
      bindings.push(userId);
    }

    const row = await db.prepare(sql).bind(...bindings).first();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let result = toCamelCase(row as Record<string, unknown>, config.columns);
    if (config.jsonFields) result = deserializeJsonFields(result, config.jsonFields);

    return NextResponse.json(result);
  } catch (error) {
    console.error(`GET ${entity}/${id} error:`, error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
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

    let snakeData = toSnakeCase(body, config.columns);
    if (config.jsonFields) snakeData = serializeJsonFields(snakeData, config.jsonFields);

    delete snakeData.id;
    delete snakeData.user_id;

    const setClauses = Object.keys(snakeData).map((k) => `${k} = ?`);
    const values = Object.values(snakeData);

    let sql = `UPDATE ${config.table} SET ${setClauses.join(', ')} WHERE id = ?`;
    values.push(id);

    if (config.hasUserId && userId) {
      sql += ' AND user_id = ?';
      values.push(userId);
    }

    await db.prepare(sql).bind(...values).run();

    let result = toCamelCase({ ...snakeData, id }, config.columns);
    if (config.jsonFields) result = deserializeJsonFields(result, config.jsonFields);

    return NextResponse.json(result);
  } catch (error) {
    console.error(`PUT ${entity}/${id} error:`, error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
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

    let sql = `DELETE FROM ${config.table} WHERE id = ?`;
    const bindings: unknown[] = [id];

    if (config.hasUserId && userId) {
      sql += ' AND user_id = ?';
      bindings.push(userId);
    }

    await db.prepare(sql).bind(...bindings).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`DELETE ${entity}/${id} error:`, error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
