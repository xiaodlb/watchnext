# Backend OpenTelemetry

The Next.js backend emits the privacy-reviewed `watchnext.api.request` trace span for `/v1` requests. Spans contain the response status, but no URL, invitation token, request body, user, database credentials, or error details. Other Next.js and automatic library spans are not sampled because they can contain sensitive paths.

Set `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` to a trusted OTLP/HTTP traces endpoint (for example, `http://collector:4318/v1/traces`) in the VM's `.env` to enable export; no telemetry is sent by default. Configure the endpoint appropriately for the Docker network and secure it in production. This does not install or operate a collector.

Each exported span has `service.name` (`watchnext-backend`), `deployment.environment.name` (`development` or `production`), and `service.version` (the deployed image tag). Local runs default to `development` and `local`; these can be overridden with `WATCHNEXT_ENVIRONMENT` and `WATCHNEXT_DEPLOYED_VERSION`. The OCI deployment helper supplies these values when it pulls an image; reinstall the root-owned helper on each VM after updating its checkout.

OpenTelemetry's API, Node SDK, resources and OTLP/HTTP exporter are runtime dependencies. Export is disabled without an explicit endpoint. Next.js framework tracing remains subject to `scripts/framework-privacy.mjs`; do not remove that protection.

## Application metrics

Set `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` to a trusted OTLP/HTTP metrics endpoint such as `http://collector:4318/v1/metrics`; metrics export is independent of trace export. Metrics carry the same service name, deployment environment and deployed version as the traces.

- `watchnext.groups.created`: successful account or legacy group creation requests since this process started.
- `watchnext.titles.created`: new saved titles, including YouTube videos; duplicate contributions and restorations do not increment it.
- `watchnext.titles.creation.failures`: unsuccessful manual or provider review save requests, including validation and unexpected errors.
- `watchnext.group.participants.active`: current active account group memberships plus legacy profiles from the Prisma database. This is membership status, not a count of online people; one account in multiple groups is counted once per membership. It is collected only in Prisma mode; database failures omit the measurement.

Counters reset on process restart and cover `/v1` requests handled by this backend process. No names, account IDs, group IDs, URLs or content are included as metric labels.
