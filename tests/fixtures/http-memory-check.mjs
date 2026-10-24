import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "watchnext-http-memory-"));
const password = "Synthetic memory password";
let server, browser;

const fail = message => { throw new Error(message); };
const check = (value, message) => { if (!value) fail(message); };
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const value = probe.address().port;
    probe.close(error => error ? reject(error) : resolve(value));
  });
});
const origin = `http://127.0.0.1:${port}`;
const database = join(root, "must-not-exist.sqlite");
const environment = {
  ...process.env,
  HOME: join(root, "home"), USERPROFILE: join(root, "home"), LOCALAPPDATA: join(root, "local"), XDG_DATA_HOME: join(root, "local"),
  WATCHNEXT_APP_ORIGIN: origin, WATCHNEXT_DATABASE_PATH: database, WATCHNEXT_HTTP_MEMORY: "1", WATCHNEXT_HTTP_METADATA_FIXTURES: "1", NEXT_TELEMETRY_DISABLED: "1",
};

async function stop() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise(resolve => server.once("exit", resolve));
  server.kill();
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Owned HTTP memory server did not stop.")), 10000))]);
  server = undefined;
}

async function start() {
  server = spawn(process.execPath, ["--import", pathToFileURL(join(repo, "scripts/framework-privacy.mjs")).href, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repo, env: environment, stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
  });
  let stderr = "";
  server.stderr.on("data", value => { stderr += value; });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) fail(`Memory server exited before readiness: ${stderr.slice(0, 300)}`);
    try { if ((await fetch(`${origin}/v1/context`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  fail("Memory server did not become ready.");
}

const jar = () => ({ cookie: "" });
async function call(client, path, body, method = "POST", extra = {}) {
  const headers = { ...extra, ...(client.cookie ? { cookie: client.cookie } : {}) };
  if (method !== "GET") Object.assign(headers, { origin, "content-type": "application/json" });
  const response = await fetch(`${origin}/v1/${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) client.cookie = setCookie.split(";")[0];
  return { response, value: await response.json() };
}
const revision = value => value.context.revision;
async function browserClient(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(`${origin}/v1/context`);
  const callFromPage = (path, body, method = "POST") => page.evaluate(async ({ path, body, method }) => {
    const response = await fetch(`/v1/${path}`, { method, headers: method === "GET" ? {} : { origin: location.origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, value: await response.json() };
  }, { path, body, method });
  return { context, page, call: callFromPage };
}

try {
  const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { cwd: repo, env: environment, stdio: "inherit", windowsHide: true });
  const buildCode = await new Promise((resolve, reject) => { build.once("error", reject); build.once("exit", resolve); });
  check(buildCode === 0, "Production build failed.");
  await start();

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking", "--no-first-run"] });
  const browserOwner = await browserClient(1280), browserMember = await browserClient(375);
  const ownerBrowserRegistration = await browserOwner.call("auth/register", { username: "Browser.Library.Owner", password, confirmation: password });
  check(ownerBrowserRegistration.status === 200, "First browser context could not register.");
  const browserGroup = await browserOwner.call("groups", { name: "Browser library group", expectedContextRevision: revision(ownerBrowserRegistration.value) });
  check(browserGroup.status === 200, "First browser context could not create its group.");
  const memberBrowserRegistration = await browserMember.call("auth/register", { username: "Browser.Library.Member", password, confirmation: password });
  const browserInvite = await browserMember.call("invitations/resolve", { invite: browserGroup.value.invite });
  const browserJoined = await browserMember.call("groups/pending/join", { expectedContextRevision: revision(browserInvite.value) });
  check(memberBrowserRegistration.status === 200 && browserJoined.status === 200, "Second browser context could not join the library group.");
  const ownerRevision = 2, memberRevision = revision(browserJoined.value);
  const manual = (title, contentType, durationSeconds, numberingStyle) => ({ expectedContextRevision: ownerRevision, title, contentType, durationSeconds, numberingStyle, genres: ["Comedy"], moods: ["funny"], watchUrl: "https://example.test/watch", sourceUrl: null, coverUrl: null });
  const movie = await browserOwner.call("library/manual", manual("Browser movie", "movie", 1200, "none"));
  const series = await browserOwner.call("library/manual", manual("Browser series", "series", 1440, "continuous"));
  const anime = await browserOwner.call("library/manual", manual("Browser anime", "anime", 1320, "season_episode"));
  const video = await browserOwner.call("library/manual", manual("Browser video", "youtube", 180, "none"));
  check([movie, series, anime, video].every(result => result.status === 200 && result.value.status === "created"), "Browser library journey could not save all four manual content types.");
  const sharedContribution = await browserMember.call("library/manual", { ...manual("Browser movie", "movie", 1200, "none"), expectedContextRevision: memberRevision });
  check(sharedContribution.status === 200 && sharedContribution.value.status === "contributed", "Second browser context could not add its contributor attribution.");
  const ownerAll = await browserOwner.call("library?filter=all", undefined, "GET"), memberMine = await browserMember.call("library?filter=mine", undefined, "GET");
  check(ownerAll.value.items.length === 4 && memberMine.value.items.length === 1 && memberMine.value.items[0].id === movie.value.title.id, "Browser contexts did not receive group-scoped All/Mine library projections.");
  const ownerEpisode = await browserOwner.call(`library/${series.value.title.id}/progress/episode`, { expectedContextRevision: ownerRevision, position: "not_started", season: null, episode: 1 }, "PUT");
  const memberEpisode = await browserMember.call(`library/${series.value.title.id}/progress/episode`, { expectedContextRevision: memberRevision, position: "not_started", season: null, episode: 1 }, "PUT");
  const ownerTimestamp = await browserOwner.call(`library/${movie.value.title.id}/progress/timestamp`, { expectedContextRevision: ownerRevision, timestampSeconds: 0 }, "PUT");
  const memberRating = await browserMember.call(`library/${movie.value.title.id}/rating`, { expectedContextRevision: memberRevision, score: 9 }, "PUT");
  const memberNote = await browserMember.call(`library/${movie.value.title.id}/note`, { expectedContextRevision: memberRevision, note: "Browser\nprivate note" }, "PUT");
  check([ownerEpisode, memberEpisode, ownerTimestamp, memberRating, memberNote].every(result => result.status === 200), "Browser contexts could not save independent personal progress and feedback.");
  const pickerInputs = await browserOwner.call("picker/inputs", undefined, "GET");
  const pick = await browserOwner.call("picker/pick", { expectedContextRevision: ownerRevision, viewerIds: pickerInputs.value.viewers.map(viewer => viewer.id), availableMinutes: 25, mood: "funny", rewatches: false, intentId: "browser-start" });
  const pickAgain = await browserOwner.call(`picker/cycles/${pick.value.cycle?.cycleId}/next`, { expectedContextRevision: ownerRevision, step: pick.value.cycle?.step, intentId: "browser-next" });
  check(pickerInputs.status === 200 && pickerInputs.value.viewers.length === 2 && pick.status === 200 && pick.value.kind === "picked" && pickAgain.status === 200 && ["picked", "exhausted"].includes(pickAgain.value.kind), "Browser picker did not use fresh shared progress and the bounded HTTP cycle.");
  const ownerPersonal = await browserOwner.call(`library/${movie.value.title.id}`, undefined, "GET");
  check(ownerPersonal.value.personal?.timestampSeconds === 0 && ownerPersonal.value.history.some(entry => entry.rating === 9 && entry.note === "Browser\nprivate note"), "Browser personal history projection was not attributed to the current member.");
  const missingRemoveConfirmation = await browserOwner.call(`library/${movie.value.title.id}/contribution/remove`, { expectedContextRevision: ownerRevision, revision: sharedContribution.value.title.revision });
  const staleRemove = await browserOwner.call(`library/${movie.value.title.id}/contribution/remove`, { expectedContextRevision: ownerRevision, revision: sharedContribution.value.title.revision - 1, confirmed: true });
  check(missingRemoveConfirmation.status >= 400 && staleRemove.status >= 400, "Browser W07 accepted missing confirmation or a stale title revision.");
  const ownerRemoved = await browserOwner.call(`library/${movie.value.title.id}/contribution/remove`, { expectedContextRevision: ownerRevision, revision: sharedContribution.value.title.revision, confirmed: true });
  const archivedMovie = await browserMember.call(`library/${movie.value.title.id}/contribution/remove`, { expectedContextRevision: memberRevision, revision: ownerRemoved.value.title.revision, confirmed: true });
  check(ownerRemoved.status === 200 && archivedMovie.status === 200 && archivedMovie.value.status === "archived", "Browser contexts could not confirm contributor removal and final archive.");
  const missingRestoreRevision = await browserOwner.call(`library/archive/${movie.value.title.id}/restore`, { expectedContextRevision: ownerRevision });
  const staleRestore = await browserOwner.call(`library/archive/${movie.value.title.id}/restore`, { expectedContextRevision: ownerRevision, revision: archivedMovie.value.title.revision - 1 });
  const restoredMovie = await browserOwner.call(`library/archive/${movie.value.title.id}/restore`, { expectedContextRevision: ownerRevision, revision: archivedMovie.value.title.revision });
  check(missingRestoreRevision.status >= 400 && staleRestore.status >= 400 && restoredMovie.status === 200 && restoredMovie.value.title.id === movie.value.title.id, "Browser W08 did not reject missing/stale revisions or retain the title identity.");
  const ytSearch = await browserOwner.call("metadata/search", { expectedContextRevision: ownerRevision, source: "youtube", kind: "title", query: "browser fixture" });
  check(ytSearch.status === 200 && ytSearch.value.candidates.length === 1, "Browser provider journey did not receive a YouTube candidate through the adapter.");
  const foreignSelection = await browserMember.call(`metadata/pages/${ytSearch.value.handle}/candidates/AbCdEf12345`, { expectedContextRevision: memberRevision });
  check(foreignSelection.status >= 400, "A browser context used another member's provider page handle.");
  const ytReview = await browserOwner.call(`metadata/pages/${ytSearch.value.handle}/candidates/AbCdEf12345`, { expectedContextRevision: ownerRevision });
  const ytSaved = await browserOwner.call(`metadata/reviews/${ytReview.value.handle}/save`, { expectedContextRevision: ownerRevision, moods: ["funny"], numberingStyle: "none" });
  check(ytReview.status === 200 && ytSaved.status === 200 && ytSaved.value.status === "created", "Browser provider review/save did not use the real memory library.");
  const refreshed = await browserOwner.call(`library/${ytSaved.value.title.id}/metadata/refresh`, { expectedContextRevision: ownerRevision });
  check(refreshed.status === 200, "Browser provider refresh was unavailable after a reviewed save.");
  const kinoSearch = await browserOwner.call("metadata/search", { expectedContextRevision: ownerRevision, source: "kinopoisk", kind: "title", query: "browser fixture" });
  const kinoReview = await browserOwner.call(`metadata/pages/${kinoSearch.value.handle}/candidates/424242`, { expectedContextRevision: ownerRevision });
  const kinoSaved = await browserOwner.call(`metadata/reviews/${kinoReview.value.handle}/save`, { expectedContextRevision: ownerRevision, moods: ["funny"], numberingStyle: "none" });
check(kinoSearch.status === 200 && kinoReview.status === 200 && kinoSaved.status === 200 && kinoSaved.value.status === "created", "Browser Kinopoisk candidate/review/save did not use the server adapter.");

  // #47: drive the mounted /http client controls, not raw page-side fetch, through M01–M04.
  await browserOwner.page.goto(`${origin}/http`);
  await browserOwner.page.getByLabel("Lookup query", { exact: true }).fill("browser fixture");
  await browserOwner.page.getByRole("button", { name: "Search metadata", exact: true }).click();
  await browserOwner.page.getByRole("button", { name: "Choose HTTP fixture YouTube", exact: true }).click();
  await browserOwner.page.getByLabel("Entry title", { exact: true }).waitFor();
  for (let tries = 0; tries < 60 && await browserOwner.page.getByLabel("Entry title", { exact: true }).inputValue() !== "HTTP fixture YouTube"; tries++) await new Promise(done => setTimeout(done, 50));
  check(await browserOwner.page.getByLabel("Entry title", { exact: true }).inputValue() === "HTTP fixture YouTube", "Mounted HTTP UI did not apply the selected YouTube review.");
  const funny = browserOwner.page.getByRole("checkbox", { name: "funny", exact: true }); if (!await funny.isChecked()) await funny.check();
  await browserOwner.page.getByRole("button", { name: "Save entry", exact: true }).click();
  await browserOwner.page.getByText(/Saved entry: HTTP fixture YouTube/).waitFor();
  await browserOwner.page.getByRole("button", { name: "Start fresh manual draft", exact: true }).click();
  await browserOwner.page.getByLabel("Lookup source", { exact: true }).selectOption("kinopoisk");
  await browserOwner.page.getByLabel("Lookup query", { exact: true }).fill("browser fixture");
  await browserOwner.page.getByRole("button", { name: "Search metadata", exact: true }).click();
  await browserOwner.page.getByRole("button", { name: "Choose HTTP fixture Kinopoisk", exact: true }).click();
  for (let tries = 0; tries < 60 && await browserOwner.page.getByLabel("Entry title", { exact: true }).inputValue() !== "HTTP fixture Kinopoisk"; tries++) await new Promise(done => setTimeout(done, 50));
  check(await browserOwner.page.getByLabel("Entry title", { exact: true }).inputValue() === "HTTP fixture Kinopoisk", "Mounted HTTP UI did not apply the selected Kinopoisk review.");
  console.log("HTTP memory UI journey passed: mounted /http applies selected YouTube/Kinopoisk reviews and sends explicit save through the typed adapter.");
  await browserOwner.context.close(); await browserMember.context.close();

  const owner = jar(), member = jar(), outsider = jar(), legacy = jar();
  const ownerRegistration = await call(owner, "auth/register", { username: "Http.Owner", password, confirmation: password });
  check(ownerRegistration.response.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(ownerRegistration.value.recoveryCode), "Owner registration did not return one synthetic recovery disclosure.");
  const created = await call(owner, "groups", { name: "HTTP proof group", expectedContextRevision: revision(ownerRegistration.value) });
  check(created.response.status === 200 && created.value.invite.startsWith(`${origin}/invite/`), "Owner could not create a group through HTTP.");

  const memberRegistration = await call(member, "auth/register", { username: "Http.Member", password, confirmation: password });
  const memberInvite = await call(member, "invitations/resolve", { invite: created.value.invite });
  check(memberInvite.response.status === 200 && memberInvite.value.pending?.needsAccount === false, "A second HTTP client could not resolve the invitation.");
  const joined = await call(member, "groups/pending/join", { expectedContextRevision: revision(memberInvite.value) });
  check(joined.response.status === 200 && joined.value.members.length === 2, "A second HTTP client could not join the group.");
  const memberId = joined.value.members.find(item => item.name === "Http.Member")?.id;

  const outsiderRegistration = await call(outsider, "auth/register", { username: "Http.Outsider", password, confirmation: password });
  const outsiderRemove = await call(outsider, "groups/current/members/remove", { expectedContextRevision: revision(outsiderRegistration.value), memberId, confirmed: true });
  check(outsiderRemove.response.status >= 400, "A foreign HTTP client was allowed to remove a participant.");
  const removal = await call(owner, "groups/current/members/remove", { expectedContextRevision: created.value.context.revision, memberId, confirmed: true });
  check(removal.response.status === 200, "Owner could not remove a participant.");
  const removedRead = await call(member, "groups/current", undefined, "GET");
  check(removedRead.response.status >= 400, "Removed participant retained group access.");
  const removedContext = await call(member, "context", undefined, "GET");
  check(removedContext.response.status === 200 && removedContext.value.context?.groupId === null && removedContext.value.group === null && removedContext.value.account?.memberships?.length === 0, "Removed participant context disclosed the selected group.");
  check(!JSON.stringify(removedContext.value).includes(created.value.context.groupId), "Removed participant context leaked the selected group identifier.");
  const rotation = await call(owner, "groups/current/invitations/rotate", { expectedContextRevision: revision(removal.value), generation: 1, confirmed: true });
  check(rotation.response.status === 200, "Owner could not rotate an invitation.");
  const oldInvite = await call(member, "invitations/resolve", { invite: created.value.invite });
  check(oldInvite.response.status >= 400, "Rotated-away invitation remained usable.");
  const rejoinIntent = await call(member, "invitations/resolve", { invite: rotation.value.invite });
  const rejoined = await call(member, "groups/pending/join", { expectedContextRevision: revision(rejoinIntent.value) });
  check(rejoined.response.status === 200 && rejoined.value.members.find(item => item.name === "Http.Member")?.id === memberId, "Removal/rejoin did not retain the member identity.");

  const legacyCreated = await call(legacy, "legacy/groups", { name: "HTTP legacy group" });
  const legacyAccess = await call(legacy, "invitations/resolve", { invite: legacyCreated.value.invite });
  check(legacyAccess.response.status === 200 && legacy.cookie.startsWith("watchnext_session="), "Legacy invitation did not create a legacy-only HTTP session.");
  const legacyProfile = await call(legacy, "legacy/groups/current/profiles", { name: "HTTP Legacy", color: "teal", expectedContextRevision: revision(legacyAccess.value) });
  check(legacyProfile.response.status === 200 && legacyProfile.value.mode === "legacy", "Legacy HTTP profile context was unavailable.");

  const rejectedOrigin = await fetch(`${origin}/v1/auth/logout`, { method: "POST", headers: { origin: "https://untrusted.example", "content-type": "application/json" }, body: "{}" });
  check(rejectedOrigin.status >= 400, "Cross-origin mutation was accepted.");
  const recovery = await call(jar(), "auth/recovery", { username: "Http.Owner", proof: ownerRegistration.value.recoveryCode, password: "Replacement memory password", confirmation: "Replacement memory password" });
  check(recovery.response.status === 200, "Recovery did not work over the actual HTTP route.");

  await stop();
  check(!existsSync(database), "Memory mode opened the configured SQLite database.");
  await start();
  const afterRestart = await call(owner, "context", undefined, "GET");
  check(afterRestart.response.status === 200 && afterRestart.value.account === null, "Owned server restart retained an in-memory account or session.");
  check(!existsSync(database), "Memory-mode restart opened the configured SQLite database.");
  console.log("HTTP memory journey passed: two browser contexts cover four library types, contributor attribution, All/Mine, YouTube/Kinopoisk review/refresh, plus independent auth/group/legacy guards and restart loss.");
} finally {
  await browser?.close();
  await stop();
  rmSync(root, { recursive: true, force: true });
}
