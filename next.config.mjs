/** Bearer credentials occur in invite paths and action state; routine logs must omit them. */
export default function config(phase) {
  if (["phase-development-server", "phase-production-server"].includes(phase) &&
      process.env.NEXT_TRACE_SPAN_THRESHOLD_MS !== "9007199254740991") {
    throw new Error("Start WatchNext with pnpm dev or pnpm start so credential-safe framework tracing is configured before startup.");
  }
  return {
    // Keep the private API's development artifacts separate from the existing
    // Next frontend, so starting it cannot overwrite a running user's build.
    ...(process.env.WATCHNEXT_PRIVATE_API === "1" ? { distDir: ".next-api" } : {}),
    // In the single-container production build, the public Next server owns
    // /v1 and forwards all other routes to the private TanStack SSR server.
    ...(process.env.WATCHNEXT_CONTAINER_MODE === "1" ? {
      async rewrites() {
        return {
          // The old Next invitation route shares this URL with the new UI.
          // Give the TanStack page priority; it resolves invitations via /v1.
          beforeFiles: [{ source: "/invite/:path*", destination: "http://127.0.0.1:3101/invite/:path*" }],
          fallback: [{ source: "/:path*", destination: "http://127.0.0.1:3101/:path*" }],
        };
      },
    } : {}),
    // Bound page/static build workers on memory-constrained academic machines.
    experimental: { cpus: 2 },
    logging: { incomingRequests: false, serverFunctions: false, browserToTerminal: false },
  };
}
