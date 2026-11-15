import { describe, expect, it } from "vitest";
import { telemetryResource } from "../lib/telemetry/server";

describe("backend telemetry", () => {
  it("labels deployed traces with service, environment and version", () => {
    const resource = telemetryResource({ OTEL_SERVICE_NAME: "watchnext-api", WATCHNEXT_ENVIRONMENT: "production", WATCHNEXT_DEPLOYED_VERSION: "20260818-163457-83242da" });
    expect(resource.attributes).toMatchObject({
      "service.name": "watchnext-api",
      "deployment.environment.name": "production",
      "service.version": "20260818-163457-83242da",
    });
  });

  it("uses local defaults when no deployment metadata is set", () => {
    expect(telemetryResource({}).attributes).toMatchObject({
      "service.name": "watchnext-backend",
      "deployment.environment.name": "development",
      "service.version": "local",
    });
  });
});
