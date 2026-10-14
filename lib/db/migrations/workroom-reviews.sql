CREATE TABLE IF NOT EXISTS sbu_workroom_reviews (
  id uuid PRIMARY KEY,
  case_id integer NOT NULL REFERENCES sbu_cases(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES sbu_profiles(user_id),
  sequence_no integer NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'needs_changes')),
  note text NOT NULL,
  selection jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS sbu_workroom_reviews_case_owner_idx ON sbu_workroom_reviews(case_id, owner_id);
