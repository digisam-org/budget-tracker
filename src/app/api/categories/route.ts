import { NextResponse, connection } from 'next/server';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';

export async function GET() {
  await connection();
  try {
    const list = await db.select().from(categories);
    return NextResponse.json({ categories: list });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch categories';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

