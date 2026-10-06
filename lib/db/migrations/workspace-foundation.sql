-- Additive, repeatable migration. Never reinterpret company names, roles,
-- qualifications, dates or source profiles while backfilling legacy cases.
BEGIN;
SELECT pg_advisory_xact_lock(74982103);
CREATE TABLE IF NOT EXISTS sbu_workspaces (
  id serial PRIMARY KEY,
  owner_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sbu_workspaces_owner_unique ON sbu_workspaces(owner_id);
CREATE TABLE IF NOT EXISTS sbu_clients (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES sbu_workspaces(id),
  name text NOT NULL,
  business_type text,
  npwp_masked text,
  nib text,
  address text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sbu_clients_default_unique ON sbu_clients(org_id) WHERE is_default = true;
ALTER TABLE sbu_clients ADD COLUMN IF NOT EXISTS npwp_masked text;
ALTER TABLE sbu_clients ADD COLUMN IF NOT EXISTS nib text;
ALTER TABLE sbu_clients ADD COLUMN IF NOT EXISTS address text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'sbu_clients'::regclass AND conname = 'sbu_clients_business_type'
  ) THEN
    ALTER TABLE sbu_clients ADD CONSTRAINT sbu_clients_business_type
      CHECK (business_type IS NULL OR business_type IN ('kontraktor', 'konsultan'));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS sbu_audit_logs (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES sbu_workspaces(id),
  user_id text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sbu_app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
ALTER TABLE sbu_cases ADD COLUMN IF NOT EXISTS client_id integer;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'sbu_cases'::regclass AND conname = 'sbu_cases_client_id_sbu_clients_id_fk'
  ) THEN
    ALTER TABLE sbu_cases ADD CONSTRAINT sbu_cases_client_id_sbu_clients_id_fk
      FOREIGN KEY (client_id) REFERENCES sbu_clients(id);
  END IF;
END $$;
INSERT INTO sbu_workspaces(owner_id)
SELECT user_id FROM sbu_profiles
ON CONFLICT (owner_id) DO NOTHING;
INSERT INTO sbu_clients(org_id, name, is_default)
SELECT id, 'Wadah kasus pribadi', true FROM sbu_workspaces
ON CONFLICT (org_id) WHERE is_default = true DO NOTHING;
UPDATE sbu_cases AS c SET client_id = cl.id
FROM sbu_workspaces AS w
JOIN sbu_clients AS cl ON cl.org_id = w.id AND cl.is_default = true
WHERE c.owner_id = w.owner_id AND c.client_id IS NULL;
INSERT INTO sbu_app_settings(key, value) VALUES (
  'disclaimer',
  to_jsonb('SBU Accelerator adalah alat bantu persiapan mandiri dan tidak berafiliasi dengan Kementerian PU, LPJK, maupun LSBU. Aplikasi ini tidak menerbitkan atau menjamin SBU.'::text)
) ON CONFLICT (key) DO NOTHING;
COMMIT;
