BEGIN;
CREATE TABLE IF NOT EXISTS sbu_personnel (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES sbu_profiles(user_id),
  full_name text NOT NULL,
  assignment text NOT NULL DEFAULT 'lainnya',
  position text NOT NULL DEFAULT '',
  case_id integer REFERENCES sbu_cases(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sbu_personnel_owner_updated_idx ON sbu_personnel(owner_id, updated_at);
CREATE TABLE IF NOT EXISTS sbu_skk_certificates (
  id uuid PRIMARY KEY,
  personnel_id uuid NOT NULL REFERENCES sbu_personnel(id) ON DELETE CASCADE,
  certificate_number text NOT NULL,
  issuer text NOT NULL,
  job_title text NOT NULL,
  level integer CHECK (level BETWEEN 1 AND 9),
  issued_on date,
  expires_on date,
  document_id uuid REFERENCES sbu_documents(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (issued_on IS NULL OR expires_on IS NULL OR issued_on <= expires_on)
);
CREATE INDEX IF NOT EXISTS sbu_skk_personnel_idx ON sbu_skk_certificates(personnel_id);
COMMIT;
