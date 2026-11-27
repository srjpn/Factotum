-- LT-5: adapter registry. Stores each adapter's manifest and a SHA-256 hash of its
-- service token. The plain token is never stored. Self-contained: no foreign keys to
-- tables from other migrations.
CREATE TABLE adapters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL UNIQUE,
  version        text NOT NULL,
  manifest       jsonb NOT NULL,
  scopes         text[] NOT NULL,
  token_hash     char(64) NOT NULL UNIQUE,
  status         text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'up', 'degraded', 'down')),
  status_detail  text,
  last_seen_at   timestamptz,
  registered_at  timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
