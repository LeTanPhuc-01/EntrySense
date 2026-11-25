import type {
  CrossingDirection,
  CrossingEvent,
  HourlyBucket,
  InferenceMode,
  LotOccupancySnapshot,
  SyncSource,
} from '../../src/types/entrysense';

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{results: T[]}>;
  run(): Promise<{success: boolean}>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface PagesEnv {
  PARKLABS_DB?: D1Database;
  ENTRYSENSE_INGEST_KEY?: string;
  ENTRYSENSE_LOT_NAME?: string;
  ENTRYSENSE_LOT_CAPACITY?: string;
  ENTRYSENSE_TIMEZONE?: string;
}

export interface PagesContext {
  request: Request;
  env: PagesEnv;
  params: Record<string, string>;
  waitUntil?: (promise: Promise<unknown>) => void;
}

interface LotStateRow {
  lot_id: string;
  lot_name: string;
  capacity: number;
  occupied: number;
  entered: number;
  left_count: number;
  mode: string;
  source: string;
  since_ts: string | null;
  updated_at: string;
  last_seen_at: string;
  last_pc_accepted_at: string | null;
  hourly_stats_json: string;
}

interface LotEventRow {
  id: string;
  direction: string;
  event_ts: string;
}

interface LotTrendRow {
  lot_id: string;
  local_hour: number;
  sample_count: number;
  sum_occupancy_pct: number;
  sum_occupied: number;
  today_date: string | null;
  today_sample_count: number;
  today_sum_pct: number;
  today_last_occupied: number;
  today_entered: number;
  today_left: number;
  last_sampled_at: string | null;
}

const DEFAULT_LOT_ID = 'main';
const DEFAULT_TIMEZONE = 'America/Chicago';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_STORED_EVENTS = 25;
const MAX_RETURNED_EVENTS = 10;
const PC_ARBITRATION_WINDOW_MS = 90_000;
const TREND_SAMPLE_INTERVAL_MS = 10 * 60_000; // Sample historical trends at most once per 10 min
const STALE_WARNING_SEC = 150;
const OFFLINE_WARNING_SEC = 900;

// Per-key token bucket rate limiter (~1 req/sec sustained, burst of 5)
const RATE_BURST = 5;
const RATE_REFILL_PER_MS = 1 / 1000;
const rateBuckets = new Map<string, {tokens: number; lastRefillMs: number}>();

// Strict ISO-8601 timestamp with timezone offset or Z
const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

let schemaInitialized = false;

export const EDGE_CACHE_HEADER = 'public, s-maxage=5';

export async function withEdgeCache(
  context: PagesContext,
  produce: () => Promise<Response>
): Promise<Response> {
  const cfCache =
    typeof caches !== 'undefined'
      ? (caches as unknown as {default?: Cache}).default
      : undefined;

  if (!cfCache) {
    return produce();
  }

  const cacheKey = new Request(context.request.url, {method: 'GET'});
  const cached = await cfCache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await produce();
  if (response.ok) {
    const putPromise = cfCache.put(cacheKey, response.clone());
    if (typeof context.waitUntil === 'function') {
      context.waitUntil(putPromise);
    } else {
      await putPromise;
    }
  }
  return response;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

export function sanitizeLotId(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return DEFAULT_LOT_ID;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return cleaned.slice(0, 32) || DEFAULT_LOT_ID;
}

function getDefaultLotName(env: PagesEnv): string {
  return (env.ENTRYSENSE_LOT_NAME || '').trim().slice(0, 60) || 'Main Parking Area';
}

function getDefaultCapacity(env: PagesEnv): number {
  const parsed = Number.parseInt(env.ENTRYSENSE_LOT_CAPACITY || '', 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 50_000 ? parsed : 120;
}

function getLotTimezone(env: PagesEnv): string {
  const candidate = (env.ENTRYSENSE_TIMEZONE || '').trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', {timeZone: candidate});
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function getLocalHourAndDate(isoOrDate: string | Date, timeZone: string): {
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

function buildHourlyBuckets(rows: LotTrendRow[], currentDateKey: string): HourlyBucket[] {
  const byHour = new Map<number, LotTrendRow>();
  for (const row of rows) {
    byHour.set(row.local_hour, row);
  }

  const buckets: HourlyBucket[] = [];
  for (let hour = 6; hour <= 23; hour += 1) {
    const {label, shortLabel} = formatHourLabel(hour);
    const row = byHour.get(hour);
    const sampleCount = row?.sample_count ?? 0;
    const typicalPct =
      sampleCount > 0 ? Math.min(100, Math.round((row!.sum_occupancy_pct ?? 0) / sampleCount)) : 0;
    const typicalOccupied =
      sampleCount > 0 ? Math.round((row!.sum_occupied ?? 0) / sampleCount) : 0;

    const isToday = row?.today_date === currentDateKey && (row?.today_sample_count ?? 0) > 0;
    const todayPct = isToday
      ? Math.min(100, Math.round(row!.today_sum_pct / row!.today_sample_count))
      : null;
    const todayOccupied = isToday ? row!.today_last_occupied : null;

    buckets.push({
      hour,
      label,
      shortLabel,
      typicalPct,
      typicalOccupied,
      sampleCount,
      todayPct,
      todayOccupied,
      ingressCount: row?.today_date === currentDateKey ? (row.today_entered ?? 0) : 0,
      egressCount: row?.today_date === currentDateKey ? (row.today_left ?? 0) : 0,
      isPeak: sampleCount > 0 && typicalPct >= 80,
    });
  }
  return buckets;
}

export function createEmptySnapshot(lotId: string, env: PagesEnv): LotOccupancySnapshot {
  const capacity = getDefaultCapacity(env);
  const timezone = getLotTimezone(env);
  const lotName = lotId === DEFAULT_LOT_ID ? getDefaultLotName(env) : `Lot ${lotId.toUpperCase()}`;
  const {dateKey} = getLocalHourAndDate(new Date(), timezone);
  return {
    lotId,
    lotName,
    timezone,
    capacity,
    occupied: 0,
    free: capacity,
    entered: 0,
    left: 0,
    netFlow: 0,
    occupancyPercent: 0,
    updatedAt: null,
    since: null,
    source: null,
    mode: null,
    hasLiveSync: false,
    events: [],
    hourlyStats: buildHourlyBuckets([], dateKey),
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
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

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaInitialized) return;
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS lot_state (
        lot_id TEXT PRIMARY KEY,
        lot_name TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        occupied INTEGER NOT NULL,
        entered INTEGER NOT NULL,
        left_count INTEGER NOT NULL,
        mode TEXT NOT NULL,
        source TEXT NOT NULL,
        since_ts TEXT,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_pc_accepted_at TEXT,
        hourly_stats_json TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS lot_events (
        lot_id TEXT NOT NULL,
        id TEXT NOT NULL,
        direction TEXT NOT NULL,
        event_ts TEXT NOT NULL,
        PRIMARY KEY (lot_id, id)
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_lot_events_lot_ts
        ON lot_events (lot_id, event_ts DESC, id DESC)
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS lot_hourly_trends (
        lot_id TEXT NOT NULL,
        local_hour INTEGER NOT NULL,
        sample_count INTEGER NOT NULL DEFAULT 0,
        sum_occupancy_pct INTEGER NOT NULL DEFAULT 0,
        sum_occupied INTEGER NOT NULL DEFAULT 0,
        today_date TEXT,
        today_sample_count INTEGER NOT NULL DEFAULT 0,
        today_sum_pct INTEGER NOT NULL DEFAULT 0,
        today_last_occupied INTEGER NOT NULL DEFAULT 0,
        today_entered INTEGER NOT NULL DEFAULT 0,
        today_left INTEGER NOT NULL DEFAULT 0,
        last_sampled_at TEXT,
        PRIMARY KEY (lot_id, local_hour)
      )
    `),
  ]);
  schemaInitialized = true;
}

function buildTrendUpsertStatement(
  db: D1Database,
  lotId: string,
  localHour: number,
  dateKey: string,
  timestampIso: string,
  occupied: number,
  capacity: number,
  enteredDelta: number,
  leftDelta: number,
  existingTrend: LotTrendRow | null
): D1PreparedStatement | null {
  const occupancyPct =
    capacity > 0 ? Math.min(100, Math.max(0, Math.round((occupied / capacity) * 100))) : 0;

  const lastSampleMs = existingTrend?.last_sampled_at
    ? Date.parse(existingTrend.last_sampled_at)
    : -1;
  const currentTsMs = Date.parse(timestampIso);
  const sameDay = existingTrend?.today_date === dateKey;
  const shouldTakeHistoricalSample =
    !existingTrend ||
    !sameDay ||
    Number.isNaN(lastSampleMs) ||
    currentTsMs - lastSampleMs >= TREND_SAMPLE_INTERVAL_MS;

  const hasFlowDelta = enteredDelta > 0 || leftDelta > 0;
  if (!shouldTakeHistoricalSample && !hasFlowDelta) {
    return null;
  }

  const nextSampleCount = (existingTrend?.sample_count ?? 0) + (shouldTakeHistoricalSample ? 1 : 0);
  const nextSumPct =
    (existingTrend?.sum_occupancy_pct ?? 0) + (shouldTakeHistoricalSample ? occupancyPct : 0);
  const nextSumOccupied =
    (existingTrend?.sum_occupied ?? 0) + (shouldTakeHistoricalSample ? occupied : 0);

  const nextTodaySampleCount =
    (sameDay ? (existingTrend?.today_sample_count ?? 0) : 0) + (shouldTakeHistoricalSample ? 1 : 0);
  const nextTodaySumPct =
    (sameDay ? (existingTrend?.today_sum_pct ?? 0) : 0) +
    (shouldTakeHistoricalSample ? occupancyPct : 0);
  const nextTodayEntered =
    (sameDay ? (existingTrend?.today_entered ?? 0) : 0) + Math.max(0, enteredDelta);
  const nextTodayLeft =
    (sameDay ? (existingTrend?.today_left ?? 0) : 0) + Math.max(0, leftDelta);
  const nextLastSampledAt = shouldTakeHistoricalSample
    ? timestampIso
    : (existingTrend?.last_sampled_at ?? timestampIso);

  return db
    .prepare(
      `INSERT INTO lot_hourly_trends (
         lot_id, local_hour, sample_count, sum_occupancy_pct, sum_occupied,
         today_date, today_sample_count, today_sum_pct, today_last_occupied,
         today_entered, today_left, last_sampled_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(lot_id, local_hour) DO UPDATE SET
         sample_count = excluded.sample_count,
         sum_occupancy_pct = excluded.sum_occupancy_pct,
         sum_occupied = excluded.sum_occupied,
         today_date = excluded.today_date,
         today_sample_count = excluded.today_sample_count,
         today_sum_pct = excluded.today_sum_pct,
         today_last_occupied = excluded.today_last_occupied,
         today_entered = excluded.today_entered,
         today_left = excluded.today_left,
         last_sampled_at = excluded.last_sampled_at`
    )
    .bind(
      lotId,
      localHour,
      nextSampleCount,
      nextSumPct,
      nextSumOccupied,
      dateKey,
      nextTodaySampleCount,
      nextTodaySumPct,
      occupied,
      nextTodayEntered,
      nextTodayLeft,
      nextLastSampledAt
    );
}

export async function loadLotSnapshot(lotId: string, env: PagesEnv): Promise<LotOccupancySnapshot> {
  const normalized = sanitizeLotId(lotId);
  const timezone = getLotTimezone(env);
  if (!env.PARKLABS_DB) {
    return createEmptySnapshot(normalized, env);
  }

  await ensureSchema(env.PARKLABS_DB);

  const row = await env.PARKLABS_DB.prepare(
    `SELECT lot_id, lot_name, capacity, occupied, entered, left_count, mode, source,
            since_ts, updated_at, last_seen_at, last_pc_accepted_at, hourly_stats_json
       FROM lot_state
      WHERE lot_id = ?`
  )
    .bind(normalized)
    .first<LotStateRow>();

  if (!row) {
    return createEmptySnapshot(normalized, env);
  }

  const [eventsRes, trendsRes] = await Promise.all([
    env.PARKLABS_DB.prepare(
      `SELECT id, direction, event_ts
         FROM lot_events
        WHERE lot_id = ?
        ORDER BY event_ts DESC, id DESC
        LIMIT ?`
    )
      .bind(normalized, MAX_RETURNED_EVENTS)
      .all<LotEventRow>(),
    env.PARKLABS_DB.prepare(
      `SELECT lot_id, local_hour, sample_count, sum_occupancy_pct, sum_occupied,
              today_date, today_sample_count, today_sum_pct, today_last_occupied,
              today_entered, today_left, last_sampled_at
         FROM lot_hourly_trends
        WHERE lot_id = ?`
    )
      .bind(normalized)
      .all<LotTrendRow>(),
  ]);

  const events: CrossingEvent[] = (eventsRes.results || [])
    .filter((e) => e.direction === 'in' || e.direction === 'out')
    .map((e) => ({
      id: e.id,
      direction: e.direction as CrossingDirection,
      timestamp: e.event_ts,
    }));

  const {dateKey} = getLocalHourAndDate(new Date(), timezone);
  const hourlyStats = buildHourlyBuckets(trendsRes.results || [], dateKey);

  const free = Math.max(0, row.capacity - row.occupied);
  const occupancyPercent =
    row.capacity > 0 ? Math.min(100, Math.round((row.occupied / row.capacity) * 100)) : 0;

  return {
    lotId: row.lot_id,
    lotName: row.lot_name,
    timezone,
    capacity: row.capacity,
    occupied: row.occupied,
    free,
    entered: row.entered,
    left: row.left_count,
    netFlow: row.entered - row.left_count,
    occupancyPercent,
    updatedAt: row.updated_at,
    since: row.since_ts ?? null,
    source: row.source === 'pc' || row.source === 'pi' ? (row.source as SyncSource) : null,
    mode: row.mode === 'edge' || row.mode === 'server' ? (row.mode as InferenceMode) : null,
    hasLiveSync: true,
    events,
    hourlyStats,
  };
}

export async function processParkLabsSync(
  request: Request,
  env: PagesEnv,
  routeLotId?: string
): Promise<Response> {
  // 1. Auth (constant-time Bearer comparison; fail closed if secret unset)
  const configuredKey = (env.ENTRYSENSE_INGEST_KEY || '').trim();
  if (!configuredKey) {
    return jsonResponse(
      {error: 'Ingest key is not configured on the server.'},
      503,
      {'Cache-Control': 'no-store'}
    );
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const apiKeyHeader = (request.headers.get('x-api-key') || '').trim();
  const provided = bearerToken || apiKeyHeader;

  if (!provided || !constantTimeEquals(configuredKey, provided)) {
    return jsonResponse(
      {error: 'Missing or invalid bearer token.'},
      401,
      {'Cache-Control': 'no-store'}
    );
  }

  // 2. Per-key rate limit (~1 req/sec with burst of 5)
  if (!checkRateLimit(configuredKey)) {
    return jsonResponse(
      {error: 'Rate limit exceeded. Slow down sync requests.'},
      429,
      {'Cache-Control': 'no-store', 'Retry-After': '1'}
    );
  }

  // 3. D1 availability check
  if (!env.PARKLABS_DB) {
    return jsonResponse(
      {error: 'D1 database binding PARKLABS_DB is not configured.'},
      503,
      {'Cache-Control': 'no-store'}
    );
  }

  // 4. Body size limit (16 KB)
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredLen = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
      return jsonResponse(
        {error: 'Payload exceeds 16 KB limit.'},
        413,
        {'Cache-Control': 'no-store'}
      );
    }
  }

  const rawText = await request.text();
  if (new TextEncoder().encode(rawText).length > MAX_BODY_BYTES) {
    return jsonResponse(
      {error: 'Payload exceeds 16 KB limit.'},
      413,
      {'Cache-Control': 'no-store'}
    );
  }

  // 5. Parse & validate JSON (unknown fields ignored)
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonResponse(
        {error: 'Request body must be a JSON object.'},
        400,
        {'Cache-Control': 'no-store'}
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse(
      {error: 'Request body contains malformed JSON.'},
      400,
      {'Cache-Control': 'no-store'}
    );
  }

  if (!isNonNegativeInt(body.capacity, 50_000)) {
    return jsonResponse(
      {error: 'capacity must be a non-negative integer.'},
      400,
      {'Cache-Control': 'no-store'}
    );
  }
  if (!isNonNegativeInt(body.entered, 10_000_000)) {
    return jsonResponse(
      {error: 'entered must be a non-negative integer.'},
      400,
      {'Cache-Control': 'no-store'}
    );
  }
  if (!isNonNegativeInt(body.left, 10_000_000)) {
    return jsonResponse(
      {error: 'left must be a non-negative integer.'},
      400,
      {'Cache-Control': 'no-store'}
    );
  }
  if (!isNonNegativeInt(body.occupied, 10_000_000)) {
    return jsonResponse(
      {error: 'occupied must be a non-negative integer.'},
      400,
      {'Cache-Control': 'no-store'}
    );
  }
  if (!isValidIso8601(body.timestamp)) {
    return jsonResponse(
      {error: 'timestamp must be a valid ISO-8601 string with timezone.'},
      400,
      {'Cache-Control': 'no-store'}
    );
  }

  let sinceTs: string | null | undefined = undefined;
  if (body.since !== undefined) {
    if (body.since === null) {
      sinceTs = null;
    } else if (isValidIso8601(body.since)) {
      sinceTs = body.since;
    } else {
      return jsonResponse(
        {error: 'since must be a valid ISO-8601 string with timezone.'},
        400,
        {'Cache-Control': 'no-store'}
      );
    }
  }

  const sourceRaw = body.source === undefined ? 'pc' : body.source;
  if (sourceRaw !== 'pc' && sourceRaw !== 'pi') {
    return jsonResponse(
      {error: 'source must be either "pc" or "pi".'},
      400,
      {'Cache-Control': 'no-store'}
    );
  }
  const source: 'pc' | 'pi' = sourceRaw;

  const modeRaw = body.mode === undefined ? 'edge' : body.mode;
  if (modeRaw !== 'edge' && modeRaw !== 'server') {
    return jsonResponse(
      {error: 'mode must be either "edge" or "server".'},
      400,
      {'Cache-Control': 'no-store'}
    );
  }
  const mode: 'edge' | 'server' = modeRaw;

  let lotNameInput: string | undefined;
  if (body.lotName !== undefined) {
    if (typeof body.lotName !== 'string' || body.lotName.trim().length === 0) {
      return jsonResponse(
        {error: 'lotName must be a non-empty string.'},
        400,
        {'Cache-Control': 'no-store'}
      );
    }
    lotNameInput = body.lotName.trim().slice(0, 60);
  }

  const incomingEvents: CrossingEvent[] = [];
  if (body.events !== undefined) {
    if (!Array.isArray(body.events)) {
      return jsonResponse(
        {error: 'events must be an array of at most 25 crossing objects.'},
        400,
        {'Cache-Control': 'no-store'}
      );
    }
    if (body.events.length > MAX_STORED_EVENTS) {
      return jsonResponse(
        {error: 'events array cannot contain more than 25 items.'},
        400,
        {'Cache-Control': 'no-store'}
      );
    }
    const seenIds = new Set<string>();
    for (const item of body.events) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return jsonResponse(
          {error: 'Each item in events must be a JSON object.'},
          400,
          {'Cache-Control': 'no-store'}
        );
      }
      const ev = item as Record<string, unknown>;
      if (typeof ev.id !== 'string' || ev.id.trim().length === 0) {
        return jsonResponse(
          {error: 'Each event must include a non-empty string id.'},
          400,
          {'Cache-Control': 'no-store'}
        );
      }
      if (ev.direction !== 'in' && ev.direction !== 'out') {
        return jsonResponse(
          {error: 'Each event direction must be "in" or "out".'},
          400,
          {'Cache-Control': 'no-store'}
        );
      }
      if (!isValidIso8601(ev.timestamp)) {
        return jsonResponse(
          {error: 'Each event timestamp must be a valid ISO-8601 string.'},
          400,
          {'Cache-Control': 'no-store'}
        );
      }
      const cleanId = ev.id.trim().slice(0, 80);
      if (!seenIds.has(cleanId)) {
        seenIds.add(cleanId);
        incomingEvents.push({
          id: cleanId,
          direction: ev.direction,
          timestamp: ev.timestamp,
        });
      }
    }
  }

  const lotId = sanitizeLotId(routeLotId ?? (typeof body.lotId === 'string' ? body.lotId : undefined));
  const timezone = getLotTimezone(env);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const incomingTsMs = Date.parse(body.timestamp);
  const {hour: localHour, dateKey} = getLocalHourAndDate(body.timestamp, timezone);

  await ensureSchema(env.PARKLABS_DB);

  const [existing, existingTrend] = await Promise.all([
    env.PARKLABS_DB.prepare(
      `SELECT lot_id, lot_name, capacity, occupied, entered, left_count, mode, source,
              since_ts, updated_at, last_seen_at, last_pc_accepted_at, hourly_stats_json
         FROM lot_state
        WHERE lot_id = ?`
    )
      .bind(lotId)
      .first<LotStateRow>(),
    env.PARKLABS_DB.prepare(
      `SELECT lot_id, local_hour, sample_count, sum_occupancy_pct, sum_occupied,
              today_date, today_sample_count, today_sum_pct, today_last_occupied,
              today_entered, today_left, last_sampled_at
         FROM lot_hourly_trends
        WHERE lot_id = ? AND local_hour = ?`
    )
      .bind(lotId, localHour)
      .first<LotTrendRow>(),
  ]);

  // 6. Source arbitration: accept "pi" only if no "pc" push accepted within last 90s
  if (source === 'pi' && existing?.last_pc_accepted_at) {
    const lastPcMs = Date.parse(existing.last_pc_accepted_at);
    if (!Number.isNaN(lastPcMs) && nowMs - lastPcMs < PC_ARBITRATION_WINDOW_MS) {
      return jsonResponse(
        {accepted: false, reason: 'pc active'},
        200,
        {'Cache-Control': 'no-store'}
      );
    }
  }

  // 7. Out-of-order / stale timestamp check
  if (existing) {
    const storedTsMs = Date.parse(existing.updated_at);
    if (!Number.isNaN(storedTsMs) && incomingTsMs < storedTsMs) {
      return jsonResponse(
        {accepted: false, reason: 'stale'},
        200,
        {'Cache-Control': 'no-store'}
      );
    }
  }

  const nextLotName =
    lotNameInput ??
    existing?.lot_name ??
    (lotId === DEFAULT_LOT_ID ? getDefaultLotName(env) : `Lot ${lotId.toUpperCase()}`);
  const nextSince = sinceTs !== undefined ? sinceTs : (existing?.since_ts ?? null);
  const nextLastPcAcceptedAt = source === 'pc' ? nowIso : (existing?.last_pc_accepted_at ?? null);

  // 8. Reset detection (changed `since`, or entered/left dropped with newer timestamp)
  const storedTsMs = existing ? Date.parse(existing.updated_at) : -1;
  const isNewerTs = !existing || incomingTsMs > storedTsMs;
  const sinceChanged =
    existing !== null &&
    sinceTs !== undefined &&
    existing.since_ts !== null &&
    sinceTs !== existing.since_ts;
  const countersDropped =
    existing !== null &&
    isNewerTs &&
    (body.entered < existing.entered || body.left < existing.left_count);
  const isReset = sinceChanged || countersDropped;

  const enteredDelta =
    existing && !isReset && body.entered >= existing.entered ? body.entered - existing.entered : 0;
  const leftDelta =
    existing && !isReset && body.left >= existing.left_count ? body.left - existing.left_count : 0;

  // Build optional throttled trend statement (persists across resets!)
  const trendStmt = buildTrendUpsertStatement(
    env.PARKLABS_DB,
    lotId,
    localHour,
    dateKey,
    body.timestamp,
    body.occupied,
    body.capacity,
    enteredDelta,
    leftDelta,
    existingTrend
  );

  // 9. Keepalive fast path: if nothing changed and not a reset, only bump timestamps (and optional 10-min trend sample)
  const countsUnchanged =
    existing !== null &&
    !isReset &&
    existing.lot_name === nextLotName &&
    existing.capacity === body.capacity &&
    existing.occupied === body.occupied &&
    existing.entered === body.entered &&
    existing.left_count === body.left &&
    existing.mode === mode &&
    existing.source === source &&
    existing.since_ts === nextSince;

  if (countsUnchanged && existing) {
    let hasNewEvent = false;
    if (incomingEvents.length > 0) {
      const latestStored = await env.PARKLABS_DB.prepare(
        `SELECT id FROM lot_events WHERE lot_id = ? ORDER BY event_ts DESC, id DESC LIMIT 25`
      )
        .bind(lotId)
        .all<{id: string}>();
      const storedIdSet = new Set((latestStored.results || []).map((r) => r.id));
      hasNewEvent = incomingEvents.some((ev) => !storedIdSet.has(ev.id));
    }

    if (!hasNewEvent) {
      const keepaliveStmts: D1PreparedStatement[] = [
        env.PARKLABS_DB.prepare(
          `UPDATE lot_state
              SET updated_at = ?, last_seen_at = ?, last_pc_accepted_at = ?
            WHERE lot_id = ?`
        ).bind(body.timestamp, nowIso, nextLastPcAcceptedAt, lotId),
      ];
      if (trendStmt) keepaliveStmts.push(trendStmt);
      await env.PARKLABS_DB.batch(keepaliveStmts);

      return jsonResponse({accepted: true}, 200, {'Cache-Control': 'no-store'});
    }
  }

  // 10. Full write path: upsert lot_state + insert deduplicated events + prune to 25 + optional trend sample
  const statements: D1PreparedStatement[] = [];

  if (isReset) {
    statements.push(
      env.PARKLABS_DB.prepare(`DELETE FROM lot_events WHERE lot_id = ?`).bind(lotId)
    );
  }

  statements.push(
    env.PARKLABS_DB.prepare(
      `INSERT INTO lot_state (
         lot_id, lot_name, capacity, occupied, entered, left_count,
         mode, source, since_ts, updated_at, last_seen_at, last_pc_accepted_at, hourly_stats_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')
       ON CONFLICT(lot_id) DO UPDATE SET
         lot_name = excluded.lot_name,
         capacity = excluded.capacity,
         occupied = excluded.occupied,
         entered = excluded.entered,
         left_count = excluded.left_count,
         mode = excluded.mode,
         source = excluded.source,
         since_ts = excluded.since_ts,
         updated_at = excluded.updated_at,
         last_seen_at = excluded.last_seen_at,
         last_pc_accepted_at = excluded.last_pc_accepted_at`
    ).bind(
      lotId,
      nextLotName,
      body.capacity,
      body.occupied,
      body.entered,
      body.left,
      mode,
      source,
      nextSince,
      body.timestamp,
      nowIso,
      nextLastPcAcceptedAt
    )
  );

  for (const ev of incomingEvents) {
    statements.push(
      env.PARKLABS_DB.prepare(
        `INSERT OR IGNORE INTO lot_events (lot_id, id, direction, event_ts)
         VALUES (?, ?, ?, ?)`
      ).bind(lotId, ev.id, ev.direction, ev.timestamp)
    );
  }

  if (incomingEvents.length > 0 && !isReset) {
    statements.push(
      env.PARKLABS_DB.prepare(
        `DELETE FROM lot_events
          WHERE lot_id = ?
            AND id NOT IN (
              SELECT id FROM lot_events
               WHERE lot_id = ?
               ORDER BY event_ts DESC, id DESC
               LIMIT ?
            )`
      ).bind(lotId, lotId, MAX_STORED_EVENTS)
    );
  }

  if (trendStmt) {
    statements.push(trendStmt);
  }

  await env.PARKLABS_DB.batch(statements);

  return jsonResponse({accepted: true}, 200, {'Cache-Control': 'no-store'});
}

export function formatPlainText(snap: LotOccupancySnapshot): string {
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
