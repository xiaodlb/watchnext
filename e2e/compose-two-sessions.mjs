import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = `watchnext-e2e-${randomBytes(10).toString("hex")}`;
const tempBase = resolve(tmpdir());
const temp = mkdtempSync(join(tempBase, "watchnext-compose-e2e-"));
const envFile = join(temp, "compose.env");
const overrideFile = join(temp, "image.json");
const image = process.env.WATCHNEXT_E2E_IMAGE;
const password = randomBytes(24).toString("base64url");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(COMPOSE_|WATCHNEXT_|POSTGRES_|DATABASE_URL$|YOUTUBE_API_KEY$|KINOPOISK_UNOFFICIAL_API_KEY$)/i.test(key),
));
env.WATCHNEXT_COMPOSE_DB_USER = "e2e";
env.WATCHNEXT_COMPOSE_DB_PASSWORD = password;
env.WATCHNEXT_COMPOSE_DB_NAME = "e2e";
env.YOUTUBE_API_KEY = "";
env.KINOPOISK_UNOFFICIAL_API_KEY = "";

let stage = "setup", started = false, browser, interrupted = false;
let lastPickerProbe = "picker response unavailable";
const composeArgs = ["compose", "--project-name", project, "--project-directory", root, "--env-file", envFile, "-f", join(root, "docker-compose.yaml")];
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  interrupted = true;
  void browser?.close().catch(() => {});
});
function checkInterrupted() { if (interrupted) throw new Error("Interrupted."); }

function docker(args, timeout = 30000, allowFailure = false) {
  const result = spawnSync("docker", args, { cwd: root, env, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 });
  if ((result.error || result.status !== 0) && !allowFailure) throw new Error(`Docker command failed during ${stage}.`);
  return result;
}
function compose(args, timeout = 30000, allowFailure = false) { return docker([...composeArgs, ...args], timeout, allowFailure); }
function dockerLines(args) { return docker(args).stdout.trim().split(/\r?\n/).filter(Boolean); }
function safePickerLogCategories() {
  const result = compose(["logs", "--no-color", "--tail", "120", "app"], 30000, true);
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const categories = [
    ["type-error", /\bTypeError\b/i],
    ["bigint-serialization", /BigInt.{0,80}(?:serializ|JSON)|(?:serializ|JSON).{0,80}BigInt/i],
    ["prisma-error", /Prisma(?:Client)?(?:KnownRequestError|UnknownRequestError|ValidationError|InitializationError)/i],
    ["serialization-error", /circular structure|circular reference|serialization error|serialize to JSON/i],
    ["framework-exception", /\b(?:ReferenceError|RangeError|SyntaxError)\b/i],
  ];
  return categories.filter(([, pattern]) => pattern.test(text)).map(([name]) => name).join(",") || "none-recognized";
}
async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(error => error ? reject(error) : resolvePort(port)); });
  });
}
function assertOwnedTemp() {
  if (!resolve(temp).startsWith(`${tempBase}${sep}`) || !basename(temp).startsWith("watchnext-compose-e2e-")) throw new Error("Unsafe temporary path.");
}
function assertNoExistingProject() {
  for (const resource of ["container", "network", "volume"]) {
    const flags = resource === "container" ? ["--all", "--quiet"] : ["--quiet"];
    if (dockerLines([resource, "ls", ...flags, "--filter", `label=com.docker.compose.project=${project}`]).length) throw new Error("Generated test project already exists.");
  }
  if (docker(["volume", "inspect", `${project}_postgres-data`], 30000, true).status === 0) throw new Error("Generated test volume already exists.");
}
async function register(page, username, loginAfter) {
  await page.goto(origin);
  await page.getByRole("tab", { name: "Create account", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("heading", { name: "Save your recovery code" }).waitFor();
  await page.getByRole("button", { name: "I saved it — continue" }).click();
  await page.getByRole("heading", { name: "Your groups" }).waitFor();
  if (!loginAfter) return;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Your groups" }).waitFor();
}
async function addTitle(page, title, { youtube = false, confirmDuplicate = false, kind = youtube ? "YouTube" : "Movie", minutes = 25, mood = "Funny", watchUrl = youtube ? "https://www.youtube.com/watch?v=dQw4w9WgXcQ" : "" } = {}) {
  await page.goto(`${origin}/add`);
  if (kind !== "Movie") await page.getByRole("button", { name: kind === "YouTube" ? "YouTube video" : kind, exact: true }).click();
  if (kind === "YouTube" || watchUrl) await page.getByLabel("Watch link", { exact: false }).fill(watchUrl);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel(kind === "Series" || kind === "Anime" ? "Typical episode length (min)" : "Runtime (min)", { exact: true }).fill(String(minutes));
  await page.getByRole("button", { name: mood, exact: true }).click();
  if (confirmDuplicate) page.once("dialog", dialog => { void dialog.accept(); });
  await page.getByRole("button", { name: "Save to list", exact: true }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  return page.url();
}

async function saveProgress(page, titleUrl, value) {
  await page.goto(titleUrl);
  await page.getByLabel(/Stopped at \(H:MM:SS\)|Next episode to watch/).fill(value);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved", { exact: true }).waitFor();
}

async function pageNoMatchVisible(page) {
  return page.getByText("No saved item matches these viewers and the permitted time/mood tiers. Keep your inputs or adjust them explicitly.", { exact: true }).isVisible().catch(() => false);
}

async function pick(page, { viewers, minutes, mood, scenario, expectedTitle }) {
  stage = "opening picker controls";
  await page.goto(`${origin}/pick`);
  stage = "selecting picker viewers";
  const viewerGroup = page.getByRole("group", { name: "Who's watching?" });
  for (const viewer of viewers) {
    const button = viewer === "You"
      ? viewerGroup.getByRole("button").filter({ hasText: "You" })
      : viewerGroup.getByRole("button", { name: new RegExp(viewer) });
    await button.click();
  }
  stage = "setting picker time";
  await page.getByLabel("Minutes available").fill(String(minutes));
  stage = "setting picker mood";
  const moodGroup = page.getByRole("group", { name: "What's the mood?" });
  await moodGroup.getByRole("button", { name: mood, exact: true }).click();
  stage = "submitting picker request";
  const pickerResponse = page.waitForResponse(response => {
    if (response.request().method() !== "POST") return false;
    const path = new URL(response.url()).pathname;
    return path === "/v1/picker/pick" || /^\/v1\/picker\/cycles\/[^/]+\/next$/.test(path);
  }).then(async response => {
    const url = new URL(response.url());
    const path = url.pathname === "/v1/picker/pick" ? url.pathname : "/v1/picker/cycles/:id/next";
    let kind = "missing";
    let code = "none";
    let titleMatches = "n/a", moodMatches = "n/a", withinBudget = "n/a";
    const rawContentType = response.headers()["content-type"]?.split(";", 1)[0] ?? "missing";
    const contentType = ["application/json", "text/plain"].includes(rawContentType) ? rawContentType : rawContentType === "missing" ? "missing" : "other";
    try {
      const body = await response.json();
      kind = ["picked", "no_match", "exhausted"].includes(body?.kind) ? body.kind : typeof body?.kind === "string" ? "other" : "missing";
      const candidate = body?.error?.code;
      if (["validation_failed", "service_unavailable", "conflict"].includes(candidate)) code = candidate;
      else if (typeof candidate === "string") code = "other";
      if (expectedTitle) {
        titleMatches = String(body?.candidate?.title === expectedTitle);
        withinBudget = String(Number.isFinite(body?.candidate?.durationSeconds) && body.candidate.durationSeconds <= minutes * 60);
        moodMatches = "false";
        if (typeof body?.candidate?.id === "string") {
          moodMatches = String(await page.evaluate(async ({ candidateId, requestedMood }) => {
            try {
              const response = await fetch("/v1/library", { cache: "no-store" });
              const library = await response.json();
              const candidate = library.items?.find(item => item.id === candidateId);
              return Array.isArray(candidate?.moods) && candidate.moods.includes(requestedMood.toLowerCase());
            } catch { return false; }
          }, { candidateId: body.candidate.id, requestedMood: mood }));
        }
      }
    } catch { kind = "non-json"; }
    const status = response.status();
    const category = status >= 500 ? "server-error" : status >= 400 ? "request-error" : "success";
    lastPickerProbe = `HTTP ${status} ${path} content-type=${contentType} category=${category} kind=${kind} error-code=${code} title-matches=${titleMatches} mood-matches=${moodMatches} within-budget=${withinBudget}`;
    return lastPickerProbe;
  }).catch(() => "picker HTTP response unavailable");
  await page.getByRole("button", { name: "Pick something", exact: true }).click();
  stage = `waiting for picker result (${scenario})`;
  const result = page.locator('[aria-live="polite"] section').filter({ has: page.getByText("Tonight's pick", { exact: true }) });
  const noMatch = page.getByText("No saved item matches these viewers and the permitted time/mood tiers. Keep your inputs or adjust them explicitly.", { exact: true });
  const alert = page.locator("main [role=alert]").filter({ hasText: /\S/ }).first();
  try {
    await page.waitForFunction(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
      };
      const hasAlert = [...document.querySelectorAll("main [role=alert]")].some(element => element.textContent?.trim() && visible(element));
      const hasNoMatch = document.body.innerText.includes("No saved item matches these viewers and the permitted time/mood tiers. Keep your inputs or adjust them explicitly.");
      const hasResult = [...document.querySelectorAll('[aria-live="polite"] section')].some(section => visible(section) && section.textContent?.includes("Tonight's pick"));
      return hasAlert || hasNoMatch || hasResult;
    }, null, { timeout: 30000 });
  } catch {
    const resultCount = await result.count().catch(() => 0);
    const noMatchCount = await noMatch.count().catch(() => 0);
    const alertVisible = await alert.isVisible().catch(() => false);
    const buttonEnabled = await page.getByRole("button", { name: "Pick something", exact: true }).isEnabled().catch(() => false);
    const diagnostic = await Promise.race([pickerResponse, new Promise(resolveDiagnostic => setTimeout(() => resolveDiagnostic("picker HTTP response unavailable"), 2500))]);
    throw new Error(`Picker timed out (${scenario}; result-section-count=${resultCount}; no-match-count=${noMatchCount}; alert-visible=${alertVisible}; button-enabled=${buttonEnabled}; ${diagnostic}).`);
  }
  if (await alert.isVisible().catch(() => false)) {
    const buttonEnabled = await page.getByRole("button", { name: "Pick something", exact: true }).isEnabled().catch(() => false);
    const diagnostic = await Promise.race([pickerResponse, new Promise(resolveDiagnostic => setTimeout(() => resolveDiagnostic("picker HTTP response unavailable"), 2500))]);
    throw new Error(`Picker showed an alert (${scenario}; button-enabled=${buttonEnabled}; ${diagnostic}).`);
  }
  await Promise.race([pickerResponse, new Promise(resolveDiagnostic => setTimeout(resolveDiagnostic, 2500))]);
  if (await noMatch.isVisible().catch(() => false)) return result;
  return result;
}
async function assertWatchlistEntry(page, title, contributors, visibleNames) {
  await page.goto(`${origin}/watchlist`);
  await page.getByRole("heading", { name: groupName }).waitFor();
  const entry = page.getByRole("link", { name: new RegExp(title) });
  stage = "waiting for the saved watchlist title";
  await entry.first().waitFor();
  stage = "checking that the title appears once";
  const cards = page.getByRole("listitem").filter({ hasText: title });
  const cardCount = await cards.count();
  if (cardCount !== 1) { stage = `checking that the title appears once (${cardCount} matching cards)`; throw new Error("Watchlist entry count did not match."); }
  const attribution = cards.locator('[aria-label^="Added by "]');
  stage = "checking contributor attribution";
  await attribution.waitFor();
  if (await attribution.getAttribute("aria-label") !== `Added by ${contributors.join(", ")}`) {
    throw new Error("Contributor attribution did not match.");
  }
  stage = "checking visible contributor names";
  const text = (await attribution.innerText()).replace(/\s+/g, " ").trim();
  if (!visibleNames.every(name => text.includes(name))) throw new Error("Visible contributor names did not match.");
}

async function groupApiSummary(page) {
  return page.evaluate(async () => {
    async function read(path) {
      try {
        const response = await fetch(path, { cache: "no-store" });
        let body = null;
        try { body = await response.json(); } catch {}
        return { status: response.status, body };
      } catch { return { status: 0, body: null }; }
    }
    const [contextResult, workspaceResult] = await Promise.all([read("/v1/context"), read("/v1/groups/current")]);
    const context = contextResult.body?.context;
    const memberships = contextResult.body?.account?.memberships;
    const workspace = workspaceResult.body;
    return {
      contextStatus: contextResult.status,
      contextMode: typeof context?.mode === "string" ? context.mode : "missing",
      contextHasSelectedGroup: Boolean(context?.groupId),
      contextHasMembership: Array.isArray(memberships) && memberships.length > 0,
      contextGroupMatchesMembership: Array.isArray(memberships) && memberships.includes(context?.groupId),
      workspaceStatus: workspaceResult.status,
      workspaceHasSelectedGroup: Boolean(workspace?.selected?.id),
      workspaceMemberCount: Array.isArray(workspace?.members) ? workspace.members.length : -1,
      workspaceHasCurrentMember: Boolean(workspace?.currentMemberId),
      workspaceCurrentMemberIncluded: Array.isArray(workspace?.members) && workspace.members.some(member => member.id === workspace.currentMemberId),
    };
  });
}

let origin = "", groupName = "";
let failed = false;
try {
  assertOwnedTemp();
  writeFileSync(envFile, "", { mode: 0o600, flag: "wx" });
  if (image) {
    stage = "checking the requested local image";
    if (docker(["image", "inspect", image], 30000, true).status !== 0) throw new Error("Requested local image does not exist.");
    writeFileSync(overrideFile, JSON.stringify({ services: { app: { image } } }), { mode: 0o600, flag: "wx" });
    composeArgs.push("-f", overrideFile);
  }
  stage = "checking isolated resources";
  if (!/^watchnext-e2e-[a-f0-9]{20}$/.test(project)) throw new Error("Invalid test project name.");
  assertNoExistingProject();
  env.WATCHNEXT_COMPOSE_PORT = String(await freePort());
  origin = `http://localhost:${env.WATCHNEXT_COMPOSE_PORT}`;
  const config = JSON.parse(compose(["config", "--format", "json"]).stdout);
  const volumes = Object.values(config.volumes ?? {});
  if (volumes.length !== 1 || volumes[0].name !== `${project}_postgres-data` || volumes[0].external === true) throw new Error("Compose volume is not isolated.");
  stage = "starting isolated Compose services";
  started = true;
  compose(["up", "-d", image ? "--no-build" : "--build", "--wait", "--wait-timeout", "180"], 600000);
  checkInterrupted();
  stage = "waiting for the isolated application";
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    checkInterrupted();
    try { if ((await fetch(`${origin}/v1/context`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 300));
  }
  if (!ready) throw new Error("Application did not become ready.");
  checkInterrupted();
  stage = "starting Chromium";
  if (!existsSync(chromium.executablePath())) throw new Error("Chromium is missing; run pnpm exec playwright install chromium.");
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking", "--no-first-run"] });
  const ownerContext = await browser.newContext({ serviceWorkers: "block" });
  const guestContext = await browser.newContext({ serviceWorkers: "block" });
  for (const context of [ownerContext, guestContext]) {
    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(30000);
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  }
  const owner = await ownerContext.newPage(), guest = await guestContext.newPage();
  const suffix = randomBytes(5).toString("hex");
  groupName = `E2E group ${suffix}`;
  stage = "registering and signing in the owner";
  await register(owner, `owner_${suffix}`, true);
  stage = "creating the shared group and invitation";
  await owner.getByLabel("Group name", { exact: true }).fill(groupName);
  await owner.getByRole("button", { name: "Create group", exact: true }).click();
  const inviteSection = owner.locator("section").filter({ has: owner.getByRole("heading", { name: "Invite your group" }) });
  await inviteSection.getByRole("heading", { name: "Invite your group" }).waitFor();
  const invite = await inviteSection.getByLabel("Invitation link", { exact: true }).inputValue();
  const inviteUrl = new URL(invite);
  if (inviteUrl.origin !== origin || !inviteUrl.pathname.startsWith("/invite/")) throw new Error("Invitation does not target the test server.");
  await inviteSection.getByRole("button", { name: "Open watchlist" }).click();
  await owner.getByRole("heading", { name: groupName }).waitFor();
  if (process.env.WATCHNEXT_PICKER_UI_ONLY === "1") {
    stage = "adding the picker-only synthetic title";
    const pickerTitle = `Picker UI probe ${suffix}`;
    await addTitle(owner, pickerTitle, { minutes: 18, mood: "Funny" });
    const recommendation = await pick(owner, { viewers: ["You"], minutes: 20, mood: "Funny", scenario: "focused exact match" });
    await recommendation.getByRole("heading", { name: pickerTitle, exact: true }).waitFor({ state: "visible" });
    console.log("PASS: picker recommendation was visibly rendered in the browser.");
  } else if (process.env.WATCHNEXT_PICKER_EXACT_ONLY === "1") {
    stage = "registering and joining the second account for the exact-picker probe";
    await register(guest, `guest_${suffix}`, true);
    await guest.goto(invite);
    await guest.getByRole("button", { name: "Open invitation" }).click();
    await guest.getByRole("button", { name: "Join group" }).click();
    await guest.getByRole("heading", { name: groupName }).waitFor();
    stage = "adding one exact-picker fixture";
    const pickerTitle = `Picker exact Funny ${suffix}`;
    await addTitle(owner, pickerTitle, { minutes: 18, mood: "Funny" });
    await pick(owner, { viewers: ["You", `guest_${suffix}`], minutes: 20, mood: "Funny", scenario: "exact match", expectedTitle: pickerTitle });
    const noMatchVisible = await pageNoMatchVisible(owner);
    const exactVisible = await owner.getByRole("heading", { name: pickerTitle, exact: true }).isVisible().catch(() => false);
    console.log(`DIAG: exact-picker ${lastPickerProbe} no-match-visible=${noMatchVisible} exact-visible=${exactVisible}`);
    if (noMatchVisible) throw new Error(`Exact-picker returned an explicit no-match despite an eligible fixture (${lastPickerProbe}).`);
    if (!exactVisible) throw new Error(`Exact-picker did not render its expected title (${lastPickerProbe}).`);
    console.log("PASS: exact-picker recommendation was visibly rendered.");
  } else {
  stage = "registering and signing in the second account";
  await register(guest, `guest_${suffix}`, true);
  stage = "joining the shared group from the second session";
  await guest.goto(invite);
  await guest.getByRole("button", { name: "Open invitation" }).click();
  await guest.getByRole("button", { name: "Join group" }).click();
  await guest.getByRole("heading", { name: groupName }).waitFor();
  for (const [sessionName, page, own, other] of [["owner", owner, `owner_${suffix}`, `guest_${suffix}`], ["guest", guest, `guest_${suffix}`, `owner_${suffix}`]]) {
    stage = `checking group membership in ${sessionName} session`;
    await page.goto(`${origin}/groups`);
    const members = page.locator("section").filter({ has: page.getByRole("heading", { name: `Members of E2E group ${suffix}`, exact: true }) });
    try {
      await members.getByRole("heading", { name: `Members of E2E group ${suffix}`, exact: true }).waitFor();
      await members.getByRole("listitem").filter({ hasText: `${own} · You` }).waitFor();
      await members.getByRole("listitem").filter({ hasText: other }).waitFor();
    } catch {
      stage = `checking group membership in ${sessionName} session (group API diagnostics)`;
      const summary = await groupApiSummary(page);
      throw new Error(`Group member heading or list was missing: ${JSON.stringify(summary)}`);
    }
  }
  stage = "adding a title as the second account";
  const title = `Guest Compose E2E film ${suffix}`;
  await guest.goto(`${origin}/add`);
  await addTitle(guest, title);
  const ownerName = `owner_${suffix}`, guestName = `guest_${suffix}`;
  stage = "adding a different title as the owner";
  const ownerTitle = `Owner Compose E2E film ${suffix}`;
  await addTitle(owner, ownerTitle);
  for (const [page, ownTitle, otherTitle] of [[owner, ownerTitle, title], [guest, title, ownerTitle]]) {
    stage = page === owner ? "checking the owner's title attribution" : "checking the guest's title attribution";
    await assertWatchlistEntry(page, ownTitle, [page === owner ? ownerName : guestName], ["You"]);
    stage = page === owner ? "checking the guest title attribution in the owner's watchlist" : "checking the owner title attribution in the guest's watchlist";
    await assertWatchlistEntry(page, otherTitle, [page === owner ? guestName : ownerName], [page === owner ? guestName : ownerName]);
  }
  stage = "adding the same linked title as the owner";
  const sharedTitle = `Shared linked Compose E2E video ${suffix}`;
  await addTitle(owner, sharedTitle, { youtube: true });
  stage = "adding the same linked title from the guest account";
  await addTitle(guest, sharedTitle, { youtube: true, confirmDuplicate: true });
  stage = "checking one shared entry and both contributors in both sessions";
  await assertWatchlistEntry(owner, sharedTitle, [ownerName, guestName], ["You", guestName]);
  await assertWatchlistEntry(guest, sharedTitle, [ownerName, guestName], [ownerName, "You"]);

  stage = "adding a shared movie for personal-history checks";
  const movieTitle = `Personal history Compose E2E movie ${suffix}`;
  await addTitle(owner, movieTitle);
  const moviePath = new URL(owner.url()).pathname;
  if (!/^\/title\/[a-f0-9-]+$/.test(moviePath)) throw new Error("Could not locate the saved movie details.");

  async function savePersonalHistory(page, memberName, timestamp, rating, note) {
    await page.goto(`${origin}${moviePath}`);
    await page.getByRole("heading", { name: movieTitle, exact: true }).waitFor();
    const history = page.locator("section").filter({ has: page.getByRole("heading", { name: "Your progress", exact: true }) });
    // Rating saves immediately and reloads the title; set it before entering
    // unsaved text so the form refresh cannot clear the draft progress.
    await history.getByRole("radio", { name: String(rating), exact: true }).click();
    await page.getByText("Saved", { exact: true }).waitFor();
    if (await history.getByRole("radio", { name: String(rating), exact: true }).getAttribute("aria-checked") !== "true") throw new Error(`${memberName}'s rating was not selected.`);
    await history.getByLabel("Stopped at (H:MM:SS)").fill(timestamp);
    await history.getByLabel(/Your note/).fill(note);
    // Wait for the previous auto-save indicator to clear so this wait confirms
    // the explicit Save request, not the earlier rating request.
    await page.getByText("Saved", { exact: true }).waitFor({ state: "hidden" });
    await history.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Saved", { exact: true }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: movieTitle, exact: true }).waitFor();
    if (await history.getByLabel("Stopped at (H:MM:SS)").inputValue() !== timestamp) throw new Error(`${memberName}'s saved progress did not persist after reload.`);
    if (await history.getByRole("radio", { name: String(rating), exact: true }).getAttribute("aria-checked") !== "true") throw new Error(`${memberName}'s saved rating did not persist after reload.`);
    if (await history.getByLabel(/Your note/).inputValue() !== note) throw new Error(`${memberName}'s saved note did not persist after reload.`);
  }

  stage = "saving the owner's personal movie history";
  const ownerNote = `Owner private-context note ${suffix}`;
  await savePersonalHistory(owner, ownerName, "0:12:34", 4, ownerNote);
  stage = "saving the guest's personal movie history";
  const guestNote = `Guest personal-context note ${suffix}`;
  await savePersonalHistory(guest, guestName, "0:23:45", 8, guestNote);

  stage = "checking group-visible notes and private progress for the owner";
  await owner.goto(`${origin}${moviePath}`);
  const ownerHistory = owner.locator("section").filter({ has: owner.getByRole("heading", { name: "Your progress", exact: true }) });
  if (await ownerHistory.getByLabel("Stopped at (H:MM:SS)").inputValue() !== "0:12:34") throw new Error("The guest's progress replaced the owner's personal progress.");
  const ownerGroup = owner.locator("section").filter({ has: owner.getByRole("heading", { name: "From the group", exact: true }) });
  await ownerGroup.getByText(guestName, { exact: false }).waitFor();
  await ownerGroup.getByText("★ 8/10", { exact: true }).waitFor();
  await ownerGroup.getByText(guestNote, { exact: true }).waitFor();
  if (await owner.locator("body").innerText().then(text => text.includes("0:23:45"))) throw new Error("The guest's private progress appeared in the owner's view.");

  stage = "checking group-visible notes and private progress for the guest";
  await guest.goto(`${origin}${moviePath}`);
  const guestHistory = guest.locator("section").filter({ has: guest.getByRole("heading", { name: "Your progress", exact: true }) });
  if (await guestHistory.getByLabel("Stopped at (H:MM:SS)").inputValue() !== "0:23:45") throw new Error("The owner's progress replaced the guest's personal progress.");
  const guestGroup = guest.locator("section").filter({ has: guest.getByRole("heading", { name: "From the group", exact: true }) });
  await guestGroup.getByText(ownerName, { exact: false }).waitFor();
  await guestGroup.getByText("★ 4/10", { exact: true }).waitFor();
  await guestGroup.getByText(ownerNote, { exact: true }).waitFor();
  if (await guest.locator("body").innerText().then(text => text.includes("0:12:34"))) throw new Error("The owner's private progress appeared in the guest's view.");

  stage = "adding exact-match and competing picker movie fixtures";
  const exactTitle = `Picker exact Funny ${suffix}`;
  const exactUrl = await addTitle(owner, exactTitle, { minutes: 18, mood: "Funny" });
  await saveProgress(owner, exactUrl, "0:16:00");
  const overBudgetTitle = `Picker exact-mode over-budget Funny ${suffix}`;
  await addTitle(owner, overBudgetTitle, { minutes: 21, mood: "Funny" });
  const differentMoodTitle = `Picker in-budget Relaxing ${suffix}`;
  await addTitle(owner, differentMoodTitle, { minutes: 20, mood: "Relaxing" });
  const fallbackTitle = `Picker boundary Exciting ${suffix}`;
  await addTitle(owner, fallbackTitle, { minutes: 25, mood: "Exciting" });
  const tooLongTitle = `Picker beyond-boundary Exciting ${suffix}`;
  await addTitle(owner, tooLongTitle, { minutes: 26, mood: "Exciting" });

  stage = "checking exact mood and time match takes priority";
  const exactResult = await pick(owner, { viewers: ["You", guestName], minutes: 20, mood: "Funny", scenario: "exact match" });
  if (await exactResult.getByRole("heading", { name: exactTitle, exact: true }).count() !== 1) {
    throw new Error(`Picker returned an unexpected exact-tier result: ${(await exactResult.innerText()).slice(0, 240)}`);
  }
  stage = "checking exact-match movie runtime summary";
  const runtimeSummary = exactResult.getByText(/Movie · 18 min · Next:/);
  try { await runtimeSummary.waitFor({ state: "visible" }); }
  catch { throw new Error(`The exact-match movie runtime summary was not visible (matching elements=${await runtimeSummary.count().catch(() => 0)}).`); }
  stage = "checking exact-match explanation";
  const exactExplanation = exactResult.getByText("Matches your mood and fits your available time.", { exact: true });
  try { await exactExplanation.waitFor({ state: "visible" }); }
  catch { throw new Error(`The exact-match explanation was not visible (matching elements=${await exactExplanation.count().catch(() => 0)}).`); }
  if (await exactResult.getByText(overBudgetTitle, { exact: true }).count()) throw new Error("An over-budget title was suggested while an exact match existed.");

  stage = "checking the inclusive five-minute over-budget fallback";
  const overResult = await pick(owner, { viewers: ["You", guestName], minutes: 20, mood: "Exciting", scenario: "over-budget fallback" });
  if (await overResult.getByRole("heading", { name: fallbackTitle, exact: true }).count() !== 1) {
    throw new Error(`Picker returned an unexpected over-budget-tier result: ${(await overResult.innerText()).slice(0, 240)}`);
  }
  await overResult.getByText("Movie · 25 min", { exact: true }).waitFor();
  await overResult.getByText("5 minutes longer than your available time.", { exact: true }).waitFor();
  if (await overResult.getByText(tooLongTitle, { exact: true }).count()) throw new Error("A title more than five minutes over budget was suggested.");

  stage = "checking disclosed different-mood fallback";
  stage = "adding episodic and long-progress movie fixtures";
  const animeTitle = `Picker typical episode Anime ${suffix}`;
  const animeUrl = await addTitle(owner, animeTitle, { kind: "Anime", minutes: 42, mood: "Dark" });
  await saveProgress(owner, animeUrl, "E5");
  const longMovieTitle = `Picker movie full runtime ${suffix}`;
  const longMovieUrl = await addTitle(owner, longMovieTitle, { minutes: 25, mood: "Emotional" });
  await saveProgress(owner, longMovieUrl, "0:23:00");

  const moodFallbackResult = await pick(owner, { viewers: ["You", guestName], minutes: 20, mood: "Dark", scenario: "different-mood fallback" });
  await moodFallbackResult.getByRole("heading", { name: differentMoodTitle, exact: true }).waitFor();
  await moodFallbackResult.getByText("Requested Dark; different mood: Relaxing. Within your available time.", { exact: true }).waitFor();

  stage = "checking full movie runtime despite saved progress";
  await pick(owner, { viewers: ["You"], minutes: 6, mood: "Emotional", scenario: "full movie duration exclusion" });
  await owner.getByText("No saved item matches these viewers and the permitted time/mood tiers. Keep your inputs or adjust them explicitly.", { exact: true }).waitFor();
  if (await owner.getByRole("heading", { name: longMovieTitle, exact: true }).count()) throw new Error("Movie progress was subtracted from its full runtime during picking.");

  stage = "checking one next episode and its typical runtime";
  const episodeResult = await pick(owner, { viewers: ["You"], minutes: 45, mood: "Dark", scenario: "typical episode match" });
  await episodeResult.getByRole("heading", { name: animeTitle, exact: true }).waitFor();
  await episodeResult.getByText("Anime · 42 min episode · Next: E5", { exact: true }).waitFor();

  stage = "checking no-match behavior without relaxing inputs";
  await pick(owner, { viewers: ["You", guestName], minutes: 1, mood: "Dark", scenario: "no-match boundary" });
  await owner.getByText("No saved item matches these viewers and the permitted time/mood tiers. Keep your inputs or adjust them explicitly.", { exact: true }).waitFor();
  if (await owner.getByText("Tonight's pick", { exact: true }).count()) throw new Error("The picker showed a suggestion when no permitted match existed.");

  console.log("PASS: two-way title sharing and contributor attribution, duplicate YouTube link consolidation, independent personal history, exact picker matches and exclusions, disclosed fallback tiers, movie and episode runtimes, and no-match behavior.");
  }
} catch (error) {
  failed = true;
  // Playwright errors can contain private invitation URLs or form values.
  // Report a bounded diagnostic after removing URLs; never dump page/log data.
  const detail = error instanceof Error
    ? error.message.split(/\r?\n/, 1)[0].replace(/https?:\/\/\S+/g, "[URL]").slice(0, 180)
    : "Unexpected error.";
  console.error(`FAIL: ${stage} (${error instanceof Error ? error.name : "Error"}): ${detail}`);
} finally {
  await browser?.close().catch(() => { failed = true; });
  if (started) {
    stage = "cleaning the isolated Compose project";
    const down = compose(["down", "--remove-orphans"], 120000, true);
    if (down.error || down.status !== 0) { failed = true; console.error("FAIL: could not stop the isolated Compose project."); }
    try {
      const volumes = dockerLines(["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
      for (const volume of volumes) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(volume)) throw new Error("Invalid volume name.");
        const labels = JSON.parse(docker(["volume", "inspect", volume, "--format", "{{json .Labels}}"] ).stdout);
        if (labels?.["com.docker.compose.project"] !== project) throw new Error("Volume is not owned by this test.");
        docker(["volume", "rm", volume]);
      }
      if (dockerLines(["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]).length) throw new Error("Owned volume cleanup incomplete.");
    } catch { failed = true; console.error("FAIL: could not remove the isolated test volume safely."); }
  }
  try {
    assertOwnedTemp();
    for (const file of [envFile, overrideFile]) if (existsSync(file)) unlinkSync(file);
    rmdirSync(temp);
  } catch { failed = true; console.error("FAIL: could not remove the owned temporary configuration."); }
}
if (failed) process.exitCode = 1;
else console.log("PASS: isolated Compose resources removed; existing containers and databases were not used.");
