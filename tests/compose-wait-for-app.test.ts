// @vitest-environment node
import { createServer, type Server } from "node:http";
import { afterEach, expect, it } from "vitest";
import { waitForApp } from "../e2e/wait-for-app.mjs";

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
});

async function serve(handler: Parameters<typeof createServer>[0]) {
  server = createServer(handler);
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

it("waits for both database readiness and the frontend using a real HTTP server", async () => {
  let apiCalls = 0, homeCalls = 0;
  const origin = await serve((req, res) => {
    if (req.url === "/health/readyz") {
      apiCalls++;
      res.writeHead(apiCalls < 2 ? 503 : 200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: apiCalls < 2 ? "unavailable" : "ok" }));
    } else {
      homeCalls++;
      res.writeHead(homeCalls < 2 ? 503 : 200);
      res.end("home");
    }
  });
  await waitForApp(origin, { timeoutMs: 2000, intervalMs: 10 });
  expect(apiCalls).toBeGreaterThanOrEqual(3);
  expect(homeCalls).toBe(2);
});

it("fails when the database never becomes ready", async () => {
  const origin = await serve((_req, res) => { res.writeHead(503); res.end(); });
  await expect(waitForApp(origin, { timeoutMs: 80, intervalMs: 10 })).rejects.toThrow("before the deadline");
});
