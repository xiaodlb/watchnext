/** Wait until both the database-backed API and the frontend can serve traffic. */
export async function waitForApp(origin, { timeoutMs = 120000, intervalMs = 300, checkInterrupted = () => {} } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    checkInterrupted();
    try {
      const response = await fetch(`${origin}/health/readyz`, { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await response.json()).status === "ok") {
        const home = await fetch(origin, { signal: AbortSignal.timeout(2000) });
        if (home.ok) return;
      }
    } catch { /* Retry while the isolated application starts. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, intervalMs));
  }
  throw new Error("Application readiness did not succeed before the deadline.");
}
