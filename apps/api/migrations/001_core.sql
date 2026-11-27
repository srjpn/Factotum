CREATE TABLE nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  credential_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz,
  last_metrics jsonb,
  revoked_at timestamptz
);

CREATE TABLE enrolment_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  node_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE activity_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL CHECK (actor_type IN ('owner', 'node', 'adapter', 'system')),
  actor_id text NOT NULL,
  action text NOT NULL,
  risk text NOT NULL CHECK (risk IN ('read', 'reversible', 'destructive', 'privileged')),
  target_type text,
  target_id text,
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX activity_log_occurred_at_idx ON activity_log (occurred_at DESC);

-- The activity log is append-only: rows can never be changed or removed.
CREATE FUNCTION activity_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_log_no_update_delete
  BEFORE UPDATE OR DELETE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION activity_log_append_only();

CREATE TRIGGER activity_log_no_truncate
  BEFORE TRUNCATE ON activity_log
  FOR EACH STATEMENT EXECUTE FUNCTION activity_log_append_only();
