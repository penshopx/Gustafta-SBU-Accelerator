BEGIN;
CREATE TABLE IF NOT EXISTS sbu_company_profiles (
  owner_id TEXT PRIMARY KEY REFERENCES sbu_profiles(user_id),
  company_name TEXT NOT NULL DEFAULT '',
  nib TEXT NOT NULL DEFAULT '',
  npwp TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  responsible_person TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sbu_documents (
  id UUID PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES sbu_cases(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES sbu_profiles(user_id),
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 20971520),
  object_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sbu_documents_owner_case_idx ON sbu_documents(owner_id, case_id);
CREATE INDEX IF NOT EXISTS sbu_documents_status_created_idx ON sbu_documents(status, created_at);
COMMIT;
