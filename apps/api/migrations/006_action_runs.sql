-- LT-13: queue of write actions for adapters to execute. The core holds intent and outcome only;
-- the adapter does the work against its own tool.
CREATE TABLE action_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter       text NOT NULL,
  action        text NOT NULL,
  risk          text NOT NULL CHECK (risk IN ('read', 'reversible', 'destructive', 'privileged')),
  params        jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_type   text,
  target_id     text,
  summary       text,
  queued_at     timestamptz,
  status        text NOT NULL CHECK (status IN ('awaiting_approval', 'queued', 'running', 'succeeded', 'failed', 'cancelled')),
  approval_id   uuid,
  requested_by  text NOT NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  detail        text
);

CREATE INDEX action_runs_queue_idx ON action_runs (adapter, status, requested_at);
