CREATE TABLE IF NOT EXISTS sbu_smap_checklist_revisions (
  id uuid PRIMARY KEY,
  case_id integer NOT NULL REFERENCES sbu_cases(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES sbu_profiles(user_id),
  template_version text NOT NULL,
  question_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sbu_smap_revision_unique
  ON sbu_smap_checklist_revisions(case_id, template_version, question_id, revision);
