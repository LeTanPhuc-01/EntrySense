import {useCallback, useEffect, useRef, useState} from 'react';
import type {
  ConnectionState,
  CrossingDirection,
  LotOccupancySnapshot,
} from '../types/entrysense';

const SNAPSHOT_CACHE_KEY = 'entrysense-last-snapshot-v3';
const POLL_INTERVAL_MS = 12_000; // 12s polling (within 10-15s budget for Cloudflare free tier)

type TransportMode = 'detecting' | 'sse' | 'poll';

export interface SignalPulse {
  id: string;
  direction: CrossingDirection;
}

function readCachedSnapshot(): LotOccupancySnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LotOccupancySnapshot>;
    if (typeof parsed.capacity !== 'number' || typeof parsed.free !== 'number') {
      return null;
    }
    return {
      lotId: parsed.lotId ?? 'main',
      lotName: parsed.lotName ?? 'Main Parking Area',
      timezone: parsed.timezone ?? 'America/Chicago',
      capacity: parsed.capacity,
      occupied: parsed.occupied ?? 0,
      free: parsed.free,
      entered: parsed.entered ?? 0,
      left: parsed.left ?? 0,
      netFlow: parsed.netFlow ?? 0,
      occupancyPercent: parsed.occupancyPercent ?? 0,
      updatedAt: parsed.updatedAt ?? null,
      since: parsed.since ?? null,
      source: parsed.source === 'pc' || parsed.source === 'pi' ? parsed.source : null,
      mode: parsed.mode === 'edge' || parsed.mode === 'server' ? parsed.mode : null,
      hasLiveSync: Boolean(parsed.hasLiveSync),
      events: Array.isArray(parsed.events) ? parsed.events : [],
      hourlyStats: Array.isArray(parsed.hourlyStats) ? parsed.hourlyStats : [],
    };
  } catch {
    return null;
  }
}

function writeCachedSnapshot(snapshot: LotOccupancySnapshot) {
  try {
    localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota errors
  }
}

export function useEntrySenseStream(isOnline: boolean) {
  const [snapshot, setSnapshot] = useState<LotOccupancySnapshot | null>(readCachedSnapshot);
  const [loading, setLoading] = useState<boolean>(() => readCachedSnapshot() === null);
  const [error, setError] = useState<string | null>(null);
  const [transportMode, setTransportMode] = useState<TransportMode>('detecting');
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    isOnline ? 'connecting' : 'offline'
  );
  const [lastPulse, setLastPulse] = useState<SignalPulse | null>(null);
  const lastSeenEventIdRef = useRef<string | null>(null);
  const pulseTimeoutRef = useRef<number | null>(null);

  const applySnapshot = useCallback((next: LotOccupancySnapshot, allowPulse: boolean) => {
    setSnapshot(next);
    writeCachedSnapshot(next);
    setLoading(false);
    setError(null);

    const latestEvent = next.events[0];
    if (allowPulse && latestEvent && latestEvent.id !== lastSeenEventIdRef.current) {
      const hadPrevious = lastSeenEventIdRef.current !== null;
      lastSeenEventIdRef.current = latestEvent.id;
      if (hadPrevious) {
        setLastPulse({
          id: latestEvent.id,
          direction: latestEvent.direction,
        });
        if (pulseTimeoutRef.current) {
          window.clearTimeout(pulseTimeoutRef.current);
        }
        pulseTimeoutRef.current = window.setTimeout(() => {
          setLastPulse(null);
        }, 900);
      }
    } else if (latestEvent && !lastSeenEventIdRef.current) {
      lastSeenEventIdRef.current = latestEvent.id;
    }
  }, []);

  const fetchOccupancy = useCallback(
    async (allowPulse: boolean) => {
      try {
        const response = await fetch('/api/occupancy', {
          headers: {Accept: 'application/json'},
        });
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }
        const realtimeHeader = response.headers.get('X-EntrySense-Realtime');
        setTransportMode((prev) => {
          if (prev !== 'detecting') return prev;
          return realtimeHeader === 'sse' ? 'sse' : 'poll';
        });
        const data = (await response.json()) as LotOccupancySnapshot;
        setConnectionState('live');
        applySnapshot(data, allowPulse);
      } catch (err) {
        setLoading(false);
        setConnectionState(navigator.onLine ? 'reconnecting' : 'offline');
        setError(err instanceof Error ? err.message : 'Unable to reach occupancy service.');
      }
    },
    [applySnapshot]
  );

  const refreshSnapshot = useCallback(async () => {
    await fetchOccupancy(false);
  }, [fetchOccupancy]);

  // Initial fetch & transport detection (SSE on Node server, 12s visibility-aware polling on Cloudflare Pages)
  useEffect(() => {
    if (!isOnline) {
      setConnectionState('offline');
      return;
    }
    void fetchOccupancy(false);
  }, [isOnline, fetchOccupancy]);

  // Mode A: Persistent Node server SSE stream
  useEffect(() => {
    if (!isOnline || transportMode !== 'sse') return;

    setConnectionState('connecting');
    const source = new EventSource('/api/stream');

    const handleSnapshot = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as LotOccupancySnapshot;
        setConnectionState('live');
        applySnapshot(data, false);
      } catch {
        // Ignore malformed frame
      }
    };

    const handleSignal = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as LotOccupancySnapshot;
        setConnectionState('live');
        applySnapshot(data, true);
      } catch {
        // Ignore malformed frame
      }
    };

    source.onopen = () => {
      setConnectionState('live');
    };

    source.onerror = () => {
      setConnectionState(navigator.onLine ? 'reconnecting' : 'offline');
    };

    source.addEventListener('snapshot', handleSnapshot as EventListener);
    source.addEventListener('signal', handleSignal as EventListener);

    return () => {
      source.removeEventListener('snapshot', handleSnapshot as EventListener);
      source.removeEventListener('signal', handleSignal as EventListener);
      source.close();
    };
  }, [isOnline, transportMode, applySnapshot]);

  // Mode B: Cloudflare Pages visibility-aware polling (12s, edge-cached with s-maxage=5)
  useEffect(() => {
    if (!isOnline || transportMode !== 'poll') return;

    const tick = () => {
      if (document.visibilityState === 'visible') {
        void fetchOccupancy(true);
      }
    };

    const intervalId = window.setInterval(tick, POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchOccupancy(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isOnline, transportMode, fetchOccupancy]);

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, []);

  return {
    snapshot,
    loading,
    error,
    connectionState,
    lastPulse,
    refreshSnapshot,
  };
}
