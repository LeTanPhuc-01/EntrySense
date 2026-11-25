import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import express, {type Request, type Response} from 'express';
import {createServer as createViteServer} from 'vite';
import type {
  CrossingEvent,
  HourlyBucket,
  InferenceMode,
  LotOccupancySnapshot,
  SyncSource,
} from './src/types/entrysense.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DEFAULT_LOT_ID = 'main';
const DEFAULT_TIMEZONE = 'America/Chicago';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_STORED_EVENTS = 25;
const MAX_RETURNED_EVENTS = 10;
const MAX_LOTS = 50;
const PC_ARBITRATION_WINDOW_MS = 90_000;
const TREND_SAMPLE_INTERVAL_MS = 10 * 60_000;
const STALE_WARNING_SEC = 150;
const OFFLINE_WARNING_SEC = 900;
const EDGE_CACHE_HEADER = 'public, s-maxage=5';

// Per-key token bucket (~1 req/sec sustained, burst of 5)
const RATE_BURST = 5;
const RATE_REFILL_PER_MS = 1 / 1000;
const rateBuckets = new Map<string, {tokens: number; lastRefillMs: number}>();

// Strict ISO-8601 timestamp with timezone offset or Z
const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const DEFAULT_LOT_NAME =
  (process.env.ENTRYSENSE_LOT_NAME || '').trim().slice(0, 60) || 'Main Parking Area';
const DEFAULT_LOT_CAPACITY = (() => {
  const parsed = Number.parseInt(process.env.ENTRYSENSE_LOT_CAPACITY || '', 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 50_000 ? parsed : 120;
})();
const LOT_TIMEZONE = (() => {
  const candidate = (process.env.ENTRYSENSE_TIMEZONE || '').trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', {timeZone: candidate});
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
})();

interface HourTrendAccumulator {
  localHour: number;
  sampleCount: number;
  sumOccupancyPct: number;
  sumOccupied: number;
  todayDate: string | null;
  todaySampleCount: number;
  todaySumPct: number;
  todayLastOccupied: number;
  todayEntered: number;
  todayLeft: number;
  lastSampledAt: string | null;
}

interface LotInternalState {
  lotId: string;
  lotName: string;
  capacity: number;
  occupied: number;
  entered: number;
  left: number;
  mode: InferenceMode;
  source: SyncSource;
  since: string | null;
  updatedAt: string | null;
  lastSeenAt: string | null;
  lastPcAcceptedAt: string | null;
  hasLiveSync: boolean;
  events: CrossingEvent[];
  trends: Map<number, HourTrendAccumulator>;
}

function getLocalHourAndDate(isoOrDate: string | Date, timeZone = LOT_TIMEZONE): {
  hour: number;
  dateKey: string;
} {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  let year = '1970';
  let month = '01';
  let day = '01';
  let hourStr = '00';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
    else if (part.type === 'hour') hourStr = part.value;
  }
  const hour = Number.parseInt(hourStr, 10) % 24;
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    dateKey: `${year}-${month}-${day}`,
  };
}

function formatHourLabel(hour: number): {label: string; shortLabel: string} {
  if (hour === 0) return {label: '12 AM', shortLabel: '12a'};
  if (hour < 12) return {label: `${hour} AM`, shortLabel: `${hour}a`};
  if (hour === 12) return {label: '12 PM', shortLabel: '12p'};
  return {label: `${hour - 12} PM`, shortLabel: `${hour - 12}p`};
}

function buildHourlyBuckets(
  trends: Map<number, HourTrendAccumulator>,
  currentDateKey: string
): HourlyBucket[] {
  const buckets: HourlyBucket[] = [];
  for (let hour = 6; hour <= 23; hour += 1) {
    const {label, shortLabel} = formatHourLabel(hour);
    const acc = trends.get(hour);
    const sampleCount = acc?.sampleCount ?? 0;
    const typicalPct =
      sampleCount > 0 ? Math.min(100, Math.round((acc!.sumOccupancyPct ?? 0) / sampleCount)) : 0;
    const typicalOccupied =
      sampleCount > 0 ? Math.round((acc!.sumOccupied ?? 0) / sampleCount) : 0;

    const isToday = acc?.todayDate === currentDateKey && (acc?.todaySampleCount ?? 0) > 0;
    const todayPct = isToday
      ? Math.min(100, Math.round(acc!.todaySumPct / acc!.todaySampleCount))
      : null;
    const todayOccupied = isToday ? acc!.todayLastOccupied : null;

    buckets.push({
      hour,
      label,
      shortLabel,
      typicalPct,
      typicalOccupied,
      sampleCount,
      todayPct,
      todayOccupied,
      ingressCount: acc?.todayDate === currentDateKey ? acc.todayEntered : 0,
      egressCount: acc?.todayDate === currentDateKey ? acc.todayLeft : 0,
      isPeak: sampleCount > 0 && typicalPct >= 80,
    });
  }
  return buckets;
}

function createInitialLot(lotId: string, lotName: string, capacity: number): LotInternalState {
  return {
    lotId,
    lotName,
    capacity,
    occupied: 0,
    entered: 0,
    left: 0,
    mode: null,
    source: null,
    since: null,
    updatedAt: null,
    lastSeenAt: null,
    lastPcAcceptedAt: null,
    hasLiveSync: false,
    events: [],
    trends: new Map<number, HourTrendAccumulator>(),
  };
}

const lots = new Map<string, LotInternalState>([
  [DEFAULT_LOT_ID, createInitialLot(DEFAULT_LOT_ID, DEFAULT_LOT_NAME, DEFAULT_LOT_CAPACITY)],
]);

const sseClients = new Map<string, Set<Response>>();

function sanitizeLotId(raw?: string): string {
  if (!raw || typeof raw !== 'string') return DEFAULT_LOT_ID;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return cleaned.slice(0, 32) || DEFAULT_LOT_ID;
}

function getOrCreateLot(lotId?: string): LotInternalState {
  const normalized = sanitizeLotId(lotId);
  let lot = lots.get(normalized);
  if (!lot) {
    if (lots.size >= MAX_LOTS) {
      return lots.get(DEFAULT_LOT_ID)!;
    }
    lot = createInitialLot(normalized, `Lot ${normalized.toUpperCase()}`, DEFAULT_LOT_CAPACITY);
    lots.set(normalized, lot);
  }
  return lot;
}

type AuthenticatedPublisher = 'pc' | 'pi' | 'shared';

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function checkRateLimit(keyId: string): boolean {
  const now = Date.now();
  const existing = rateBuckets.get(keyId);
  if (!existing) {
    rateBuckets.set(keyId, {tokens: RATE_BURST - 1, lastRefillMs: now});
    return true;
  }
  const elapsed = Math.max(0, now - existing.lastRefillMs);
  const nextTokens = Math.min(RATE_BURST, existing.tokens + elapsed * RATE_REFILL_PER_MS);
  if (nextTokens < 1) {
    existing.tokens = nextTokens;
    existing.lastRefillMs = now;
    return false;
  }
  existing.tokens = nextTokens - 1;
  existing.lastRefillMs = now;
  return true;
}

function verifyIngestAuthAndRateLimit(req: Request, res: Response): AuthenticatedPublisher | null {
  const pcKey = (process.env.INGEST_KEY_PC || '').trim();
  const piKey = (process.env.INGEST_KEY_PI || '').trim();
  const legacyKey = (process.env.ENTRYSENSE_INGEST_KEY || '').trim();

  const hasPerPublisherKeys = pcKey.length > 0 || piKey.length > 0;
  if (!hasPerPublisherKeys && legacyKey.length === 0) {
    res.status(503).json({error: 'Ingest keys are not configured on the server.'});
    return null;
  }

  const authHeader = req.header('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const apiKeyHeader = (req.header('x-api-key') || '').trim();
  const provided = bearerToken || apiKeyHeader;

  if (!provided) {
    res.status(401).json({error: 'Missing or invalid bearer token.'});
    return null;
  }

  let publisher: AuthenticatedPublisher | null = null;
  if (hasPerPublisherKeys) {
    const matchesPc = pcKey.length > 0 && constantTimeEquals(pcKey, provided);
    const matchesPi = piKey.length > 0 && constantTimeEquals(piKey, provided);
    if (matchesPc && !matchesPi) publisher = 'pc';
    else if (matchesPi && !matchesPc) publisher = 'pi';
    else if (matchesPc && matchesPi) publisher = 'shared';
  } else if (constantTimeEquals(legacyKey, provided)) {
    publisher = 'shared';
  }

  if (!publisher) {
    res.status(401).json({error: 'Missing or invalid bearer token.'});
    return null;
  }

  if (!checkRateLimit(publisher)) {
    res.setHeader('Retry-After', '1');
    res.status(429).json({error: 'Rate limit exceeded. Slow down sync requests.'});
    return null;
  }

  return publisher;
}

function isValidIso8601(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!ISO_8601_RE.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function isNonNegativeInt(value: unknown, max = 10_000_000): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

function recordTrendSample(
  lot: LotInternalState,
  timestampIso: string,
  enteredDelta: number,
  leftDelta: number
) {
  const {hour: localHour, dateKey} = getLocalHourAndDate(timestampIso, LOT_TIMEZONE);
  const occupancyPct =
    lot.capacity > 0 ? Math.min(100, Math.max(0, Math.round((lot.occupied / lot.capacity) * 100))) : 0;

  const existing = lot.trends.get(localHour);
  const lastSampleMs = existing?.lastSampledAt ? Date.parse(existing.lastSampledAt) : -1;
  const currentTsMs = Date.parse(timestampIso);
  const sameDay = existing?.todayDate === dateKey;
  const shouldSample =
    !existing ||
    !sameDay ||
    Number.isNaN(lastSampleMs) ||
    currentTsMs - lastSampleMs >= TREND_SAMPLE_INTERVAL_MS;

  const hasFlowDelta = enteredDelta > 0 || leftDelta > 0;
  if (!shouldSample && !hasFlowDelta) return;

  const next: HourTrendAccumulator = {
    localHour,
    sampleCount: (existing?.sampleCount ?? 0) + (shouldSample ? 1 : 0),
    sumOccupancyPct: (existing?.sumOccupancyPct ?? 0) + (shouldSample ? occupancyPct : 0),
    sumOccupied: (existing?.sumOccupied ?? 0) + (shouldSample ? lot.occupied : 0),
    todayDate: dateKey,
    todaySampleCount: (sameDay ? (existing?.todaySampleCount ?? 0) : 0) + (shouldSample ? 1 : 0),
    todaySumPct: (sameDay ? (existing?.todaySumPct ?? 0) : 0) + (shouldSample ? occupancyPct : 0),
    todayLastOccupied: lot.occupied,
    todayEntered: (sameDay ? (existing?.todayEntered ?? 0) : 0) + Math.max(0, enteredDelta),
    todayLeft: (sameDay ? (existing?.todayLeft ?? 0) : 0) + Math.max(0, leftDelta),
    lastSampledAt: shouldSample ? timestampIso : (existing?.lastSampledAt ?? timestampIso),
  };

  lot.trends.set(localHour, next);
}

function toSnapshot(lot: LotInternalState): LotOccupancySnapshot {
  const free = Math.max(0, lot.capacity - lot.occupied);
  const occupancyPercent =
    lot.capacity > 0 ? Math.min(100, Math.round((lot.occupied / lot.capacity) * 100)) : 0;
  const {dateKey} = getLocalHourAndDate(new Date(), LOT_TIMEZONE);

  return {
    lotId: lot.lotId,
    lotName: lot.lotName,
    timezone: LOT_TIMEZONE,
    capacity: lot.capacity,
    occupied: lot.occupied,
    free,
    entered: lot.entered,
    left: lot.left,
    netFlow: lot.entered - lot.left,
    occupancyPercent,
    updatedAt: lot.updatedAt,
    since: lot.since,
    source: lot.source,
    mode: lot.mode,
    hasLiveSync: lot.hasLiveSync,
    events: lot.events.slice(0, MAX_RETURNED_EVENTS),
    hourlyStats: buildHourlyBuckets(lot.trends, dateKey),
  };
}

function broadcastLotUpdate(lot: LotInternalState, eventName: 'snapshot' | 'signal' = 'signal') {
  const clients = sseClients.get(lot.lotId);
  if (!clients || clients.size === 0) return;

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(toSnapshot(lot))}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function mergeEvents(existing: CrossingEvent[], incoming: CrossingEvent[], reset: boolean): CrossingEvent[] {
  const map = new Map<string, CrossingEvent>();
  if (!reset) {
    for (const ev of existing) {
      map.set(ev.id, ev);
    }
  }
  for (const ev of incoming) {
    if (!map.has(ev.id)) {
      map.set(ev.id, ev);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => {
      const timeDiff = Date.parse(b.timestamp) - Date.parse(a.timestamp);
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    })
    .slice(0, MAX_STORED_EVENTS);
}

function handleParkLabsSync(req: Request, res: Response, routeLotId?: string) {
  res.setHeader('Cache-Control', 'no-store');
  const publisher = verifyIngestAuthAndRateLimit(req, res);
  if (!publisher) return;

  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({error: 'Request body must be a JSON object.'});
    return;
  }

  if (!isNonNegativeInt(body.capacity, 50_000)) {
    res.status(400).json({error: 'capacity must be a non-negative integer.'});
    return;
  }
  if (!isNonNegativeInt(body.entered, 10_000_000)) {
    res.status(400).json({error: 'entered must be a non-negative integer.'});
    return;
  }
  if (!isNonNegativeInt(body.left, 10_000_000)) {
    res.status(400).json({error: 'left must be a non-negative integer.'});
    return;
  }
  if (!isNonNegativeInt(body.occupied, 10_000_000)) {
    res.status(400).json({error: 'occupied must be a non-negative integer.'});
    return;
  }
  if (!isValidIso8601(body.timestamp)) {
    res.status(400).json({error: 'timestamp must be a valid ISO-8601 string with timezone.'});
    return;
  }

  let sinceTs: string | null | undefined = undefined;
  if (body.since !== undefined) {
    if (body.since === null) {
      sinceTs = null;
    } else if (isValidIso8601(body.since)) {
      sinceTs = body.since;
    } else {
      res.status(400).json({error: 'since must be a valid ISO-8601 string with timezone.'});
      return;
    }
  }

  const sourceRaw = body.source === undefined ? 'pc' : body.source;
  if (sourceRaw !== 'pc' && sourceRaw !== 'pi') {
    res.status(400).json({error: 'source must be either "pc" or "pi".'});
    return;
  }
  const source: 'pc' | 'pi' = sourceRaw;

  if (publisher !== 'shared' && publisher !== source) {
    res.status(403).json({
      error: `Bearer token is not authorized to publish as source "${source}".`,
    });
    return;
  }

  const modeRaw = body.mode === undefined ? 'edge' : body.mode;
  if (modeRaw !== 'edge' && modeRaw !== 'server') {
    res.status(400).json({error: 'mode must be either "edge" or "server".'});
    return;
  }
  const mode: 'edge' | 'server' = modeRaw;

  let lotNameInput: string | undefined;
  if (body.lotName !== undefined) {
    if (typeof body.lotName !== 'string' || body.lotName.trim().length === 0) {
      res.status(400).json({error: 'lotName must be a non-empty string.'});
      return;
    }
    lotNameInput = body.lotName.trim().slice(0, 60);
  }

  const incomingEvents: CrossingEvent[] = [];
  if (body.events !== undefined) {
    if (!Array.isArray(body.events)) {
      res.status(400).json({error: 'events must be an array of at most 25 crossing objects.'});
      return;
    }
    if (body.events.length > MAX_STORED_EVENTS) {
      res.status(400).json({error: 'events array cannot contain more than 25 items.'});
      return;
    }
    const seen = new Set<string>();
    for (const item of body.events) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        res.status(400).json({error: 'Each item in events must be a JSON object.'});
        return;
      }
      const ev = item as Record<string, unknown>;
      if (typeof ev.id !== 'string' || ev.id.trim().length === 0) {
        res.status(400).json({error: 'Each event must include a non-empty string id.'});
        return;
      }
      if (ev.direction !== 'in' && ev.direction !== 'out') {
        res.status(400).json({error: 'Each event direction must be "in" or "out".'});
        return;
      }
      if (!isValidIso8601(ev.timestamp)) {
        res.status(400).json({error: 'Each event timestamp must be a valid ISO-8601 string.'});
        return;
      }
      const cleanId = ev.id.trim().slice(0, 80);
      if (!seen.has(cleanId)) {
        seen.add(cleanId);
        incomingEvents.push({id: cleanId, direction: ev.direction, timestamp: ev.timestamp});
      }
    }
  }

  const lotId = sanitizeLotId(routeLotId ?? (typeof body.lotId === 'string' ? body.lotId : undefined));
  const lot = getOrCreateLot(lotId);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const incomingTsMs = Date.parse(body.timestamp);

  // Source arbitration: accept "pi" only if no "pc" push accepted within last 90s
  if (source === 'pi' && lot.lastPcAcceptedAt) {
    const lastPcMs = Date.parse(lot.lastPcAcceptedAt);
    if (!Number.isNaN(lastPcMs) && nowMs - lastPcMs < PC_ARBITRATION_WINDOW_MS) {
      res.status(200).json({accepted: false, reason: 'pc active'});
      return;
    }
  }

  // Out-of-order / stale timestamp check
  if (lot.hasLiveSync && lot.updatedAt) {
    const storedTsMs = Date.parse(lot.updatedAt);
    if (!Number.isNaN(storedTsMs) && incomingTsMs < storedTsMs) {
      res.status(200).json({accepted: false, reason: 'stale'});
      return;
    }
  }

  const storedTsMs = lot.updatedAt ? Date.parse(lot.updatedAt) : -1;
  const isNewerTs = !lot.hasLiveSync || incomingTsMs > storedTsMs;
  const sinceChanged =
    lot.hasLiveSync && sinceTs !== undefined && lot.since !== null && sinceTs !== lot.since;
  const countersDropped =
    lot.hasLiveSync && isNewerTs && (body.entered < lot.entered || body.left < lot.left);
  const isReset = sinceChanged || countersDropped;

  const enteredDelta =
    lot.hasLiveSync && !isReset && body.entered >= lot.entered ? body.entered - lot.entered : 0;
  const leftDelta =
    lot.hasLiveSync && !isReset && body.left >= lot.left ? body.left - lot.left : 0;

  const prevEventIds = new Set(lot.events.map((e) => e.id));
  const hasNewEvent = incomingEvents.some((e) => !prevEventIds.has(e.id));
  const stateChanged =
    !lot.hasLiveSync ||
    isReset ||
    hasNewEvent ||
    lot.occupied !== body.occupied ||
    lot.entered !== body.entered ||
    lot.left !== body.left ||
    lot.capacity !== body.capacity ||
    lot.source !== source ||
    lot.mode !== mode;

  if (lotNameInput) lot.lotName = lotNameInput;
  lot.capacity = body.capacity;
  lot.occupied = body.occupied;
  lot.entered = body.entered;
  lot.left = body.left;
  lot.mode = mode;
  lot.source = source;
  if (sinceTs !== undefined) lot.since = sinceTs;
  lot.updatedAt = body.timestamp;
  lot.lastSeenAt = nowIso;
  if (source === 'pc') lot.lastPcAcceptedAt = nowIso;
  lot.hasLiveSync = true;

  // Historical trends persist across daily counter resets
  lot.events = mergeEvents(lot.events, incomingEvents, isReset);
  recordTrendSample(lot, body.timestamp, enteredDelta, leftDelta);

  broadcastLotUpdate(lot, stateChanged ? 'signal' : 'snapshot');
  res.status(200).json({accepted: true});
}

function handleStream(req: Request, res: Response, routeLotId?: string) {
  const lotId = sanitizeLotId(routeLotId ?? (req.query.lotId as string | undefined));
  const lot = getOrCreateLot(lotId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let clients = sseClients.get(lot.lotId);
  if (!clients) {
    clients = new Set<Response>();
    sseClients.set(lot.lotId, clients);
  }
  clients.add(res);

  res.write(`event: snapshot\ndata: ${JSON.stringify(toSnapshot(lot))}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
      clients?.delete(res);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients?.delete(res);
  });
}

function formatPlainTextSummary(lot: LotInternalState): string {
  const snap = toSnapshot(lot);
  if (!snap.hasLiveSync || !snap.updatedAt) {
    return `${snap.lotName} · waiting for first count`;
  }
  const ageSec = Math.max(0, Math.floor((Date.now() - Date.parse(snap.updatedAt)) / 1000));
  const ageText =
    ageSec < 60
      ? `${ageSec} s ago`
      : ageSec < 3600
        ? `${Math.floor(ageSec / 60)} m ago`
        : `${Math.floor(ageSec / 3600)} h ago`;

  const statusSuffix =
    ageSec >= OFFLINE_WARNING_SEC
      ? ' · counter offline'
      : ageSec >= STALE_WARNING_SEC
        ? ' · count may be out of date'
        : '';

  return `${snap.occupied} of ${snap.capacity} spaces taken (${snap.free} free) · updated ${ageText}${statusSuffix}`;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({limit: MAX_BODY_BYTES}));

  // Public Read-Only Endpoints (Phone PWA, Siri Shortcuts, Widgets)
  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ok: true, service: 'EntrySense', runtime: 'node', timezone: LOT_TIMEZONE});
  });

  app.get('/api/occupancy', (req, res) => {
    const lot = getOrCreateLot(req.query.lotId as string | undefined);
    res.setHeader('Cache-Control', EDGE_CACHE_HEADER);
    res.setHeader('X-EntrySense-Realtime', 'sse');
    res.json(toSnapshot(lot));
  });

  app.get('/api/text', (req, res) => {
    const lot = getOrCreateLot(req.query.lotId as string | undefined);
    res.setHeader('Cache-Control', EDGE_CACHE_HEADER);
    res.type('text/plain; charset=utf-8').send(formatPlainTextSummary(lot));
  });

  app.get('/api/stream', (req, res) => handleStream(req, res, DEFAULT_LOT_ID));

  app.get('/api/lots/:lotId/occupancy', (req, res) => {
    const lot = getOrCreateLot(req.params.lotId);
    res.setHeader('Cache-Control', EDGE_CACHE_HEADER);
    res.setHeader('X-EntrySense-Realtime', 'sse');
    res.json(toSnapshot(lot));
  });

  app.get('/api/lots/:lotId/stream', (req, res) => handleStream(req, res, req.params.lotId));

  // Authenticated Machine-to-Machine Ingest Endpoints (Remote PC Coordinator + Pi 4 Failover ONLY)
  app.post('/api/parklabs/sync', (req, res) => handleParkLabsSync(req, res));
  app.post('/api/lots/:lotId/parklabs/sync', (req, res) =>
    handleParkLabsSync(req, res, req.params.lotId)
  );

  // Unknown API route handler
  app.use('/api', (_req, res) => {
    res.status(404).json({error: 'API endpoint not found.'});
  });

  // Global JSON parse & body-too-large error handler
  app.use(
    (
      err: Error & {status?: number; type?: string},
      _req: Request,
      res: Response,
      next: (err?: unknown) => void
    ) => {
      if (err && err.type === 'entity.too.large') {
        res.status(413).json({error: 'Payload exceeds 16 KB limit.'});
        return;
      }
      if (err && err.type === 'entity.parse.failed') {
        res.status(400).json({error: 'Request body contains malformed JSON.'});
        return;
      }
      next(err);
    }
  );

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EntrySense server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start EntrySense server:', err);
  process.exit(1);
});
