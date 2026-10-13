CREATE TABLE IF NOT EXISTS sbu_workroom_items (
  id uuid PRIMARY KEY,
  case_id integer NOT NULL REFERENCES sbu_cases(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES sbu_profiles(user_id),
  kind text NOT NULL CHECK (kind IN ('checklist','action','journal')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  assignee text NOT NULL DEFAULT '',
  due_on date,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sbu_workroom_case_owner_idx ON sbu_workroom_items(case_id, owner_id);
