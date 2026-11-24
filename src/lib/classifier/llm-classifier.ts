import { Category, CategorizationRule } from '../db/schema';

export interface ClassificationInputItem {
  index: number;
  rawDescription: string;
  amount: number; // in pence (negative = outflow, positive = inflow)
}

export interface ClassificationResultItem {
  index: number;
  categoryId: string | null;
  cleanMerchant: string;
  confidence: number; // 0 - 100
  reasoning: string;
  source: 'gemini_llm' | 'openai_llm' | 'smart_heuristic';
}

/**
 * Cleans messy UK bank statement merchant descriptions:
 * e.g. "SQ *ARTISAN ROAST EDINBURGH GBR" -> "Artisan Roast"
 * e.g. "TESCO STORES 2918 LONDON" -> "Tesco Stores"
 */
export function cleanUkMerchantString(raw: string): string {
  let s = raw.trim();

  // Strip common payment processor prefixes
  s = s.replace(
    /^(?:SQ\s*\*|SUMUP\s*\*|ZETTLE\s*\*|IZ\s*\*|PAYPAL\s*\*|STRIPE\s*\*|GOOGLE\s*\*|APPLE\.COM\/BILL\s*|CRV\s*\*|WWW\.|HTTP:\/\/|HTTPS:\/\/)/i,
    ''
  );

  // Strip common UK bank transaction prefixes
  s = s.replace(
    /^(?:CARD\s+PAYMENT\s+TO\s+|FASTER\s+PAYMENTS?\s+(?:TO|FROM)\s+|DIRECT\s+DEBIT\s+TO\s+|POS\s+\d+\s+|CONTACTLESS\s+)/i,
    ''
  );

  // Strip trailing country codes, dates, card last-4, and store numbers
  s = s.replace(/\s+(?:GBR|GB|UK|LON|EDINBURGH|GLASGOW|LONDON)\s*$/i, '');
  s = s.replace(/\s+#?\d{3,8}\s*$/, '');
  s = s.replace(/\s+\d{2}\/\d{2}(?:\/\d{2,4})?\s*$/, '');
  s = s.replace(/\s+/g, ' ').trim();

  if (!s) return raw.trim();

  // Convert ALL CAPS into Title Case unless it's a short acronym (e.g. TfL, OVO, BBC, NHS, IKBR)
  const ACRONYMS = new Set(['TFL', 'OVO', 'BBC', 'NHS', 'IKBR', 'ISA', 'SIPP', 'HMRC', 'DVLA', 'KFC', 'B&Q', 'M&S', 'H&M', 'LNER', 'DD']);
  return s
    .split(' ')
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      if (word.length <= 1) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

interface HeuristicMapping {
  keywords: RegExp;
  categoryKeywords: string[];
  defaultCleanMerchant?: string;
  confidence: number;
  reason: string;
}

const UK_SEMANTIC_HEURISTICS: HeuristicMapping[] = [
  {
    keywords: /\b(tesco|sainsbury'?s?|waitrose|asda|aldi|lidl|morrisons|co-?op|iceland|ocado|whole\s*foods|farmfoods|m&s\s*simply\s*food|simply\s*food|marks\s*&\s*spencer\s*food|butcher|bakery|greengrocer|supermarket|grocery|groceries)\b/i,
    categoryKeywords: ['groceries'],
    confidence: 88,
    reason: 'Supermarket or food store matched to Groceries',
  },
  {
    keywords: /\b(pret|costa|starbucks|nero|greggs|nandos|nando's|wagamama|dishoom|pizza|burger|mcdonald|kfc|subway|just\s*eat|uber\s*eats|cafe|coffee|roasters|bistro|restaurant|pub|bar|tavern|kitchen|dining|lunch|dinner)\b/i,
    categoryKeywords: ['eating out', 'dining'],
    confidence: 86,
    reason: 'Hospitality, cafe, or restaurant matched to Eating Out',
  },
  {
    keywords: /\b(scotrail|lner|trainline|national\s*rail|lothian\s*buses|stagecoach|first\s*bus|ringgo|paybyphone|ncp|parking|shell|bp|esso|texaco|petrol|fuel|bolt|addison\s*lee|easyjet|ryanair|british\s*airways)\b/i,
    categoryKeywords: ['transport'],
    confidence: 86,
    reason: 'Transit, rail, parking, or fuel vendor matched to Transport',
  },
  {
    keywords: /\b(scottish\s*power|british\s*gas|edf|eon|e\.on|bulb|thames\s*water|scottish\s*water|bt\s*group|virgin\s*media|sky\s*uk|three|o2|ee\s*limited|giffgaff|plusnet|talktalk|openai|chatgpt|anthropic|netflix|disney|icloud|github|notion)\b/i,
    categoryKeywords: ['utilities', 'broadband'],
    confidence: 87,
    reason: 'Utility, telecom, or digital subscription matched to Utilities',
  },
  {
    keywords: /\b(boots|superdrug|pharmacy|nhs|dentist|dental|optician|specsavers|vision\s*express|puregym|david\s*lloyd|nuffield|fitness|yoga|pilates|barber|salon|spa|tennis|badminton|cricket|football|golf|climbing)\b/i,
    categoryKeywords: ['health', 'beauty'],
    confidence: 84,
    reason: 'Wellness, pharmacy, sport, or personal care matched to Health & Beauty',
  },
  {
    keywords: /\b(amazon|amzn|argos|ikea|john\s*lewis|next\s*retail|uniqlo|zara|h&m|primark|asos|tk\s*maxx|decathlon|currys|apple\s*store|ebay|etsy|waterstones|b&q|screwfix|wickes)\b/i,
    categoryKeywords: ['shopping'],
    confidence: 83,
    reason: 'Retail or e-commerce merchant matched to Shopping',
  },
  {
    keywords: /\b(vue|odeon|cineworld|everyman|cameo|theatre|ticketmaster|eventbrite|dice\s*fm|steam\s*games|playstation|xbox|nintendo|museum|gallery|bowling|festival)\b/i,
    categoryKeywords: ['entertainment', 'leisure'],
    confidence: 85,
    reason: 'Cinema, live event, or gaming vendor matched to Entertainment',
  },
  {
    keywords: /\b(hmrc|council\s*tax|city\s*of\s*edinburgh|glasgow\s*city|tax\s*office)\b/i,
    categoryKeywords: ['taxes', 'council tax'],
    confidence: 91,
    reason: 'Municipal or tax authority matched to Taxes',
  },
  {
    keywords: /\b(halifax\s*mortgage|santander\s*mortgage|barclays\s*mortgage|natwest\s*mortgage|hsbc\s*mortgage|letting|landlord|rent\b|mortgage)\b/i,
    categoryKeywords: ['housing', 'mortgage'],
    confidence: 89,
    reason: 'Housing, rent, or mortgage payment matched to Housing',
  },
  {
    keywords: /\b(interactive\s*brokers|ikbr|trading\s*212|freetrade|hargreaves\s*lansdown|aj\s*bell|nutmeg|moneybox|wealthify)\b/i,
    categoryKeywords: ['ikbr', 'isa', 'stock', 'investment'],
    confidence: 92,
    reason: 'Investment platform transfer matched to Stock Portfolio / ISA',
  },
  {
    keywords: /\b(booking\.com|airbnb|expedia|hotels\.com|premier\s*inn|travelodge|hilton|marriott|jet2|tui\b|holiday)\b/i,
    categoryKeywords: ['holidays'],
    confidence: 86,
    reason: 'Accommodation or travel booking matched to Holidays',
  },
  {
    keywords: /\b(klarna|clearpay|loan|finance\b|credit\s*card\s*payment|amex\s*payment|interest\s*charge|bank\s*fee)\b/i,
    categoryKeywords: ['finances'],
    confidence: 82,
    reason: 'Financing or credit service matched to Finances',
  },
];

function findCategoryByKeywords(
  categories: Category[],
  keywords: string[],
  preferredType?: 'income' | 'expenses' | 'savings'
): Category | undefined {
  const pool = preferredType
    ? categories.filter((c) => c.type === preferredType)
    : categories;

  for (const kw of keywords) {
    const lowerKw = kw.toLowerCase();
    const match = pool.find((c) => c.name.toLowerCase().includes(lowerKw));
    if (match) return match;
  }

  for (const kw of keywords) {
    const lowerKw = kw.toLowerCase();
    const match = categories.find((c) => c.name.toLowerCase().includes(lowerKw));
    if (match) return match;
  }

  return undefined;
}

/**
 * Smart Heuristic Classifier (Tier 2 Fallback when no external LLM API key is set)
 */
export function classifyWithSmartHeuristics(
  items: ClassificationInputItem[],
  categories: Category[]
): ClassificationResultItem[] {
  return items.map((item) => {
    const cleanMerchant = cleanUkMerchantString(item.rawDescription);
    const isPositive = item.amount > 0;

    if (isPositive) {
      if (/\b(glasgow|flat|tenant|letting|rent)\b/i.test(item.rawDescription)) {
        const rentCat = findCategoryByKeywords(categories, ['glasgow', 'rent'], 'income');
        if (rentCat) {
          return {
            index: item.index,
            categoryId: rentCat.id,
            cleanMerchant,
            confidence: 92,
            reasoning: 'Rental property inflow matched to Rent from Glasgow Flat',
            source: 'smart_heuristic',
          };
        }
      }

      if (/\b(bonus|award|commission)\b/i.test(item.rawDescription)) {
        const bonusCat = findCategoryByKeywords(categories, ['bonus'], 'income');
        if (bonusCat) {
          return {
            index: item.index,
            categoryId: bonusCat.id,
            cleanMerchant,
            confidence: 90,
            reasoning: 'Bonus inflow matched to Bonus income',
            source: 'smart_heuristic',
          };
        }
      }

      const salaryCat =
        findCategoryByKeywords(categories, ['employment', 'salary'], 'income') ||
        categories.find((c) => c.type === 'income');

      return {
        index: item.index,
        categoryId: salaryCat?.id || null,
        cleanMerchant,
        confidence: 80,
        reasoning: 'Positive inflow mapped to Employment / Income',
        source: 'smart_heuristic',
      };
    }

    // Check negative outflows against UK semantic heuristics
    for (const h of UK_SEMANTIC_HEURISTICS) {
      if (h.keywords.test(item.rawDescription)) {
        const matchedCat = findCategoryByKeywords(categories, h.categoryKeywords);
        if (matchedCat) {
          return {
            index: item.index,
            categoryId: matchedCat.id,
            cleanMerchant: h.defaultCleanMerchant || cleanMerchant,
            confidence: h.confidence,
            reasoning: h.reason,
            source: 'smart_heuristic',
          };
        }
      }
    }

    // Fallback to General (One off) or first expense category with lower confidence so it surfaces in Review Queue
    const generalCat =
      findCategoryByKeywords(categories, ['general', 'shopping'], 'expenses') ||
      categories.find((c) => c.type === 'expenses');

    return {
      index: item.index,
      categoryId: generalCat?.id || null,
      cleanMerchant,
      confidence: 55,
      reasoning: 'Unrecognized merchant queued for 1-tap confirmation',
      source: 'smart_heuristic',
    };
  });
}

/**
 * Hybrid LLM Smart Categorization Engine:
 * 1. Uses Gemini 2.5 Flash (if GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY is set) or OpenAI gpt-4o-mini (if OPENAI_API_KEY is set)
 *    with structured JSON output and few-shot examples from user's categories and rules.
 * 2. Gracefully falls back to `classifyWithSmartHeuristics` when offline or when no API key is configured.
 */
export async function classifyTransactionsBatchWithLLM(params: {
  items: ClassificationInputItem[];
  categories: Category[];
  existingRules?: CategorizationRule[];
}): Promise<ClassificationResultItem[]> {
  const { items, categories, existingRules = [] } = params;
  if (items.length === 0) return [];

  const geminiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const validCategoryIds = new Set(categories.map((c) => c.id));
  const categoryCatalogText = categories
    .map((c) => `- id: "${c.id}", name: "${c.name}", type: "${c.type}"`)
    .join('\n');

  const fewShotRulesText = existingRules
    .slice(0, 15)
    .map(
      (r) =>
        `- Pattern "${r.pattern}" -> categoryId: "${r.categoryId}", cleanMerchant: "${r.cleanMerchant || r.pattern}"`
    )
    .join('\n');

  const systemPrompt = `You are an expert UK personal finance categorization assistant.
Given a batch of bank statement transactions, classify each transaction into the most accurate category from the user's budget categories, normalize the messy bank description into a clean merchant name, and provide a confidence score (0-100) and brief 1-sentence reasoning.

Available Categories:
${categoryCatalogText}

User's Existing Learned Rules (for style and domain reference):
${fewShotRulesText}

Important Domain Rules:
1. Investments, ISA contributions, pension transfers, emergency fund transfers, and factor fees belong to 'savings' categories, NOT 'expenses'.
2. Positive amounts (> 0) are inflows ('income' categories). Negative amounts (< 0) are outflows ('expenses' or 'savings').
3. Only return a categoryId that exists in the Available Categories list above.
4. Return a JSON object with property "results" containing an array of objects:
{
  "results": [
    {
      "index": number,
      "categoryId": "string",
      "cleanMerchant": "string",
      "confidence": number,
      "reasoning": "string"
    }
  ]
}`;

  const userPayload = JSON.stringify(
    items.map((item) => ({
      index: item.index,
      rawDescription: item.rawDescription,
      amountInGBP: (item.amount / 100).toFixed(2),
      direction: item.amount > 0 ? 'INFLOW' : 'OUTFLOW',
    }))
  );

  // 1. Try Gemini 2.5 Flash
  if (geminiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${systemPrompt}\n\nTransactions to classify:\n${userPayload}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          const list = Array.isArray(parsed.results) ? parsed.results : [];
          const resultMap = new Map<number, any>(list.map((r: any) => [r.index, r]));
          const fallbackList = classifyWithSmartHeuristics(items, categories);

          return items.map((item, idx) => {
            const aiMatch = resultMap.get(item.index);
            if (aiMatch && validCategoryIds.has(aiMatch.categoryId)) {
              return {
                index: item.index,
                categoryId: aiMatch.categoryId,
                cleanMerchant:
                  aiMatch.cleanMerchant || cleanUkMerchantString(item.rawDescription),
                confidence: Math.min(100, Math.max(0, Number(aiMatch.confidence) || 80)),
                reasoning: String(aiMatch.reasoning || 'Classified by Gemini AI'),
                source: 'gemini_llm' as const,
              };
            }
            return fallbackList[idx];
          });
        }
      }
    } catch (err) {
      console.warn('Gemini classification fallback to heuristic engine:', err);
    }
  }

  // 2. Try OpenAI gpt-4o-mini if OPENAI_API_KEY is configured
  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Transactions to classify:\n${userPayload}` },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = data?.choices?.[0]?.message?.content;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          const list = Array.isArray(parsed.results) ? parsed.results : [];
          const resultMap = new Map<number, any>(list.map((r: any) => [r.index, r]));
          const fallbackList = classifyWithSmartHeuristics(items, categories);

          return items.map((item, idx) => {
            const aiMatch = resultMap.get(item.index);
            if (aiMatch && validCategoryIds.has(aiMatch.categoryId)) {
              return {
                index: item.index,
                categoryId: aiMatch.categoryId,
                cleanMerchant:
                  aiMatch.cleanMerchant || cleanUkMerchantString(item.rawDescription),
                confidence: Math.min(100, Math.max(0, Number(aiMatch.confidence) || 80)),
                reasoning: String(aiMatch.reasoning || 'Classified by OpenAI'),
                source: 'openai_llm' as const,
              };
            }
            return fallbackList[idx];
          });
        }
      }
    } catch (err) {
      console.warn('OpenAI classification fallback to heuristic engine:', err);
    }
  }

  // 3. Fallback to UK Smart Semantic Heuristic Engine
  return classifyWithSmartHeuristics(items, categories);
}