CREATE TABLE IF NOT EXISTS sbu_document_analysis_operations (
  owner_id text PRIMARY KEY,
  analysis_since timestamptz NOT NULL DEFAULT now(),
  analysis_count integer NOT NULL DEFAULT 0,
  inspection_since timestamptz NOT NULL DEFAULT now(),
  inspection_count integer NOT NULL DEFAULT 0,
  token uuid,
  expires_at timestamptz
);
