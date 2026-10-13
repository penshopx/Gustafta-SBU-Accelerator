BEGIN;
CREATE TABLE IF NOT EXISTS sbu_consultations (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES sbu_profiles(user_id),
  title text NOT NULL,
  mode text NOT NULL,
  specialist text NOT NULL,
  case_id integer REFERENCES sbu_cases(id) ON DELETE SET NULL,
  context text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 0,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sbu_consultations_owner_updated_idx ON sbu_consultations(owner_id, updated_at);
COMMIT;
