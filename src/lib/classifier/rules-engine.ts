import { CategorizationRule } from '../db/schema';

export interface RuleMatch {
  categoryId: string;
  cleanMerchant?: string | null;
  matchedRuleId: string;
  confidence: number;
}

/**
 * Match raw description against defined categorization rules.
 * Sorted by priority descending.
 */
export function matchRule(
  rawDescription: string,
  rules: CategorizationRule[]
): RuleMatch | null {
  const upperDesc = rawDescription.toUpperCase();
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (rule.patternType === 'exact') {
      if (upperDesc === rule.pattern.toUpperCase()) {
        return {
          categoryId: rule.categoryId,
          cleanMerchant: rule.cleanMerchant,
          matchedRuleId: rule.id,
          confidence: 100,
        };
      }
    } else if (rule.patternType === 'regex') {
      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(rawDescription)) {
          return {
            categoryId: rule.categoryId,
            cleanMerchant: rule.cleanMerchant,
            matchedRuleId: rule.id,
            confidence: 95,
          };
        }
      } catch {
        // Skip invalid regex gracefully
      }
    } else {
      // Default: contains
      if (upperDesc.includes(rule.pattern.toUpperCase())) {
        return {
          categoryId: rule.categoryId,
          cleanMerchant: rule.cleanMerchant,
          matchedRuleId: rule.id,
          confidence: 90,
        };
      }
    }
  }

  return null;
}
