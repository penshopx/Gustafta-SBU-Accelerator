---
name: Calendar dates across API boundaries
description: Generated response parsing can change date-only wire representations before a frontend sees them.
---

Calendar-date UI tests must use the actual server response parser followed by a JSON serialization round trip, not only raw domain output. Handle the resulting calendar representation in UTC without interpreting it as a local instant.

**Why:** A verified transition worked with raw rule output but disappeared over HTTP because generated date coercion turned a date-only string into a Date, which Express serialized as a UTC-midnight ISO timestamp.

**How to apply:** Whenever date-only API fields reach a renderer, check both the generated parser and serialized response. Cover real wire values and multiple time zones; avoid accepting arbitrary timestamps as calendar dates.

## Testing the viewer's time zone

Run local-timestamp component assertions in fresh processes with `TZ` set before imports when a formatter is initialized at module scope.

**Why:** `Intl.DateTimeFormat` captures the default time zone when constructed. Changing `TZ` after importing the renderer can falsely appear to exercise multiple viewer zones while all assertions use the first zone.

**How to apply:** Use explicit expected dates around midnight and a year boundary, and verify the process's resolved time zone. Keep calendar-date assertions as a separate invariant.

Compare the default resolved zone with an explicitly configured formatter's resolved zone rather than the input IANA spelling.

**Why:** The runtime's ICU can resolve `Asia/Kathmandu` as `Asia/Katmandu`; literal equality would reject a correctly configured process.

**How to apply:** Canonicalize both sides through `Intl.DateTimeFormat` when checking the active zone, but keep timestamp expectations explicit and independent of the formatter under test.