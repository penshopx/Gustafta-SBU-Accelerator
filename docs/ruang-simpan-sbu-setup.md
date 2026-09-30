# Ruang Simpan read-only profile setup

The API reads each owner's company profile from Ruang Simpan with a dedicated,
read-only `profile:read` token. Configure credentials as server Secrets only;
never put tokens in browser/client configuration, source control, or logs.

Set `RUANG_SIMPAN_CONNECTIONS` in the API server environment to a JSON object
mapping each verified Clerk user ID to the name of that user's token secret:

```json
{
  "user_clerk_id": "RUANG_SIMPAN_TOKEN_OWNER_A"
}
```

Create the named secret (for example `RUANG_SIMPAN_TOKEN_OWNER_A`) in the
server's Secrets store. Each owner must have a distinct secret name. Only names
matching `RUANG_SIMPAN_TOKEN_[A-Z0-9_]+` are accepted. There is no shared token
fallback. Configure and verify the owner-to-company identity link manually
before adding a mapping; do not infer it from matching email addresses.

Development and production Clerk user IDs differ. Configure the correct IDs and
secrets independently in each environment. Rotate tokens every 90 days, and
remove the mapping/revoke the token immediately when access should end.
Request only the `profile:read` scope; this integration is read-only.