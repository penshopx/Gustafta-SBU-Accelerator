---
name: Calendar dates across API boundaries
description: Generated response parsing can change date-only wire representations before a frontend sees them.
---

Calendar-date UI tests must use the actual server response parser followed by a JSON serialization round trip, not only raw domain output. Handle the resulting calendar representation in UTC without interpreting it as a local instant.

**Why:** A verified transition worked with raw rule output but disappeared over HTTP because generated date coercion turned a date-only string into a Date, which Express serialized as a UTC-midnight ISO timestamp.

**How to apply:** Whenever date-only API fields reach a renderer, check both the generated parser and serialized response. Cover real wire values and multiple time zones; avoid accepting arbitrary timestamps as calendar dates.