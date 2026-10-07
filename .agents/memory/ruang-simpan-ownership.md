---
name: Ruang Simpan ownership binding
description: Why multi-company SBU access requires a verified link between each local account and its own Gustafta connection
---

Use a separate, server-managed Gustafta connection for each SBU owner. Establish the cross-application ownership link explicitly; do not infer it from matching email addresses or assume one server credential can serve all accounts.

**Why:** The user chose a multi-company integration. The supplied Gustafta contract determines the source owner from the connection token, but does not supply proof that this owner corresponds to the currently authenticated SBU account. A valid source response alone cannot establish that relationship.

**How to apply:** Provision credentials only after verifying the owner relationship. Keep token entry out of the frontend and resolve the correct connection from authenticated server identity. If future work introduces self-service linking, require a verified authorization flow rather than weakening ownership checks.

## Resolving an owner-supplied email

An owner-supplied email may locate the local SBU account only after explicit confirmation of entitlement to the token's company profile. Require exactly one matching account with a verified email in the selected authentication environment, and map its Clerk user ID, never the email.

**Why:** Looking up a confirmed local account is different from inferring cross-application ownership because two accounts have matching email addresses. Email alone is not proof of entitlement.

**How to apply:** Keep account lookup server-side and read-only. Stop if the result is missing, ambiguous, or unverified. Do not create sessions for the real owner to test the integration, and do not report email addresses or account IDs in verification reports.

## Folder-scoped document access

The user endorsed application-specific folders as the intended document access boundary: an SBU connection should use only the folders its owner authorizes, rather than defaulting to every company document.

**Why:** The owner wants one manageable authorization covering many relevant documents without granting unrelated company data or creating a permission link for every file.

**How to apply:** Treat this as an agreed design direction, not proof of implemented folder support. Verify the upstream contract before building it, and enforce folder authorization on the source server for listing, search, metadata, and content reads. Direct file IDs must not bypass the boundary. Company profile access remains a separate permission, not a folder operation.
