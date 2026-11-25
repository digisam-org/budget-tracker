'use client';

import { useState, useEffect, useCallback } from 'react';
import { loadAppData, LocalAppData } from './local-services';

export function useLocalAppData() {
  const [data, setData] = useState<LocalAppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const loaded = await loadAppData();
      setData(loaded);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load local database');
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, reload };
}
