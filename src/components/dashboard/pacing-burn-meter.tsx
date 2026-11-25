'use client';

import { PacingMetrics } from '@/lib/budget/calculator';
import { formatCurrency } from '@/lib/utils';
import { Gauge, Flame, ShieldCheck, AlertTriangle, CalendarClock } from 'lucide-react';

interface PacingBurnMeterProps {
  pacing: PacingMetrics;
  totalPlannedExpenses: number;
  totalActualExpenses: number;
  periodTitle: string;
}

export function PacingBurnMeter({
  pacing,
  totalPlannedExpenses,
  totalActualExpenses,
  periodTitle,
}: PacingBurnMeterProps) {
  const clampedSpentWidth = Math.min(pacing.budgetSpentPct, 100);
  const clampedDaysMarker = Math.min(Math.max(pacing.daysPassedPct, 0), 100);

  const statusConfig = (() => {
    switch (pacing.status) {
      case 'over_pace':
      case 'completed_over':
        return {
          label:
            pacing.status === 'completed_over'
              ? 'Finished Over Budget'
              : `Trending Over (+${pacing.pacingDeltaPct}%)`,
          badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          barClass: 'bg-gradient-to-r from-rose-500 to-rose-400',
          Icon: Flame,
        };
      case 'caution':
        return {
          label: `Slightly Fast (+${pacing.pacingDeltaPct}%)`,
          badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          barClass: 'bg-gradient-to-r from-amber-500 to-amber-400',
          Icon: AlertTriangle,
        };
      case 'upcoming':
        return {
          label: 'Upcoming Period',
          badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
          barClass: 'bg-zinc-600',
          Icon: CalendarClock,
        };
      case 'completed_under':
        return {
          label: 'Finished Under Budget',
          badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          barClass: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
          Icon: ShieldCheck,
        };
      default:
        return {
          label:
            pacing.pacingDeltaPct < 0
              ? `Under Pace (${pacing.pacingDeltaPct}%)`
              : 'Right On Pace',
          badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          barClass: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
          Icon: ShieldCheck,
        };
    }
  })();

  const StatusIcon = statusConfig.Icon;

  return (
    <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white tracking-tight">
              Pacing &amp; Burn-Rate Meter
            </h2>
            <p className="text-[11px] text-zinc-400">
              {periodTitle} · Day {pacing.daysElapsed} of {pacing.totalDays}
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border shrink-0 ${statusConfig.badgeClass}`}
        >
          <StatusIcon className="w-3 h-3" />
          {statusConfig.label}
        </span>
      </div>

      {/* Dual Comparison Readout */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="p-2.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            Budget Spent
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className={`text-lg font-extrabold ${
                pacing.budgetSpentPct > 100
                  ? 'text-rose-400'
                  : pacing.pacingDeltaPct > 10
                  ? 'text-rose-300'
                  : pacing.pacingDeltaPct > 0
                  ? 'text-amber-300'
                  : 'text-emerald-400'
              }`}
            >
              {pacing.budgetSpentPct}%
            </span>
            <span className="text-[10px] text-zinc-400 truncate">
              ({formatCurrency(totalActualExpenses)} / {formatCurrency(totalPlannedExpenses)})
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            Days Passed
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-extrabold text-sky-300">
              {pacing.daysPassedPct}%
            </span>
            <span className="text-[10px] text-zinc-400">
              {pacing.daysRemaining > 0
                ? `${pacing.daysRemaining}d left`
                : pacing.periodState === 'past'
                ? 'Period closed'
                : 'Not started'}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Pacing Track with Vertical Calendar Marker */}
      <div className="space-y-1.5 pt-1">
        <div className="relative h-4 rounded-full bg-zinc-950 border border-zinc-800 overflow-visible">
          {/* Spent fill bar */}
          <div
            className={`h-full rounded-full transition-all duration-500 ${statusConfig.barClass}`}
            style={{ width: `${clampedSpentWidth}%` }}
          />

          {/* Vertical Pace Marker (Days Passed %) */}
          {pacing.daysPassedPct > 0 && pacing.daysPassedPct < 100 && (
            <div
              className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.8)] transition-all duration-500"
              style={{ left: `${clampedDaysMarker}%` }}
              title={`Calendar pace: ${pacing.daysPassedPct}%`}
            >
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-sky-300 whitespace-nowrap">
                Pace {pacing.daysPassedPct}%
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-zinc-500 px-0.5">
          <span>0%</span>
          <span>50%</span>
          <span>100% Budget</span>
        </div>
      </div>

      {/* Burn Rate & Projection Footer */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80 text-center">
        <div>
          <p className="text-[10px] text-zinc-500">Daily Burn</p>
          <p className="text-xs font-bold text-zinc-200 mt-0.5">
            {formatCurrency(pacing.dailyActualBurn)}/d
          </p>
        </div>
        <div className="border-x border-zinc-800/80">
          <p className="text-[10px] text-zinc-500">Safe Allowance</p>
          <p className="text-xs font-bold text-emerald-400 mt-0.5">
            {pacing.daysRemaining > 0
              ? `${formatCurrency(pacing.dailySafeAllowance)}/d`
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500">
            {pacing.periodState === 'current' ? 'Projected End' : 'Total Spent'}
          </p>
          <p
            className={`text-xs font-bold mt-0.5 ${
              pacing.projectedTotalSpend > totalPlannedExpenses && totalPlannedExpenses > 0
                ? 'text-rose-400'
                : 'text-zinc-200'
            }`}
          >
            {formatCurrency(pacing.projectedTotalSpend)}
          </p>
        </div>
      </div>
    </div>
  );
}
