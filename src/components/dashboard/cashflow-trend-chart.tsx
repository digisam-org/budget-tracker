'use client';

import { useState, useMemo } from 'react';
import { MonthlyCashflowPoint } from '@/lib/budget/calculator';
import { formatCurrency } from '@/lib/utils';
import { BarChart3 } from 'lucide-react';

interface CashflowTrendChartProps {
  year: number;
  series: MonthlyCashflowPoint[];
  selectedMonth: number | null;
  onSelectMonth: (month: number) => void;
}

export function CashflowTrendChart({
  year,
  series,
  selectedMonth,
  onSelectMonth,
}: CashflowTrendChartProps) {
  const [dataMode, setDataMode] = useState<'actual' | 'planned'>('actual');
  const [chartStyle, setChartStyle] = useState<'grouped' | 'stacked'>('grouped');
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  const activeMonthNum = hoveredMonth ?? selectedMonth ?? 9;
  const activePoint =
    series.find((s) => s.month === activeMonthNum) || series[0];

  const { maxVal, points } = useMemo(() => {
    let max = 10000; // minimum £100 scale so empty charts still look clean
    const mapped = series.map((pt) => {
      const income = dataMode === 'actual' ? pt.actualIncome : pt.plannedIncome;
      const expenses = dataMode === 'actual' ? pt.actualExpenses : pt.plannedExpenses;
      const savings = dataMode === 'actual' ? pt.actualSavings : pt.plannedSavings;

      if (chartStyle === 'stacked') {
        max = Math.max(max, income, expenses + savings);
      } else {
        max = Math.max(max, income, expenses, savings);
      }
      return {
        month: pt.month,
        label: pt.label,
        income,
        expenses,
        savings,
      };
    });
    return { maxVal: max, points: mapped };
  }, [series, dataMode, chartStyle]);

  const activeData =
    points.find((p) => p.month === activeMonthNum) || points[0];

  return (
    <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-4">
      {/* Header & Mode Toggles */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white tracking-tight">
              {year} Cashflow Trend
            </h2>
            <p className="text-[11px] text-zinc-400">
              Tap any month to inspect Income, Expenses &amp; Savings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-xl border border-zinc-800 shrink-0">
          <button
            type="button"
            onClick={() => setDataMode('actual')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
              dataMode === 'actual'
                ? 'bg-emerald-500 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Actual
          </button>
          <button
            type="button"
            onClick={() => setDataMode('planned')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
              dataMode === 'planned'
                ? 'bg-emerald-500 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Planned
          </button>
        </div>
      </div>

      {/* Selected / Hovered Month Inspector Pill */}
      {activeData && (
        <div className="px-3 py-2 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-2 text-[11px]">
          <span className="font-bold text-white shrink-0">
            {activePoint?.label} {year}
          </span>
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-none">
            <span className="text-emerald-400 font-semibold whitespace-nowrap">
              In: {formatCurrency(activeData.income)}
            </span>
            <span className="text-rose-400 font-semibold whitespace-nowrap">
              Exp: {formatCurrency(activeData.expenses)}
            </span>
            <span className="text-sky-400 font-semibold whitespace-nowrap">
              Sav: {formatCurrency(activeData.savings)}
            </span>
          </div>
        </div>
      )}

      {/* 12-Month Bar Chart Canvas */}
      <div className="relative pt-2">
        {/* Horizontal dashed reference lines */}
        <div className="absolute inset-x-0 top-2 bottom-6 flex flex-col justify-between pointer-events-none">
          <div className="border-b border-dashed border-zinc-800/70 w-full flex justify-end">
            <span className="text-[9px] text-zinc-600 -mt-2.5 bg-zinc-900 px-1">
              £{Math.round(maxVal / 100).toLocaleString()}
            </span>
          </div>
          <div className="border-b border-dashed border-zinc-800/50 w-full flex justify-end">
            <span className="text-[9px] text-zinc-600 -mt-2.5 bg-zinc-900 px-1">
              £{Math.round(maxVal / 200).toLocaleString()}
            </span>
          </div>
          <div className="border-b border-zinc-800 w-full" />
        </div>

        {/* Bars Grid */}
        <div className="relative z-10 grid grid-cols-12 gap-1 items-end h-40">
          {points.map((pt) => {
            const isSelected = selectedMonth === pt.month;
            const incPct = Math.round((pt.income / maxVal) * 100);
            const expPct = Math.round((pt.expenses / maxVal) * 100);
            const savPct = Math.round((pt.savings / maxVal) * 100);

            return (
              <button
                key={pt.month}
                type="button"
                onClick={() => onSelectMonth(pt.month)}
                onMouseEnter={() => setHoveredMonth(pt.month)}
                onMouseLeave={() => setHoveredMonth(null)}
                className={`group flex flex-col items-center h-full justify-end rounded-lg pt-1 transition-colors ${
                  isSelected
                    ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40'
                    : 'hover:bg-zinc-800/40'
                }`}
                aria-label={`${pt.label} ${year}`}
              >
                <div className="w-full flex-1 flex items-end justify-center gap-[2px] px-0.5 pb-1">
                  {chartStyle === 'grouped' ? (
                    <>
                      {/* Income bar */}
                      <div
                        className="w-1.5 rounded-t-sm bg-emerald-400 transition-all duration-300"
                        style={{ height: `${pt.income > 0 ? Math.max(incPct, 3) : 0}%` }}
                      />
                      {/* Expenses bar */}
                      <div
                        className="w-1.5 rounded-t-sm bg-rose-400 transition-all duration-300"
                        style={{ height: `${pt.expenses > 0 ? Math.max(expPct, 3) : 0}%` }}
                      />
                      {/* Savings bar */}
                      <div
                        className="w-1.5 rounded-t-sm bg-sky-400 transition-all duration-300"
                        style={{ height: `${pt.savings > 0 ? Math.max(savPct, 3) : 0}%` }}
                      />
                    </>
                  ) : (
                    <>
                      {/* Stacked: Income side-by-side with (Expenses + Savings) */}
                      <div
                        className="w-2 rounded-t-sm bg-emerald-400 transition-all duration-300"
                        style={{ height: `${pt.income > 0 ? Math.max(incPct, 3) : 0}%` }}
                      />
                      <div className="w-2 h-full flex flex-col justify-end">
                        {pt.savings > 0 && (
                          <div
                            className="w-full rounded-t-sm bg-sky-400 transition-all duration-300"
                            style={{ height: `${Math.max(savPct, 3)}%` }}
                          />
                        )}
                        {pt.expenses > 0 && (
                          <div
                            className={`w-full bg-rose-400 transition-all duration-300 ${
                              pt.savings === 0 ? 'rounded-t-sm' : ''
                            }`}
                            style={{ height: `${Math.max(expPct, 3)}%` }}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>

                <span
                  className={`text-[9px] font-semibold pb-0.5 ${
                    isSelected ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                >
                  {pt.label.slice(0, 1)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend & Grouped/Stacked Toggle */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-[10px]">
        <div className="flex items-center gap-3 text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Income
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-400" /> Expenses
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-400" /> Savings
          </span>
        </div>

        <button
          type="button"
          onClick={() =>
            setChartStyle((s) => (s === 'grouped' ? 'stacked' : 'grouped'))
          }
          className="text-zinc-400 hover:text-emerald-400 font-semibold transition-colors"
        >
          {chartStyle === 'grouped' ? 'Switch to Stacked' : 'Switch to Side-by-Side'}
        </button>
      </div>
    </div>
  );
}
