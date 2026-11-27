-- LT-5b: inventory snapshots pushed by adapters. Each (adapter, kind) is replaced as a whole snapshot.
CREATE TABLE inventory_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id    uuid NOT NULL REFERENCES adapters (id) ON DELETE CASCADE,
  kind          text NOT NULL,
  external_id   text NOT NULL,
  title         text NOT NULL,
  status        text NOT NULL,
  privacy_class text NOT NULL CHECK (privacy_class IN ('personal', 'client-data')),
  url           text,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at   timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adapter_id, kind, external_id)
);

CREATE INDEX inventory_items_kind_idx ON inventory_items (kind, privacy_class);
