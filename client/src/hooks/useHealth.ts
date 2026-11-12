import { useEffect, useState } from 'react';
import { getHealth } from '@/lib/api';
import type { HealthReport } from '@/types';

type HealthState =
  | { state: 'loading' }
  | { state: 'online'; report: HealthReport }
  | { state: 'offline' };

const POLL_INTERVAL_MS = 30_000;

/** Polls GET /api/health so the shell can show backend connectivity. */
export function useHealth(): HealthState {
  const [health, setHealth] = useState<HealthState>({ state: 'loading' });

  useEffect(() => {
    let controller = new AbortController();

    const check = async (): Promise<void> => {
      controller.abort();
      controller = new AbortController();
      try {
        const report = await getHealth(controller.signal);
        setHealth(report.status === 'ok' ? { state: 'online', report } : { state: 'offline' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setHealth({ state: 'offline' });
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  return health;
}
