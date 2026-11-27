-- LT-11: actions that need owner approval before they run (risk destructive or privileged).
CREATE TABLE approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action         text NOT NULL,
  risk           text NOT NULL CHECK (risk IN ('read', 'reversible', 'destructive', 'privileged')),
  target_type    text,
  target_id      text,
  summary        text,
  params         jsonb NOT NULL DEFAULT '{}'::jsonb,
  requester_type text NOT NULL CHECK (requester_type IN ('owner', 'adapter')),
  requester_id   text NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  requested_at   timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  decided_at     timestamptz,
  decided_by     text
);

CREATE INDEX approvals_status_idx ON approvals (status, requested_at DESC);
