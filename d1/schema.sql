-- Cloudflare D1 schema for EntrySense / ParkLabs Phone PWA
-- Bind your D1 database in Cloudflare Pages as: PARKLABS_DB

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
);

CREATE TABLE IF NOT EXISTS lot_events (
  lot_id TEXT NOT NULL,
  id TEXT NOT NULL,
  direction TEXT NOT NULL,
  event_ts TEXT NOT NULL,
  PRIMARY KEY (lot_id, id)
);

CREATE INDEX IF NOT EXISTS idx_lot_events_lot_ts
  ON lot_events (lot_id, event_ts DESC, id DESC);

-- Persistent 24-row-per-lot historical & today hourly trend rollup (America/Chicago)
-- Survives daily counter resets; sampled at most once per 10 minutes per hour
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
);
