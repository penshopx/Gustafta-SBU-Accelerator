CREATE TABLE IF NOT EXISTS sbu_chat_quota (
  user_id text PRIMARY KEY,
  day_start timestamptz NOT NULL,
  day_count integer NOT NULL DEFAULT 0 CONSTRAINT chat_day_count_nonnegative CHECK (day_count >= 0),
  minute_start timestamptz NOT NULL,
  minute_count integer NOT NULL DEFAULT 0 CONSTRAINT chat_minute_count_nonnegative CHECK (minute_count >= 0),
  lease_id uuid,
  lease_until timestamptz,
  CONSTRAINT chat_lease_pair CHECK ((lease_id IS NULL) = (lease_until IS NULL))
);
