# WatchNext Grafana dashboard

Import `watchnext-dashboard.json` in Grafana (**Dashboards → New → Import**) and select a Prometheus data source. The Environment and Deployed version dropdowns filter all four panels. Active participants means active group memberships and legacy profiles, not people currently online. Title metrics cover `/v1` routes, as described in `_docs/opentelemetry.md`.

The included `otel-collector.yaml` receives OTLP/HTTP metrics at port 4318 and exposes Prometheus metrics at port 9464. Configure the backend's `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` to the collector's reachable `http://<collector>:4318/v1/metrics`; set `WATCHNEXT_ENVIRONMENT` and `WATCHNEXT_DEPLOYED_VERSION` appropriately. The collector config converts resource attributes to Prometheus labels `deployment_environment_name` and `service_version`. Configure Prometheus to scrape `<collector>:9464`, and add that Prometheus server as the Grafana data source. Keep collector and Prometheus endpoints on a private network. No observability service is deployed by these files.

The dashboard expects standard Prometheus name translation: `watchnext.groups.created` becomes `watchnext_groups_created_total`; other counters similarly receive `_total`, while the active gauge becomes `watchnext_group_participants_active`. The dropdown values depend on that gauge being emitted, which requires the Prisma repository and a working database. The exporter conversion is documented in the [OpenTelemetry Collector Prometheus exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/prometheusexporter).

For a scrape configuration, add the following target to your existing Prometheus config, replacing the host with the collector's reachable name:

```yaml
scrape_configs:
  - job_name: watchnext-otel
    static_configs:
      - targets: ['<collector>:9464']
```

OpenTelemetry export is disabled until its endpoint is configured. New series can take an export interval and a Prometheus scrape interval to appear. A blank panel means no matching samples, and is not proof that the value is zero.
