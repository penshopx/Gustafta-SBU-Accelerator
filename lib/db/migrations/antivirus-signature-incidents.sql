-- Fixed-size operational status only; no document/user identifiers or payloads.
CREATE TABLE IF NOT EXISTS antivirus_signature_incidents (
  incident_key text PRIMARY KEY CHECK (incident_key = 'antivirus-signatures'),
  failures bigint NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 9007199254740991),
  incident boolean NOT NULL DEFAULT false,
  last_alert_ms bigint,
  last_recovery_ms bigint,
  last_severity text NOT NULL DEFAULT 'info' CHECK (last_severity IN ('info', 'warning', 'critical'))
);
