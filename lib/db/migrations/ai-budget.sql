-- Aggregate operational ceilings only; no identity, prompt, file or provider payload.
CREATE TABLE IF NOT EXISTS ai_budget_lock (
  id integer PRIMARY KEY CHECK (id = 1)
);
INSERT INTO ai_budget_lock(id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ai_budget_counters (
  scope text NOT NULL CHECK (scope IN ('global','assistant','consultation','document_analysis')),
  period text NOT NULL CHECK (period IN ('day','month')),
  period_start timestamptz NOT NULL,
  policy_fingerprint text NOT NULL,
  reserved_micros bigint NOT NULL DEFAULT 0 CHECK (reserved_micros >= 0),
  warned boolean NOT NULL DEFAULT false,
  rejected boolean NOT NULL DEFAULT false,
  PRIMARY KEY (scope,period,period_start)
);
