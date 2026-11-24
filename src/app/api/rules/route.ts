import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { categorizationRules } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const rules = await db
      .select()
      .from(categorizationRules)
      .orderBy(desc(categorizationRules.priority));
    return NextResponse.json({ rules });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load rules';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pattern, patternType, categoryId, cleanMerchant, priority } = body as {
      pattern?: string;
      patternType?: 'contains' | 'regex' | 'exact';
      categoryId?: string;
      cleanMerchant?: string | null;
      priority?: number;
    };

    if (!pattern?.trim() || !categoryId) {
      return NextResponse.json(
        { error: 'pattern and categoryId are required' },
        { status: 400 }
      );
    }

    const resolvedType: 'contains' | 'regex' | 'exact' =
      patternType === 'regex' || patternType === 'exact' ? patternType : 'contains';

    if (resolvedType === 'regex') {
      try {
        new RegExp(pattern.trim(), 'i');
      } catch {
        return NextResponse.json(
          { error: 'Invalid regular expression pattern' },
          { status: 400 }
        );
      }
    }

    const id = `rule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newRule = {
      id,
      pattern: pattern.trim(),
      patternType: resolvedType,
      categoryId,
      cleanMerchant: cleanMerchant?.trim() || null,
      priority: typeof priority === 'number' && !Number.isNaN(priority) ? priority : 10,
    };

    await db.insert(categorizationRules).values(newRule);

    return NextResponse.json({ success: true, rule: newRule }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create rule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, pattern, patternType, categoryId, cleanMerchant, priority } = body as {
      id?: string;
      pattern?: string;
      patternType?: 'contains' | 'regex' | 'exact';
      categoryId?: string;
      cleanMerchant?: string | null;
      priority?: number;
    };

    if (!id) {
      return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(categorizationRules)
      .where(eq(categorizationRules.id, id));

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const nextPattern = pattern !== undefined ? pattern.trim() : existing.pattern;
    const nextType =
      patternType === 'contains' || patternType === 'regex' || patternType === 'exact'
        ? patternType
        : existing.patternType;

    if (!nextPattern) {
      return NextResponse.json({ error: 'pattern cannot be empty' }, { status: 400 });
    }

    if (nextType === 'regex') {
      try {
        new RegExp(nextPattern, 'i');
      } catch {
        return NextResponse.json(
          { error: 'Invalid regular expression pattern' },
          { status: 400 }
        );
      }
    }

    const updatedFields = {
      pattern: nextPattern,
      patternType: nextType,
      categoryId: categoryId || existing.categoryId,
      cleanMerchant:
        cleanMerchant !== undefined ? cleanMerchant?.trim() || null : existing.cleanMerchant,
      priority:
        typeof priority === 'number' && !Number.isNaN(priority) ? priority : existing.priority,
    };

    await db
      .update(categorizationRules)
      .set(updatedFields)
      .where(eq(categorizationRules.id, id));

    return NextResponse.json({ success: true, rule: { id, ...updatedFields } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update rule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Rule id query param is required' }, { status: 400 });
    }

    await db.delete(categorizationRules).where(eq(categorizationRules.id, id));

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete rule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
