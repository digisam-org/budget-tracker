import { NextResponse, connection } from 'next/server';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';

export async function GET() {
  await connection();
  try {
    const list = await db.select().from(accounts);
    return NextResponse.json({ accounts: list });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch accounts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
