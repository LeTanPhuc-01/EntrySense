export type CrossingDirection = 'in' | 'out';

export type InferenceMode = 'edge' | 'server' | null;

export type SyncSource = 'pc' | 'pi' | null;

export interface CrossingEvent {
  id: string;
  direction: CrossingDirection;
  timestamp: string;
}

export interface HourlyBucket {
  hour: number; // 0-23 in lot local timezone (America/Chicago)
  label: string; // e.g., "8 AM"
  shortLabel: string; // e.g., "8a"
  typicalPct: number; // Historical rolling average occupancy % (0-100)
  typicalOccupied: number; // Historical average occupied count
  sampleCount: number; // Number of historical samples collected for this hour
  todayPct: number | null; // Today's observed occupancy % for this hour (null if not yet observed today)
  todayOccupied: number | null; // Today's latest occupied count in this hour
  ingressCount: number; // Today's vehicles entered during this hour
  egressCount: number; // Today's vehicles exited during this hour
  isPeak: boolean; // True when typicalPct >= 80
}

export interface LotOccupancySnapshot {
  lotId: string;
  lotName: string;
  timezone: string;
  capacity: number;
  occupied: number;
  free: number;
  entered: number;
  left: number;
  netFlow: number;
  occupancyPercent: number;
  updatedAt: string | null;
  since: string | null;
  source: SyncSource;
  mode: InferenceMode;
  hasLiveSync: boolean;
  events: CrossingEvent[];
  hourlyStats: HourlyBucket[];
}

export interface ParkLabsSyncPayload {
  lotId?: string;
  lotName?: string;
  capacity: number;
  entered: number;
  left: number;
  occupied: number;
  mode?: string;
  source?: string;
  timestamp: string;
  since?: string | null;
  events?: Array<{
    id: string;
    direction: string;
    timestamp: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';
