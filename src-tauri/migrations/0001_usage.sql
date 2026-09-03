CREATE TABLE IF NOT EXISTS providers (
  provider_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO providers (provider_id, display_name, created_at, updated_at) VALUES
  ('openai', 'ChatGPT / Codex', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('anthropic', 'Claude / Claude Code', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('google', 'Gemini', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS usage_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  account_label TEXT,
  remaining_percent REAL CHECK (remaining_percent IS NULL OR (remaining_percent >= 0 AND remaining_percent <= 100)),
  used_percent REAL CHECK (used_percent IS NULL OR (used_percent >= 0 AND used_percent <= 100)),
  reset_at TEXT,
  window_label TEXT,
  observed_at TEXT NOT NULL,
  source_type TEXT NOT NULL,
  confidence TEXT NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id)
);

CREATE INDEX IF NOT EXISTS idx_usage_snapshots_provider_observed
  ON usage_snapshots(provider_id, observed_at);

CREATE TABLE IF NOT EXISTS connection_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  message TEXT,
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id)
);

CREATE INDEX IF NOT EXISTS idx_connection_events_provider_occurred
  ON connection_events(provider_id, occurred_at);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  threshold REAL,
  severity TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  cooldown_until TEXT,
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_provider_delivered
  ON alerts(provider_id, delivered_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
