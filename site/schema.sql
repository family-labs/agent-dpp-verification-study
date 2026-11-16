-- Study 6 live sites: the Worker's D1 database (site/worker.ts). Apply once:
--   wrangler d1 execute oskvale-study6 --remote --file=site/schema.sql
CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO state (key, value) VALUES ('phase', 'closed');

CREATE TABLE IF NOT EXISTS phase_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  note TEXT
);

-- One row per request to either host (admin calls excepted).
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,              -- ISO time the Worker received it
  host TEXT NOT NULL,            -- oskvale.com or oskvale-store.com (www. stripped)
  raw_host TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query TEXT NOT NULL,           -- "?utm_source=share&utm_id=..." ties a visit to its trial
  ua TEXT NOT NULL,              -- the fetcher's user agent
  status INTEGER NOT NULL,
  phase TEXT NOT NULL,           -- what the sites showed at that moment
  asn INTEGER,
  as_org TEXT,
  country TEXT,
  colo TEXT,
  verified_bot INTEGER,          -- Cloudflare's verified-bot flag, when the plan supplies it
  verified_bot_category TEXT,
  ray TEXT,
  referer TEXT,
  accept TEXT
);
CREATE INDEX IF NOT EXISTS requests_ts ON requests (ts);
