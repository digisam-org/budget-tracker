export interface CandidateTransaction {
  id?: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  amount: number; // in pence
  rawDescription: string;
}

export interface TransferPair {
  outflow: CandidateTransaction;
  inflow: CandidateTransaction;
  confidence: number;
}

/**
 * Detects pairs of equal and opposite transactions between distinct accounts within a window of +/- 2 days.
 */
export function findTransferPairs(
  transactions: CandidateTransaction[],
  dayTolerance: number = 2
): TransferPair[] {
  const outflows = transactions.filter((t) => t.amount < 0);
  const inflows = transactions.filter((t) => t.amount > 0);
  const matchedInflowIds = new Set<string | number>();
  const pairs: TransferPair[] = [];

  for (const out of outflows) {
    const targetAmount = Math.abs(out.amount);
    const outDate = new Date(out.date).getTime();

    for (const inf of inflows) {
      const infKey = inf.id || `${inf.accountId}-${inf.date}-${inf.amount}`;
      if (matchedInflowIds.has(infKey)) continue;

      // Must be different accounts
      if (out.accountId === inf.accountId) continue;

      // Amounts must match exactly
      if (inf.amount !== targetAmount) continue;

      // Date check within +/- dayTolerance days
      const infDate = new Date(inf.date).getTime();
      const diffDays = Math.abs(outDate - infDate) / (1000 * 60 * 60 * 24);

      if (diffDays <= dayTolerance) {
        matchedInflowIds.add(infKey);
        pairs.push({
          outflow: out,
          inflow: inf,
          confidence: diffDays === 0 ? 98 : 90,
        });
        break;
      }
    }
  }

  return pairs;
}
