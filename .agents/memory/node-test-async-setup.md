---
name: Node test asynchronous setup
description: Root teardown can run prematurely if a test is registered before awaited module setup
---

Register tests only after asynchronous module setup has completed when root teardown owns shared instrumentation.

**Why:** Node's test runner executed an early registered test while a top-level bundle build was still awaiting completion, then ran root teardown before later tests were registered. A warning interceptor was restored before real middleware requests, making a seemingly passing guard ineffective.

**How to apply:** Keep guard installation before application imports, but delay test registration until awaited setup completes. Verify instrumentation with a deliberate real warning; an isolated mock test alone does not prove the guard remains active during integration requests.
