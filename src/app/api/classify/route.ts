import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transactions, categories, categorizationRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { matchRule } from '@/lib/classifier/rules-engine';
import {
  classifyTransactionsBatchWithLLM,
  ClassificationInputItem,
} from '@/lib/classifier/llm-classifier';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { classifyPendingInDb, items } = body as {
      classifyPendingInDb?: boolean;
      items?: Array<{ id?: string; rawDescription: string; amount: number }>;
    };

    const allCategories = await db.select().from(categories);
    const allRules = await db.select().from(categorizationRules);
    const catMap = new Map(allCategories.map((c) => [c.id, c]));

    // Mode 1: Re-classify all 'pending' transactions in SQLite
    if (classifyPendingInDb) {
      const pendingList = await db
        .select()
        .from(transactions)
        .where(eq(transactions.status, 'pending'));

      if (pendingList.length === 0) {
        return NextResponse.json({
          success: true,
          processedCount: 0,
          autoReviewedCount: 0,
          updatedTransactions: [],
        });
      }

      const llmBatchInput: ClassificationInputItem[] = [];
      const ruleMatches = new Map<
        number,
        { categoryId: string; cleanMerchant: string; confidence: number; ruleId: string }
      >();

      pendingList.forEach((tx, idx) => {
        const matched = matchRule(tx.rawDescription, allRules);
        if (matched) {
          ruleMatches.set(idx, {
            categoryId: matched.categoryId,
            cleanMerchant: matched.cleanMerchant || tx.cleanMerchant || tx.rawDescription,
            confidence: matched.confidence,
            ruleId: matched.matchedRuleId,
          });
        } else {
          llmBatchInput.push({
            index: idx,
            rawDescription: tx.rawDescription,
            amount: tx.amount,
          });
        }
      });

      const llmResults = await classifyTransactionsBatchWithLLM({
        items: llmBatchInput,
        categories: allCategories,
        existingRules: allRules,
      });

      const llmMap = new Map(llmResults.map((r) => [r.index, r]));
      let autoReviewedCount = 0;
      const updatedTransactions = [];

      for (let idx = 0; idx < pendingList.length; idx++) {
        const tx = pendingList[idx];
        const rMatch = ruleMatches.get(idx);
        const aiMatch = llmMap.get(idx);

        const categoryId = rMatch?.categoryId || aiMatch?.categoryId || tx.categoryId;
        const cleanMerchant =
          rMatch?.cleanMerchant || aiMatch?.cleanMerchant || tx.cleanMerchant || tx.rawDescription;
        const confidenceScore = rMatch?.confidence ?? aiMatch?.confidence ?? tx.confidenceScore ?? 50;
        const reasoning = rMatch
          ? `Matched deterministic rule (${rMatch.ruleId})`
          : aiMatch?.reasoning || 'AI classification';
        const classificationSource = rMatch ? 'rule' : aiMatch?.source || 'smart_heuristic';

        const matchedCat = categoryId ? catMap.get(categoryId) : null;
        const newType = matchedCat?.type || tx.type;
        const newStatus: 'reviewed' | 'pending' =
          confidenceScore >= 90 && categoryId ? 'reviewed' : 'pending';

        if (newStatus === 'reviewed') {
          autoReviewedCount++;
        }

        const existingMeta =
          tx.metadata && typeof tx.metadata === 'object'
            ? (tx.metadata as Record<string, unknown>)
            : {};

        const newMeta = {
          ...existingMeta,
          aiReasoning: reasoning,
          classificationSource,
        };

        await db
          .update(transactions)
          .set({
            categoryId,
            cleanMerchant,
            confidenceScore,
            type: newType,
            status: newStatus,
            metadata: newMeta,
          })
          .where(eq(transactions.id, tx.id));

        updatedTransactions.push({
          ...tx,
          categoryId,
          cleanMerchant,
          confidenceScore,
          type: newType,
          status: newStatus,
          metadata: newMeta,
        });
      }

      return NextResponse.json({
        success: true,
        processedCount: pendingList.length,
        autoReviewedCount,
        updatedTransactions,
      });
    }

    // Mode 2: Classify ad-hoc array of items
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Either classifyPendingInDb or a non-empty items array is required' },
        { status: 400 }
      );
    }

    const batchInput: ClassificationInputItem[] = items.map((item, idx) => ({
      index: idx,
      rawDescription: item.rawDescription,
      amount: item.amount,
    }));

    const classifications = await classifyTransactionsBatchWithLLM({
      items: batchInput,
      categories: allCategories,
      existingRules: allRules,
    });

    return NextResponse.json({
      success: true,
      results: classifications,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to classify transactions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

