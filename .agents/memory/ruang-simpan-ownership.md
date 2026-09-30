---
name: Ruang Simpan ownership binding
description: Why multi-company SBU access requires a verified link between each local account and its own Gustafta connection
---

Use a separate, server-managed Gustafta connection for each SBU owner. Establish the cross-application ownership link explicitly; do not infer it from matching email addresses or assume one server credential can serve all accounts.

**Why:** The user chose a multi-company integration. The supplied Gustafta contract determines the source owner from the connection token, but does not supply proof that this owner corresponds to the currently authenticated SBU account. A valid source response alone cannot establish that relationship.

**How to apply:** Provision credentials only after verifying the owner relationship. Keep token entry out of the frontend and resolve the correct connection from authenticated server identity. If future work introduces self-service linking, require a verified authorization flow rather than weakening ownership checks.