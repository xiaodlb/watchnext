import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SamplingDecision, type Sampler } from "@opentelemetry/sdk-trace-base";

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
  if (sdk || !process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return;
  sdk = new NodeSDK({
    resource: telemetryResource(),
    autoDetectResources: false,
    sampler: safeSampler,
    traceExporter: new OTLPTraceExporter(),
  });
  sdk.start();
}
