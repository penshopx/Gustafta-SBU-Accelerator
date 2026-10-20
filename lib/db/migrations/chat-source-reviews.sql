-- Source approval is separate from transition verification and legal validity.
CREATE TABLE IF NOT EXISTS sbu_chat_source_decisions (
  source_key text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  version_id text NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision = revision - 1),
  status text NOT NULL CHECK (status IN ('approved', 'withdrawn', 'not_approved')),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  review_reference text NOT NULL CHECK (length(trim(review_reference)) > 0),
  reviewed_by text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  citations jsonb NOT NULL CHECK (jsonb_typeof(citations) = 'array'),
  PRIMARY KEY (source_key, revision)
);

CREATE OR REPLACE FUNCTION sbu_chat_source_decisions_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Source decisions are append-only';
END;
$$;
DROP TRIGGER IF EXISTS sbu_chat_source_decisions_immutable ON sbu_chat_source_decisions;
CREATE TRIGGER sbu_chat_source_decisions_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON sbu_chat_source_decisions
FOR EACH STATEMENT EXECUTE FUNCTION sbu_chat_source_decisions_immutable();
