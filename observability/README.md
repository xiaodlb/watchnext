# WatchNext Grafana dashboard

## Separate Compose stack on the dev VM

`compose.yaml` runs Collector, Prometheus and Grafana as the independent `watchnext-observability` project. Persistent Grafana and Prometheus data have their own named volumes. Grafana listens only on VM loopback port 13000; it is accessible from a workstation by SSH port forwarding. Prometheus and the collector are not published on host ports. The `watchnext-telemetry` Docker network lets the local dev app reach the collector.

Create a private `observability/.env` on the VM containing a unique Grafana administrator username and password (`GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD`), mode 600. Do not commit it. A password set on first initialization is stored in the Grafana volume; changing the environment variable later does not reset an existing account password.

```sh
cd /opt/watchnext
sudo docker compose --env-file observability/.env -f observability/compose.yaml up -d
sudo docker compose -p watchnext -f docker-compose.yaml -f deploy/oracle/docker-compose.yaml -f observability/app-telemetry.yaml up -d --no-build
```

The second command recreates the app container to attach it to the telemetry network; PostgreSQL and Caddy volumes remain unchanged. It requires the app image to contain OpenTelemetry instrumentation. Existing dev deployments predating that code need an updated app image first. This network overlay is a separate application Compose configuration, and must also be included in every subsequent app deployment; the current OCI deployment helper does not include it automatically. Thus automatic deployments must not be enabled until the helper is updated to preserve this overlay.

On the workstation, establish a tunnel and open `http://127.0.0.1:13000`:

```sh
ssh -i <private-key> -L 13000:127.0.0.1:13000 ubuntu@<dev-public-ip>
```

Grafana automatically provisions the Prometheus data source and the WatchNext dashboard. OTLP, Prometheus, and Grafana are not exposed publicly. Do not use `down -v` unless you intentionally wish to delete observability history and Grafana data.

This setup connects dev on the same Docker host. A production VM is a separate host and cannot join this local Docker bridge. Connecting production requires a private, authenticated encrypted network path (for example a VPN or SSH tunnel) and corresponding collector binding; do not expose unauthenticated OTLP on the public internet. Until production and that network path exist, production cannot send metrics to this stack.

## Traces, logs and alerts

The separate stack also contains Tempo for traces, Loki for logs and Alertmanager for alerts. Grafana provisions all three data sources. The application overlay enables OTLP/HTTP traces, metrics and logs; the `/v1` backend emits deliberately sanitized completion/failure log records and trace spans. They contain a status code and service/environment/version resource attributes, never request paths, invitation tokens, content, credentials, or exception messages. Other framework logs and routes are not captured by this OTLP pipeline.

Prometheus evaluates `alerts.yaml`: one warning fires when title creation failures increase over five minutes, and another fires when the collector cannot be scraped for two minutes. Alertmanager forwards alerts to the AI on-call service, which receives only bounded alert name, status, environment and version. The service calls the OpenAI Responses API and writes its analysis and safe diagnostic suggestions to its container log; it never executes commands or changes the application. It needs outbound access and a configured API key. The key is stored only in the server's private `observability/.env`, never in Git:

```text
OPENAI_API_KEY=<your-key>
OPENAI_MODEL=gpt-4.1-mini
```

Restart only the observability stack after adding these values. View the agent's responses with `sudo docker compose --env-file observability/.env -f observability/compose.yaml logs oncall`. If the key is missing or the API call fails, the agent returns an error and Alertmanager retries; no analysis is claimed. Usage of the external API may be billed by the provider. Alerts and responses are not delivered to email or a chat service by this configuration.

Tempo retains traces for 24 hours; Loki is configured for seven days. This is an academic, single-host setup, not highly available storage. Take appropriate backups before replacing its named volumes.

The Environment and Deployed version dropdowns filter all four panels. Active participants means active group memberships and legacy profiles, not people currently online. Title metrics cover `/v1` routes, as described in `_docs/opentelemetry.md`.

The included `otel-collector.yaml` receives OTLP/HTTP metrics at port 4318 and exposes Prometheus metrics at port 9464. The collector config converts resource attributes to Prometheus labels `deployment_environment_name` and `service_version`. Prometheus scrapes `collector:9464` over the internal network.

The dashboard expects standard Prometheus name translation: `watchnext.groups.created` becomes `watchnext_groups_created_total`; other counters similarly receive `_total`, while the active gauge becomes `watchnext_group_participants_active`. The dropdown values depend on that gauge being emitted, which requires the Prisma repository and a working database. The exporter conversion is documented in the [OpenTelemetry Collector Prometheus exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/prometheusexporter).

For a scrape configuration, add the following target to your existing Prometheus config, replacing the host with the collector's reachable name:

```yaml
scrape_configs:
  - job_name: watchnext-otel
    static_configs:
      - targets: ['<collector>:9464']
```

OpenTelemetry export is disabled until its endpoint is configured. New series can take an export interval and a Prometheus scrape interval to appear. A blank panel means no matching samples, and is not proof that the value is zero.
