import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("watchnext-backend");
const groups = meter.createCounter("watchnext.groups.created");
const titles = meter.createCounter("watchnext.titles.created");
const failures = meter.createCounter("watchnext.titles.creation.failures");

// The endpoint names are fixed; no user identifiers, URLs or content are labels.
export async function recordApplicationMetrics(method: string, path: string[], response: Response) {
  if (method !== "POST") return;
  const key = path.join("/");
  if ((key === "groups" || key === "legacy/groups") && response.ok) groups.add(1);
  const savingTitle = key === "library/manual" || /^metadata\/reviews\/[^/]+\/save$/.test(key);
  if (!savingTitle) return;
  if (!response.ok) { failures.add(1); return; }
  try {
    const body = await response.clone().json();
    if (body?.status === "created") titles.add(1);
  } catch { /* Never affect a response if metrics cannot inspect it. */ }
}

export function recordTitleException(method: string, path: string[]) {
  const key = path.join("/");
  if (method === "POST" && (key === "library/manual" || /^metadata\/reviews\/[^/]+\/save$/.test(key))) failures.add(1);
}
