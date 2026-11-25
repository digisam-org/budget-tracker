'use client';

import { useState, useMemo } from 'react';
import { CategoryBudgetSummary } from '@/lib/budget/calculator';
import { formatCurrency } from '@/lib/utils';
import { PieChart } from 'lucide-react';

interface SpendingDonutChartProps {
  categories: CategoryBudgetSummary[];
  periodTitle: string;
}

const SLICE_PALETTE = [
  '#f43f5e', // rose-500
  '#fb923c', // orange-400
  '#facc15', // yellow-400
  '#34d399', // emerald-400
  '#38bdf8', // sky-400
  '#818cf8', // indigo-400
  '#c084fc', // purple-400
  '#f472b6', // pink-400
  '#2dd4bf', // teal-400
  '#a1a1aa', // zinc-400
];

interface SliceItem {
  id: string;
  label: string;
  actual: number;
  planned: number;
  pct: number;
  color: string;
}

export function SpendingDonutChart({
  categories,
  periodTitle,
}: SpendingDonutChartProps) {
  const [groupBy, setGroupBy] = useState<'category' | 'subgroup'>('category');
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null);

  const { slices, totalExpenses } = useMemo(() => {
    const expenseCats = categories.filter(
      (c) => c.type === 'expenses' && c.actualAmount > 0
    );

    const total = expenseCats.reduce((sum, c) => sum + c.actualAmount, 0);
    if (total === 0) {
      return { slices: [] as SliceItem[], totalExpenses: 0 };
    }

    if (groupBy === 'subgroup') {
      const map = new Map<string, { actual: number; planned: number }>();
      for (const c of expenseCats) {
        const key = c.subgroup?.trim() || 'Living & General';
        const prev = map.get(key) || { actual: 0, planned: 0 };
        map.set(key, {
          actual: prev.actual + c.actualAmount,
          planned: prev.planned + c.plannedAmount,
        });
      }

      const sorted = Array.from(map.entries())
        .sort((a, b) => b[1].actual - a[1].actual)
        .map(([label, vals], idx) => ({
          id: `sg_${label}`,
          label,
          actual: vals.actual,
          planned: vals.planned,
          pct: Math.round((vals.actual / total) * 100),
          color: SLICE_PALETTE[idx % SLICE_PALETTE.length],
        }));

      return { slices: sorted, totalExpenses: total };
    }

    const sorted = [...expenseCats]
      .sort((a, b) => b.actualAmount - a.actualAmount)
      .map((c, idx) => ({
        id: c.categoryId,
        label: c.categoryName,
        actual: c.actualAmount,
        planned: c.plannedAmount,
        pct: Math.round((c.actualAmount / total) * 100),
        color: SLICE_PALETTE[idx % SLICE_PALETTE.length],
      }));

    return { slices: sorted, totalExpenses: total };
  }, [categories, groupBy]);

  const activeSlice =
    slices.find((s) => s.id === activeSliceId) || null;

  // SVG Donut Geometry
  const size = 164;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Precompute cumulative offsets cleanly
  const renderedSlices = useMemo(() => {
    let cumulative = 0;
    return slices.map((slice) => {
      const fraction = totalExpenses > 0 ? slice.actual / totalExpenses : 0;
      const dashLength = Math.max(0, fraction * circumference - 1.5);
      const offset = -cumulative * circumference;
      cumulative += fraction;
      return {
        ...slice,
        dashLength,
        offset,
      };
    });
  }, [slices, totalExpenses, circumference]);

  return (
    <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-4">
      {/* Header & Category/Subgroup Toggle */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <PieChart className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white tracking-tight">
              Spending Breakdown
            </h2>
            <p className="text-[11px] text-zinc-400">
              {periodTitle} expense distribution
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-xl border border-zinc-800 shrink-0">
          <button
            type="button"
            onClick={() => {
              setGroupBy('category');
              setActiveSliceId(null);
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
              groupBy === 'category'
                ? 'bg-emerald-500 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Category
          </button>
          <button
            type="button"
            onClick={() => {
              setGroupBy('subgroup');
              setActiveSliceId(null);
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
              groupBy === 'subgroup'
                ? 'bg-emerald-500 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Subgroup
          </button>
        </div>
      </div>

      {slices.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          No expense transactions tracked in {periodTitle} yet.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Interactive SVG Donut */}
          <div className="flex items-center justify-center">
            <div className="relative" style={{ width: size, height: size }}>
              <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="-rotate-90"
              >
                {/* Background ring */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="#18181b"
                  strokeWidth={strokeWidth}
                />

                {renderedSlices.map((s) => {
                  const isActive = activeSliceId === s.id;
                  const isDimmed = activeSliceId !== null && !isActive;

                  return (
                    <circle
                      key={s.id}
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={isActive ? strokeWidth + 4 : strokeWidth}
                      strokeDasharray={`${s.dashLength} ${circumference}`}
                      strokeDashoffset={s.offset}
                      strokeLinecap="butt"
                      className="cursor-pointer transition-all duration-200"
                      style={{ opacity: isDimmed ? 0.35 : 1 }}
                      onClick={() =>
                        setActiveSliceId((prev) => (prev === s.id ? null : s.id))
                      }
                      onMouseEnter={() => setActiveSliceId(s.id)}
                      onMouseLeave={() => setActiveSliceId(null)}
                    />
                  );
                })}
              </svg>

              {/* Center Readout */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-5 pointer-events-none">
                <span className="text-[10px] text-zinc-400 truncate max-w-full font-medium">
                  {activeSlice ? activeSlice.label : 'Total Spend'}
                </span>
                <span className="text-base font-extrabold text-white mt-0.5">
                  {formatCurrency(activeSlice ? activeSlice.actual : totalExpenses)}
                </span>
                <span className="text-[10px] font-semibold text-zinc-400">
                  {activeSlice ? `${activeSlice.pct}% of spend` : `${slices.length} groups`}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Legend List */}
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {slices.map((s) => {
              const isActive = activeSliceId === s.id;
              const isOver = s.planned > 0 && s.actual > s.planned;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setActiveSliceId((prev) => (prev === s.id ? null : s.id))
                  }
                  onMouseEnter={() => setActiveSliceId(s.id)}
                  onMouseLeave={() => setActiveSliceId(null)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-colors ${
                    isActive
                      ? 'bg-zinc-800/90 border border-zinc-700'
                      : 'bg-zinc-950/50 border border-zinc-800/60 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-xs font-medium text-zinc-200 truncate">
                      {s.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-zinc-500">
                      {s.pct}%
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        isOver ? 'text-rose-400' : 'text-zinc-100'
                      }`}
                    >
                      {formatCurrency(s.actual)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
