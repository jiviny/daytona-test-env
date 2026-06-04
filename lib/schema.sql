-- Billing Operations Preview schema.
-- Small, readable, and idempotent so it can run on every preview boot.

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  customer_id            TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  plan                   TEXT NOT NULL,
  requested_plan         TEXT,
  status                 TEXT NOT NULL DEFAULT 'active', -- active | provisioning | provisioned
  priority_provisioning  BOOLEAN NOT NULL DEFAULT false,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  from_plan   TEXT NOT NULL,
  to_plan     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued', -- queued | active | completed | failed
  priority    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id              SERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL,
  customer_id     TEXT,
  payload         JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  source          TEXT NOT NULL DEFAULT 'replay', -- replay | external
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emails (
  id         SERIAL PRIMARY KEY,
  recipient  TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id          SERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,
  message     TEXT NOT NULL,
  customer_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Liveness signal written periodically by the worker so the health endpoint can tell
-- whether the worker process is actually running (not just "was started once").
CREATE TABLE IF NOT EXISTS service_heartbeats (
  service TEXT PRIMARY KEY,
  beat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
