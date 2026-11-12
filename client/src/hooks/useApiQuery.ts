import { type DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { onDataChanged } from '@/lib/events';

export interface QueryState<T> {
  data: T | undefined;
  error: string | null;
  /** True only for the first load (no data yet). */
  loading: boolean;
  /** True while re-fetching with existing data on screen. */
  refreshing: boolean;
  reload: () => void;
}

/**
 * Fetches data on mount, when `deps` change, and whenever any mutation
 * broadcasts a data-change event. Stale responses are aborted.
 */
export function useApiQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => onDataChanged(reload), [reload]);

  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(errorMessage(caught));
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => controller.abort();
  }, [...deps, version]);

  return { data, error, loading, refreshing, reload };
}

/** Debounces a fast-changing value (e.g. search input). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
