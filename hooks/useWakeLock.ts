'use client';
import { useEffect, useRef, useState } from 'react';

export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (!active) {
      sentinelRef.current?.release();
      sentinelRef.current = null;
      setIsLocked(false);
      return;
    }

    if (!('wakeLock' in navigator)) return;

    const acquire = async () => {
      try {
        sentinelRef.current = await (navigator as Navigator & { wakeLock: WakeLockManager }).wakeLock.request('screen');
        sentinelRef.current.addEventListener('release', () => setIsLocked(false));
        setIsLocked(true);
      } catch {
        setIsLocked(false);
      }
    };

    acquire();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && active) {
        acquire();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      sentinelRef.current?.release();
      sentinelRef.current = null;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [active]);

  return isLocked;
}

interface WakeLockManager {
  request(type: 'screen'): Promise<WakeLockSentinel>;
}
