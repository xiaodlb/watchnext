// Issue #52: this is intentionally an owned black-box journey. It receives
// only the temporary URL made by scripts/prisma/postgres-portability.mjs.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.cwd();
const env = { ...process.env };
env.WATCHNEXT_HTTP_METADATA_FIXTURES = "1";
const provider = env.WATCHNEXT_PORTABILITY_PROVIDER ?? "postgresql";
if (provider !== "sqlite" && provider !== "postgresql") throw new Error("WATCHNEXT_PORTABILITY_PROVIDER must be sqlite or postgresql.");
const sqliteRoot = provider === "sqlite" ? mkdtempSync(join(tmpdir(), "watchnext-sqlite-portability-")) : undefined;
if (provider === "postgresql" && !env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL?.startsWith("postgres")) throw new Error("This verification requires the owned PostgreSQL URL from prisma:postgres:start.");
if (provider === "sqlite") {
  const database = join(sqliteRoot, "watchnext.sqlite");
  env.WATCHNEXT_DATABASE_PATH = database;
  env.WATCHNEXT_HTTP_REPOSITORY = "prisma";
  env.WATCHNEXT_HTTP_PRISMA_PROVIDER = "sqlite";
  env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL = `file:${database.replace(/\\/g, "/")}`;
}
const check = (value, message) => { if (!value) throw new Error(message); };
const port = await new Promise((resolve, reject) => { const probe = createServer(); probe.once("error", reject); probe.listen(0, "127.0.0.1", () => { const value = probe.address().port; probe.close(error => error ? reject(error) : resolve(value)); }); });
const origin = `http://127.0.0.1:${port}`;
env.WATCHNEXT_APP_ORIGIN = origin;
let server;

async function command(args) {
  const child = spawn(process.execPath, args, { cwd: repo, env, stdio: "inherit", windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  check(code === 0, `${args.join(" ")} failed with ${code}`);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise(resolve => server.once("exit", resolve)); server.kill();
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Owned PostgreSQL HTTP server did not stop.")), 15000))]);
  server = undefined;
}
async function start() {
  server = spawn(process.execPath, ["--import", pathToFileURL(join(repo, "scripts/framework-privacy.mjs")).href, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: repo, env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let stderr = ""; server.stderr.on("data", data => { stderr += data; });
  for (let until = Date.now() + 30000; Date.now() < until;) {
    if (server.exitCode !== null) throw new Error(`PostgreSQL HTTP server exited before readiness: ${stderr.slice(0, 400)}`);
    try { if ((await fetch(`${origin}/v1/context`)).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error("PostgreSQL HTTP server did not become ready.");
}
const jar = () => ({ cookie: "" });
async function call(client, path, body, method = "POST") {
  const headers = { ...(client.cookie ? { cookie: client.cookie } : {}), ...(method === "GET" ? {} : { origin, "content-type": "application/json" }) };
  const response = await fetch(`${origin}/v1/${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const setCookie = response.headers.get("set-cookie"); if (setCookie) client.cookie = setCookie.split(";")[0];
  const text = await response.text(); let value; try { value = JSON.parse(text); } catch { value = text; }
  return { status: response.status, value };
}
const revision = value => value.context.revision;
const titleDraft = (expectedContextRevision, title = "PostgreSQL funny short") => ({ expectedContextRevision, title, contentType: "youtube", durationSeconds: 1200, numberingStyle: "none", genres: ["Comedy"], moods: ["funny"], watchUrl: "https://www.youtube.com/watch?v=AbCdEf12345", sourceUrl: "https://www.youtube.com/watch?v=AbCdEf12345", coverUrl: "https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg" });

try {
  if (provider === "sqlite") {
    await command(["node_modules/prisma/build/index.js", "generate", "--schema", "prisma/schema.prisma"]);
    await command(["--env-file-if-exists=.env.local", "scripts/db/init.mjs"]);
  }
  await command(["node_modules/next/dist/bin/next", "build"]);
  await start();
  const { chromium } = await import("playwright"); const browser = await chromium.launch({ headless: true });
  try { const page = await browser.newPage(); await page.goto(`${origin}/http`); check((await page.title()) !== "", "The mounted /http screen did not load against PostgreSQL."); } finally { await browser.close(); }

  const owner = jar(), member = jar(), outsider = jar(); const password = "PostgreSQL portable passphrase";
  const registration = await call(owner, "auth/register", { username: "Postgres.Owner", password, confirmation: password }); check(registration.status === 200, "Owner account registration failed.");
  const group = await call(owner, "groups", { name: "PostgreSQL group", expectedContextRevision: revision(registration.value) }); check(group.status === 200, "Owner group creation failed.");
  const memberRegistration = await call(member, "auth/register", { username: "Postgres.Member", password, confirmation: password }); check(memberRegistration.status === 200, "Member registration failed.");
  const invitation = await call(member, "invitations/resolve", { invite: group.value.invite }); const joined = await call(member, "groups/pending/join", { expectedContextRevision: revision(invitation.value) }); check(joined.status === 200, "Member could not join the owner group.");
  const ownerRevision = revision(group.value), memberRevision = revision(joined.value);
  const created = await call(owner, "library/manual", titleDraft(ownerRevision)); check(created.status === 200 && created.value.status === "created", "Owner could not persist a title."); const id = created.value.title.id;
  const duplicate = await call(member, "library/manual", titleDraft(memberRevision)); check(duplicate.status === 200 && duplicate.value.status === "existing" && duplicate.value.title.id === id, "Duplicate contribution did not retain one shared title.");
  check((await call(owner, `library/${id}/progress/timestamp`, { expectedContextRevision: ownerRevision, timestampSeconds: 60 }, "PUT")).status === 200, "Owner timestamp persistence failed.");
  check((await call(member, `library/${id}/rating`, { expectedContextRevision: memberRevision, score: 9 }, "PUT")).status === 200, "Member rating persistence failed.");
  check((await call(member, `library/${id}/note`, { expectedContextRevision: memberRevision, note: "PostgreSQL member note" }, "PUT")).status === 200, "Member note persistence failed.");
  const personal = await call(owner, `library/${id}`, undefined, "GET"); check(personal.status === 200 && personal.value.personal.timestampSeconds === 60 && personal.value.history.some(row => row.rating === 9 && row.note === "PostgreSQL member note"), "Personal data attribution was not isolated and visible correctly.");
  const inputs = await call(owner, "picker/inputs", undefined, "GET"); const pick = await call(owner, "picker/pick", { expectedContextRevision: ownerRevision, viewerIds: inputs.value.viewers.map(item => item.id), availableMinutes: 25, mood: "funny", rewatches: false, intentId: "postgres-portability-pick" }); check(pick.status === 200 && pick.value.kind === "picked", "Picker did not use persisted PostgreSQL data.");
  const removedOwner = await call(owner, `library/${id}/contribution/remove`, { expectedContextRevision: ownerRevision, revision: duplicate.value.title.revision, confirmed: true }); const removedMember = await call(member, `library/${id}/contribution/remove`, { expectedContextRevision: memberRevision, revision: removedOwner.value.title.revision, confirmed: true }); check(removedOwner.status === 200 && removedMember.status === 200 && removedMember.value.title.archived === true, "Final contribution removal did not archive the title.");
  const restored = await call(owner, `library/archive/${id}/restore`, { expectedContextRevision: ownerRevision, revision: removedMember.value.title.revision }); check(restored.status === 200 && restored.value.title.id === id, "Archive restore did not retain stable title identity.");
  const search = await call(owner, "metadata/search", { expectedContextRevision: ownerRevision, source: "youtube", kind: "title", query: "browser fixture" }); const reviewed = await call(owner, `metadata/pages/${search.value.handle}/candidates/AbCdEf12345`, { expectedContextRevision: ownerRevision }); check(search.status === 200 && reviewed.status === 200, `Metadata page/review lifecycle could not start (search ${search.status}, review ${reviewed.status}: ${JSON.stringify(reviewed.value)}).`);
  const saved = await call(owner, `metadata/reviews/${reviewed.value.handle}/save`, { expectedContextRevision: ownerRevision, moods: ["funny"], numberingStyle: "none" }); const replay = await call(owner, `metadata/reviews/${reviewed.value.handle}/save`, { expectedContextRevision: ownerRevision, moods: ["funny"], numberingStyle: "none" }); check(saved.status === 200 && replay.status >= 400, "Metadata review was replayable after consumption.");
  const Require = createRequire(join(repo, "package.json")); const { PrismaClient } = provider === "postgresql" ? Require(join(repo, "generated", "postgres-client")) : Require("@prisma/client"); const db = new PrismaClient({ datasources: { db: { url: env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL } } });
  try {
    const expirySearch = await call(owner, "metadata/search", { expectedContextRevision: ownerRevision, source: "youtube", kind: "link", query: "AbCdEf12345" }); const expiryReview = expirySearch;
    check(expirySearch.status === 200 && expiryReview.status === 200, "An owned metadata review could not be prepared for expiry verification.");
    await db.metadataReview.update({ where: { handleHash: createHash("sha256").update(expiryReview.value.handle).digest("hex") }, data: { expiresAt: "1970-01-01T00:00:00.000Z" } });
    const expired = await call(owner, `metadata/reviews/${expiryReview.value.handle}/save`, { expectedContextRevision: ownerRevision, moods: ["funny"], numberingStyle: "none" }); check(expired.status >= 400, "Expired metadata review was accepted.");
    const tables = ["accounts", "account_sessions", "groups", "titles", "contributors", "progress", "ratings", "notes", "metadata_fields", "metadata_reviews", "pending_group_invitations"];
    for (const table of tables) { const rows = await db.$queryRawUnsafe(`SELECT count(*) AS count FROM "${table}"`); check(Array.isArray(rows), `PostgreSQL table ${table} is not mapped.`); }
  } finally { await db.$disconnect(); }
  const otherRegistration = await call(outsider, "auth/register", { username: "Postgres.Outsider", password, confirmation: password }); const otherGroup = await call(outsider, "groups", { name: "Other PostgreSQL group", expectedContextRevision: revision(otherRegistration.value) }); const forbidden = await call(outsider, `library/${id}`, undefined, "GET"); check(otherGroup.status === 200 && forbidden.status >= 400, "Cross-group access to persisted title was allowed.");
  await stop(); await start(); const retained = await call(owner, `library/${id}`, undefined, "GET"); check(retained.status === 200 && retained.value.id === id && retained.value.personal.timestampSeconds === 60, "PostgreSQL data did not survive an owned server restart.");
  console.log(`PASS: ${provider} HTTP/browser journey covered accounts, group authorization, cross-group denial, contributions/history, archive/restore, personal isolation, metadata expiry/replay, picker, and restart persistence.`);
} finally { await stop(); if (sqliteRoot) rmSync(sqliteRoot, { recursive: true, force: true }); }
