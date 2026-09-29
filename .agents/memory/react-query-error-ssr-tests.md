---
name: React Query error SSR tests
description: Why a cached query error can render as loading in server-side component tests
---

React Query may optimistically initiate a new fetch when a component mounts during server rendering, even if its query cache was set to an error state. A server-rendered assertion against the hook can therefore see loading instead of the intended cached error.

**Why:** A test that seeded an errored query and rendered the dashboard hook still produced loading markup; the hook's optimistic result reflected a new fetch rather than the seeded error.

**How to apply:** For server-rendered tests of error presentation, pass an explicit error-state result into the same presentation component used by the page. Test actual retry interaction separately in a DOM-capable environment if needed.