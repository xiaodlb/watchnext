import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SamplingDecision, type Sampler } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { metrics } from "@opentelemetry/api";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";

// Only our explicit, privacy-reviewed spans are sampled. Next framework spans
// can include invitation URLs and must not be sent to an external collector.
const safeSampler: Sampler = {
  shouldSample(_context, _traceId, spanName) {
    return { decision: spanName.startsWith("watchnext.") ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD };
  },
  toString: () => "WatchNextSafeSampler",
};

export function telemetryResource(env: NodeJS.ProcessEnv = process.env) {
  return resourceFromAttributes({
    "service.name": env.OTEL_SERVICE_NAME || "watchnext-backend",
    "deployment.environment.name": env.WATCHNEXT_ENVIRONMENT || "development",
    "service.version": env.WATCHNEXT_DEPLOYED_VERSION || "local",
  });
}

let sdk: NodeSDK | undefined;
export function startTelemetry() {
  // Explicit endpoint required: avoid unexpectedly exporting private traffic.
  if (sdk || (!process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT && !process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT && !process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT)) return;
  const metricReader = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
    ? new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }) : undefined;
  sdk = new NodeSDK({
    resource: telemetryResource(),
    autoDetectResources: false,
    sampler: safeSampler,
    ...(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ? { traceExporter: new OTLPTraceExporter() } : {}),
    ...(metricReader ? { metricReader } : {}),
    ...(process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ? { logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())] } : {}),
  });
  sdk.start();
  if (metricReader && process.env.WATCHNEXT_HTTP_REPOSITORY === "prisma") {
    const gauge = metrics.getMeter("watchnext-backend").createObservableGauge("watchnext.group.participants.active", {
      description: "Active account memberships and legacy profiles; not online users",
    });
    gauge.addCallback(async result => {
      try {
        const { prismaIdentityClient } = await import("../http-prisma/identity-store");
        const db = prismaIdentityClient();
        const [memberships, legacyProfiles] = await Promise.all([
          db.accountMembership.count({ where: { status: "active" } }),
          db.member.count({ where: { group: { accessMode: "legacy" } } }),
        ]);
        result.observe(memberships + legacyProfiles);
      } catch { /* A failed collection must not report a false zero or affect requests. */ }
    });
  }
}
