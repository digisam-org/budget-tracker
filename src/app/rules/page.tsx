'use client';

import { useLocalAppData } from '@/lib/storage/use-local-app-data';
import { RulesManagerClient } from '@/components/rules/rules-manager-client';
import { PrivacyPwaSettingsCard } from '@/components/rules/privacy-pwa-settings-card';
import { BackupSyncCard } from '@/components/rules/backup-sync-card';
import { Loader2 } from 'lucide-react';

export default function RulesPage() {
  const { data, error, reload } = useLocalAppData();

  const pendingCount = data
    ? data.transactions.filter((t) => t.status === 'pending').length
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Rules &amp; Device Settings
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          100% on-device rules, budget settings, Privacy Lock, and offline Excel/JSON backups.
        </p>
      </div>

      {error ? (
        <div className="p-6 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
          {error}
        </div>
      ) : !data ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          <p className="text-xs">Loading local settings...</p>
        </div>
      ) : (
        <>
          <RulesManagerClient
            initialRules={data.rules}
            categories={data.categories}
            initialSettings={data.settings}
            pendingCount={pendingCount}
          />
          <PrivacyPwaSettingsCard />
          <BackupSyncCard
            defaultYear={data.settings.startingYear || 2026}
            onRestored={reload}
          />
        </>
      )}
    </div>
  );
}
