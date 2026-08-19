import { NextRequest, NextResponse } from 'next/server';
import { getDB, ENTITIES, toCamelCase, toSnakeCase, serializeJsonFields, deserializeJsonFields } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  const config = ENTITIES[entity];
  if (!config) return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 404 });

  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');

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

  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');
    const body = await request.json();

    let snakeData = toSnakeCase(body, config.columns);
    if (config.jsonFields) snakeData = serializeJsonFields(snakeData, config.jsonFields);

    delete snakeData.id;

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

  try {
    const db = getDB();
    const userId = request.headers.get('x-user-id');

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
