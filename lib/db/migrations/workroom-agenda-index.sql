-- Build without blocking Workroom writes when a published database has many actions.
CREATE INDEX CONCURRENTLY IF NOT EXISTS sbu_workroom_owner_kind_due_case_idx
  ON sbu_workroom_items (owner_id, kind, due_on, case_id);
