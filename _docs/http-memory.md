# Isolated HTTP memory mode — issue #44

Set `WATCHNEXT_HTTP_MEMORY=1` only in the server process before starting WatchNext to enable the `/v1` identity/group proof-of-architecture routes. For example, in PowerShell: `$env:WATCHNEXT_HTTP_MEMORY='1'; pnpm dev`.

This mode owns an empty process-memory repository. It uses real password hashing and opaque session/recovery/invitation digests, but it never opens, creates, migrates, imports or falls back to SQLite storage. Restarting the server loses all memory accounts, groups, invitations and sessions. With the setting absent, `/v1` returns a safe unavailable response; normal application routes and `/mock` keep their existing behavior.

The contract surface is deliberately limited to A01–A05, G01–G08 and L01–L04. Library, metadata, personal and picker routes are owned by later issues.
