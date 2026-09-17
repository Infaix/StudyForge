'use client';

import { useEffect, useState } from 'react';
import {
  getActiveTimerSnapshot,
  getTimerLock,
  getCurrentTabId,
  getHubActiveTimerStatus,
  type HubActiveTimer,
} from '@/lib/client/studySubmission';

/**
 * Polls the canonical localStorage snapshot and lock every second while any
 * timer session is open (cheap read), or every 30 s when idle. The hub CTA
 * always reflects the true live state without owning its own timer logic.
 */
export function useActiveTimerForHub(): HubActiveTimer {
  const [timer, setTimer] = useState<HubActiveTimer>(() => {
    const snap = getActiveTimerSnapshot();
    const lock = getTimerLock();
    return getHubActiveTimerStatus(snap, { now: Date.now(), tabId: getCurrentTabId(), lock });
  });

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      const snap = getActiveTimerSnapshot();
      const lock = getTimerLock();
      setTimer(getHubActiveTimerStatus(snap, { now: Date.now(), tabId: getCurrentTabId(), lock }));
    };
    // Fast tick while a session exists; slow tick when hub is idle.
    const interval = setInterval(tick, timer.state === 'none' ? 30_000 : 1_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [timer.state]);

  return timer;
}