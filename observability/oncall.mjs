import http from "node:http";

// Alertmanager is connected through the private Compose network. Only static
// rule names, status, and bounded deployment labels leave that network.
const safeLabel = value => typeof value === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : "unknown";
const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/alerts") { res.writeHead(404).end(); return; }
  let body = "";
  req.on("data", chunk => { body += chunk; if (body.length > 65536) req.destroy(); });
  req.on("end", async () => {
    try {
      const payload = JSON.parse(body);
      if (!Array.isArray(payload.alerts)) throw new Error("Invalid alert payload");
      const alerts = payload.alerts.slice(0, 10).map(a => ({
        name: safeLabel(a.labels?.alertname), status: safeLabel(a.status),
        environment: safeLabel(a.labels?.deployment_environment_name), version: safeLabel(a.labels?.service_version),
      }));
      if (!process.env.OPENAI_API_KEY) {
        console.error("AI on-call unavailable: OPENAI_API_KEY is not configured");
        res.writeHead(503).end("AI on-call not configured"); return;
      }
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", max_output_tokens: 400,
          instructions: "You are the WatchNext on-call assistant. Explain the alert and suggest safe read-only diagnostic steps. Never claim to have inspected or changed systems. No commands that modify data.",
          input: JSON.stringify(alerts) }),
      });
      if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
      const result = await response.json();
      const text = (result.output || []).flatMap(item => item.content || []).filter(item => item.type === "output_text").map(item => item.text).join("\n");
      if (!text) throw new Error("AI provider returned no advice");
      console.log(JSON.stringify({ event: "oncall_analysis", alerts, advice: text.slice(0, 4000) }));
      res.writeHead(200).end("accepted");
    } catch (error) {
      console.error(`AI on-call failed: ${error instanceof Error ? error.message : "unknown error"}`);
      res.writeHead(503).end("failed");
    }
  });
});
server.listen(8080, "0.0.0.0");
