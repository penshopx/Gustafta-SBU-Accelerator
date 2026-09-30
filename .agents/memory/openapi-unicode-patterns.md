---
name: OpenAPI Unicode patterns
description: Constraint on Unicode-aware pattern validation in generated API schemas
---

Orval's generated Zod schema constructs JavaScript `RegExp` from an OpenAPI `pattern` without a `u` flag. Unicode property escapes such as `\p{Cf}` therefore cannot be used directly in the OpenAPI pattern for runtime validation.

**Why:** A property escape without `u` does not match Unicode categories as intended. This matters for input that may contain invisible Unicode format characters.

**How to apply:** When adding Unicode-sensitive constraints to generated schemas, inspect the emitted regex and verify it against representative inputs. For invisible-only input, use a Unicode-aware runtime check in addition to a compatible contract pattern: `Default_Ignorable_Code_Point` covers variation selectors but not every `Cf` format character, so check both categories.