import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createFixture, safeDiagnostic } from "../e2e/lifecycle.mjs";

// A real isolated production regression, not a mock-service or component test.
let fixture, failure, current = "setup";
const sourcePortCapture = process.env.WATCHNEXT_CAPTURE_75_EVIDENCE === "1";
const evidenceRelative = sourcePortCapture ? "_docs/evidence/source-page-port-75" : "_docs/evidence/together-tonight-73";
const evidenceDirectory = resolve(process.cwd(), evidenceRelative);
const retainEvidence = sourcePortCapture || process.env.WATCHNEXT_CAPTURE_73_EVIDENCE === "1";
const expectedEvidence = [
  "sign-in-1280", "watchlist-1280", "add-1280", "search-1280", "detail-1280", "picker-input-1280", "picker-result-1280",
  "sign-in-375", "watchlist-375", "add-375", "search-375", "detail-375", "picker-input-375", "picker-result-375",
];
const registrationEvidence = ["register-1280", "register-375"];
const recordedEvidence = [];
const check = (value, expected) => { if (!value) throw new Error(`Expected ${expected}; observed false`); };
const step = async (name, run) => { current = name; await run(); console.log(`PASS ${name}`); };
const field = (page, name) => page.getByLabel(name, { exact: true });
const press = (page, name) => page.getByRole("button", { name, exact: true }).press("Enter");
const box = async locator => { const value = await locator.boundingBox(); if (!value) throw new Error("Expected visible source-reference surface; observed no box"); return value; };
const ratio = async locator => { const value = await box(locator); return value.width / value.height; };

function pngGeometry(path) {
  const bytes = readFileSync(path);
  const signature = "89504e470d0a1a0a";
  check(bytes.length >= 24 && bytes.subarray(0, 8).toString("hex") === signature, `${path} is a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function verifyCommittedEvidence(directory = evidenceDirectory, names = expectedEvidence) {
  for (const name of names) {
    const path = join(directory, `${name}.png`);
    check(existsSync(path), `committed visual evidence ${name} exists`);
    const image = pngGeometry(path);
    const expectedWidth = name.endsWith("-1280") ? 1280 : 375;
    check(image.width === expectedWidth && image.height >= 600, `committed ${name} has the expected ${expectedWidth}px viewport geometry; observed ${image.width}×${image.height}`);
  }
}

async function createAccountGroup(page, username, password, group) {
  current = "register real account";
  await page.goto(fixture.origin + "/register");
  await field(page, "Username").fill(username); await field(page, "Password").fill(password); await field(page, "Confirm password").fill(password);
  await press(page, "Create account");
  const recovery = field(page, "Private recovery code"); await recovery.waitFor(); fixture.secrets.push(await recovery.inputValue());
  current = "create real account group";
  await page.getByRole("link", { name: /Continue/ }).press("Enter"); await page.waitForURL("**/account");
  await field(page, "New group name").fill(group); await press(page, "Create account group"); await field(page, "Invite link").waitFor();
  await page.goto(fixture.origin + "/account");
  await page.getByRole("button", { name: `Open ${group}`, exact: true }).press("Enter"); await page.waitForURL("**/group");
  await page.getByRole("heading", { name: group, exact: true }).waitFor();
}

async function saveManualTitle(page, title, contentType = "movie") {
  current = "save real manual film";
  await page.goto(fixture.origin + "/watchlist/add");
  await field(page, "Title").fill(title);
  await field(page, "Content type").selectOption(contentType);
  if (contentType !== "movie") {
    await field(page, "Episode numbering").selectOption("season_episode");
  }
  await field(page, "Minutes").fill(contentType === "series" ? "42" : "25"); await field(page, "Funny").check(); await press(page, "Save title");
  await page.waitForURL("**/watchlist/add?saved=*", { timeout: 20_000 }).catch(async () => {
    throw new Error(`Manual save did not navigate for ${contentType}: ${(await page.locator(".form-feedback, .field-error").allTextContents()).join(" ")}`);
  });
  return new URL(page.url()).searchParams.get("saved");
}

async function saveYouTube(page) {
  current = "save real authorised YouTube entry";
  await page.goto(fixture.origin + "/watchlist/add");
  await field(page, "Title").fill("Reference wide video");
  await field(page, "Content type").selectOption("youtube");
  await field(page, "Minutes").fill("2");
  await field(page, "Funny").check(); await press(page, "Save title"); await page.waitForURL("**/watchlist/add?saved=*");
  return new URL(page.url()).searchParams.get("saved");
}

async function showSearchControls(page) {
  current = "show real add search controls";
  await page.goto(fixture.origin + "/watchlist/add");
  await field(page, "Entry method").selectOption("kinopoisk_unofficial");
  await field(page, "Title to search").fill("source composition");
  await press(page, "Search titles");
  const results = page.getByRole("region", { name: "Search results", exact: true });
  await results.waitFor();
  await results.getByRole("button", { name: "Review Synthetic ambiguous film (2001)", exact: true }).waitFor();
  await results.getByRole("button", { name: "YouTube", exact: true }).click();
  await results.getByRole("button", { name: "Review Synthetic YouTube proposal", exact: true }).waitFor();
  await results.getByRole("button", { name: "Movies & shows", exact: true }).click();
  await results.getByRole("button", { name: "Review Synthetic ambiguous film (2001)", exact: true }).waitFor();
  check(await page.locator(".form-fields").count() >= 1, "the real source-style search and manual-entry surface");
}

async function captureComposition(page, name) {
  const path = retainEvidence ? join(evidenceDirectory, `${name}.png`) : join(fixture.root, `${name}.png`);
  if (retainEvidence) mkdirSync(evidenceDirectory, { recursive: true });
  await page.screenshot({ path, fullPage: true, animations: "disabled", caret: "hide" });
  check(existsSync(path), `a real ${name} screenshot capture`);
  const image = pngGeometry(path);
  const viewport = page.viewportSize();
  check(image.width === viewport?.width && image.height >= (viewport?.height ?? 0), `${name} capture preserves its viewport geometry; observed ${image.width}×${image.height}`);
  if (retainEvidence) recordedEvidence.push(name);
}

async function boundedSurface(page, selector, label, maximum = 800) {
  const surface = await box(page.locator(selector));
  check(surface.width <= maximum, `${label} is a bounded source-style working surface; observed ${Math.round(surface.width)}px`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} has no horizontal clipping`);
}

// #75: the ready Together Tonight Add page has two independent cards/forms.
// Earlier adaptations kept one old details form with lookup controls inside it.
async function sourceAddComposition(page, width) {
  const pageBody = page.locator(".page-content");
  const forms = pageBody.locator("form");
  const count = await forms.count();
  check(count >= 2, `the ${width}px Add screen has separate search and manual-entry forms; observed ${count}`);
  const search = forms.first(), manual = forms.last();
  check(await search.getByRole("textbox", { name: /search title|paste youtube/i }).count() === 1,
    `the ${width}px search card contains a search/link field`);
  check(await search.getByRole("button", { name: /search/i }).count() === 1,
    `the ${width}px search card has its own Search action`);
  const types = manual.locator("button[aria-pressed]");
  check(await types.count() === 4, `the ${width}px manual card has four selectable content-type tiles`);
  for (const label of ["Movie", "Series", "Anime", "YouTube video"]) {
    check(await types.filter({ hasText: label }).count() === 1, `the ${width}px ${label} tile is visible`);
  }
  check(await pageBody.evaluate(node => document.documentElement.scrollWidth <= innerWidth),
    `the ${width}px Add composition does not clip horizontally`);
}

async function gridMetrics(page, expectedColumns, width) {
  return page.locator(".watchlist-items").evaluate((node, { expectedColumns, width }) => {
    const cards = [...node.querySelectorAll(":scope > li")].map(item => item.getBoundingClientRect());
    const rounded = values => [...new Set(values.map(value => Math.round(value)))];
    const columns = rounded(cards.map(card => card.x));
    const rows = rounded(cards.map(card => card.y));
    const grid = node.getBoundingClientRect();
    const first = cards[0];
    const cover = node.querySelector(".watchlist-card .title-cover:not(.video-cover)")?.getBoundingClientRect();
    return {
      cardCount: cards.length,
      columnCount: columns.length,
      rowCount: rows.length,
      gridWidth: grid.width,
      firstCardWidth: first?.width ?? 0,
      firstCoverWidth: cover?.width ?? 0,
      firstCoverHeight: cover?.height ?? 0,
      expectedColumns,
      width,
    };
  }, { expectedColumns, width });
}

async function desktop(page, film, video) {
  await page.goto(fixture.origin + "/"); const card = page.locator(".auth-card"); await card.waitFor();
  const auth = await box(card), viewport = page.viewportSize(); check(Math.abs(auth.x + auth.width / 2 - viewport.width / 2) < 4, "a centred Together Tonight-style account card at 1280px");
  check(await page.locator(".site-header").isVisible() === false, "no application header on account entry");
  await captureComposition(page, "sign-in-1280");
  if (sourcePortCapture) { await page.goto(fixture.origin + "/register"); await page.locator(".auth-card").waitFor(); await captureComposition(page, "register-1280"); }
  await page.goto(fixture.origin + "/watchlist"); await page.getByRole("heading", { name: "Visual regression group", exact: true }).waitFor();
  const account = page.getByRole("link", { name: "Account and sign out", exact: true });
  await account.waitFor();
  const activeMember = fixture.db.prepare("SELECT m.name,m.avatar_color FROM members m JOIN account_memberships a ON a.member_id=m.id AND a.group_id=m.group_id JOIN groups g ON g.id=m.group_id WHERE g.name=? AND a.status='active'").get("Visual regression group");
  check(Boolean(activeMember), "the active account member exists in the isolated SQLite schema");
  check(await account.getAttribute("href") === "/account" && await account.getAttribute("title") === activeMember.name, "the header avatar links to the real active account");
  const expectedColor = await page.evaluate(color => { const probe = document.createElement("span"); probe.style.backgroundColor = color; return probe.style.backgroundColor; }, activeMember.avatar_color);
  check(await account.locator(".avatar").textContent() === "V" && await account.locator(".avatar").evaluate(node => node.style.backgroundColor) === expectedColor, "the header renders the persisted member initial and avatar_color");
  await page.getByRole("link", { name: "Add title", exact: true }).waitFor(); await page.getByRole("navigation", { name: "Watchlist filter" }).waitFor();
  await page.getByLabel("Content type filter").getByRole("button", { name: "Movies" }).waitFor();
  check(await page.locator(".watchlist-items").evaluate(node => getComputedStyle(node).display === "grid"), "a real shared watchlist card grid");
  const grid = await gridMetrics(page, 5, 1280);
  await captureComposition(page, "watchlist-1280");
  check(grid.cardCount >= 6, "six real persisted titles for a full source-style desktop grid");
  check(grid.columnCount === 5 && grid.rowCount >= 2, `a five-column desktop grid; observed ${grid.columnCount} columns and ${grid.rowCount} rows`);
  check(grid.gridWidth >= 1_090 && grid.firstCardWidth >= 200 && grid.firstCardWidth <= 230, `a wide centred source-style grid with compact cards; observed ${Math.round(grid.gridWidth)}px grid and ${Math.round(grid.firstCardWidth)}px cards`);
  check(grid.firstCoverHeight > grid.firstCoverWidth * 1.35 && grid.firstCoverHeight < grid.firstCoverWidth * 1.6, `portrait 2:3 covers on desktop cards; observed ${Math.round(grid.firstCoverWidth)}×${Math.round(grid.firstCoverHeight)}`);
  const firstCard = page.locator(".watchlist-card").first();
  check(await firstCard.getByText(/(Not started|Next:|Watched)/).count() > 0, "a visible progress state on each source-style card");
  check(await firstCard.locator(".contributor-list .avatar").count() > 0, "a visible contributor avatar below each source-style card");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no desktop horizontal clipping");
  await page.goto(fixture.origin + "/watchlist/add");
  await page.locator(".form-fields").first().waitFor(); await boundedSurface(page, ".page-content", "desktop add form"); await sourceAddComposition(page, 1280); await captureComposition(page, "add-1280");
  await showSearchControls(page);
  await boundedSurface(page, ".page-content", "desktop search results", 1152); await captureComposition(page, "search-1280");
  await page.goto(fixture.origin + `/watchlist/${film}`); const portrait = page.locator(".detail-metadata > .title-cover"); await portrait.waitFor(); const poster = await ratio(portrait); check(poster > .62 && poster < .71, "portrait film detail cover geometry (2:3)"); await captureComposition(page, "detail-1280");
  await page.goto(fixture.origin + `/watchlist/${video}`); const preview = page.locator(".detail-metadata > .video-cover"); await preview.waitFor(); const wide = await ratio(preview); check(wide > 1.7 && wide < 1.84, "16:9 YouTube detail preview geometry");
  await page.goto(fixture.origin + "/pick"); await page.getByRole("heading", { name: "Pick for me", exact: true }).waitFor(); await boundedSurface(page, ".picker-page", "desktop picker form"); await captureComposition(page, "picker-input-1280"); await page.locator(".picker-viewers input[type=checkbox]").first().check(); await field(page, "Available time (whole minutes)").fill("25"); await field(page, "Mood").selectOption("funny"); await press(page, "Pick for me"); await page.getByText("Your suggestion is ready.", { exact: true }).waitFor(); await page.locator(".picker-page > .group-result").waitFor(); await captureComposition(page, "picker-result-1280");
}

async function mobile(page, film, video) {
  await page.setViewportSize({ width: 375, height: 900 }); await page.goto(fixture.origin + "/watchlist");
  const add = page.getByRole("link", { name: "Add title", exact: true }); await add.scrollIntoViewIfNeeded(); const action = await box(add); check(action.y + action.height <= 900, "a visible mobile primary Add action");
  const bottom = page.getByRole("navigation", { name: "Main navigation mobile" }); await bottom.waitFor(); for (const name of ["Watchlist", "Add", "Pick for me"]) check(await bottom.getByRole("link", { name, exact: true }).isVisible(), `the mobile ${name} action`);
  const grid = await gridMetrics(page, 2, 375);
  await captureComposition(page, "watchlist-375");
  check(grid.cardCount >= 6, "six real persisted titles for a two-column mobile grid");
  check(grid.columnCount === 2 && grid.firstCardWidth >= 150 && grid.firstCardWidth <= 180, `a readable two-column mobile grid; observed ${grid.columnCount} columns and ${Math.round(grid.firstCardWidth)}px cards`);
  check(grid.firstCoverHeight > grid.firstCoverWidth * 1.35 && grid.firstCoverHeight < grid.firstCoverWidth * 1.6, `portrait 2:3 covers on mobile cards; observed ${Math.round(grid.firstCoverWidth)}×${Math.round(grid.firstCoverHeight)}`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no mobile horizontal clipping");
  const more = page.locator("summary[aria-label='More workspace options']:visible"); await more.waitFor(); await more.click(); const utilities = page.getByRole("navigation", { name: "Workspace utilities", exact: true }); await utilities.waitFor(); for (const name of ["Group", "Archive", "Account"]) check(await utilities.getByRole("link", { name, exact: true }).isVisible(), `a reachable compact mobile ${name} utility`);
  // Pre-fix current main intentionally fails here: it retains a separate old
  // Group/Archive/Account strip above the source-style primary bottom nav.
  check(await page.getByRole("navigation", { name: "Other destinations" }).isVisible() === false, "the reference-style mobile shell has no extra legacy utility strip above its Watchlist/Add/Pick for me bottom navigation");
  await page.goto(fixture.origin + "/"); await page.locator(".auth-card").waitFor(); await captureComposition(page, "sign-in-375");
  if (sourcePortCapture) { await page.goto(fixture.origin + "/register"); await page.locator(".auth-card").waitFor(); await captureComposition(page, "register-375"); }
  await page.goto(fixture.origin + "/watchlist/add"); await page.locator(".form-fields").first().waitFor(); await boundedSurface(page, ".page-content", "mobile add form", 375); await sourceAddComposition(page, 375); await captureComposition(page, "add-375");
  await showSearchControls(page); await boundedSurface(page, ".page-content", "mobile search results", 375); await captureComposition(page, "search-375");
  await page.goto(fixture.origin + `/watchlist/${film}`); const portrait = page.locator(".detail-metadata > .title-cover"); await portrait.waitFor(); check(await ratio(portrait) > .62, "stacked portrait film detail at 375px"); await captureComposition(page, "detail-375");
  await page.goto(fixture.origin + `/watchlist/${video}`); const preview = page.locator(".detail-metadata > .video-cover"); await preview.waitFor(); const wide = await ratio(preview); check(wide > 1.7 && wide < 1.84, "16:9 YouTube preview geometry at 375px");
  await page.goto(fixture.origin + "/pick"); await page.getByRole("heading", { name: "Pick for me", exact: true }).waitFor(); await boundedSurface(page, ".picker-page", "mobile picker form", 375); await captureComposition(page, "picker-input-375"); await page.locator(".picker-viewers input[type=checkbox]").first().check(); await field(page, "Available time (whole minutes)").fill("25"); await field(page, "Mood").selectOption("funny"); await press(page, "Pick for me"); await page.getByText("Your suggestion is ready.", { exact: true }).waitFor(); await page.locator(".picker-page > .group-result").waitFor(); await captureComposition(page, "picker-result-375");
}

try {
  fixture = await createFixture(); await step("current production build and isolated real server", async () => { await fixture.build(); await fixture.launch(); await fixture.start(); });
  const context = await fixture.context(1280), page = await context.newPage(), password = randomBytes(24).toString("base64url"); fixture.secrets.push(password);
  await step("real account, group and authorised SQLite titles", async () => {
    await createAccountGroup(page, "VisualRegressionUser", password, "Visual regression group");
    const film = await saveManualTitle(page, "Reference portrait film");
    const extraTitles = [];
    for (const [title, type] of [["Reference film two", "movie"], ["Reference film three", "movie"], ["Reference series one", "series"], ["Reference series two", "series"]]) {
      extraTitles.push(await saveManualTitle(page, title, type));
    }
    const video = await saveYouTube(page);
    check(Boolean(film) && Boolean(video) && film !== video && extraTitles.every(Boolean), "six distinct persisted authorised titles"); globalThis.ids = { film, video };
  });
  await step("1280px source-derived account/list/detail/picker composition", () => desktop(page, globalThis.ids.film, globalThis.ids.video));
  await step("375px source-derived compact shell and real preview geometry", () => mobile(page, globalThis.ids.film, globalThis.ids.video));
  if (retainEvidence) {
    const capturedNames = sourcePortCapture ? [...expectedEvidence, ...registrationEvidence] : expectedEvidence;
    check(recordedEvidence.length === capturedNames.length && capturedNames.every(name => recordedEvidence.includes(name)), "every required durable source-comparison screen was captured");
    verifyCommittedEvidence(evidenceDirectory, capturedNames);
  } else {
    verifyCommittedEvidence();
    verifyCommittedEvidence(resolve(process.cwd(), "_docs/evidence/source-page-port-75"), registrationEvidence);
  }
  await context.close(); await fixture.audit();
} catch (error) { failure = error; }
finally { try { await fixture?.cleanup(); } catch (error) { failure ??= error; } }
if (failure) { console.error(`FAIL ${current}: ${safeDiagnostic(failure, fixture?.secrets ?? [], fixture?.root ?? "<none>", fixture ? [fixture.sentinelRoot] : [])}`); console.error(`Owned cleanup complete: ${fixture?.cleanupComplete ?? false}; ${retainEvidence ? "only the explicitly requested synthetic evidence captures were retained." : "no screenshots, traces, HAR or video retained."}`); process.exitCode = 1; }
else console.log(JSON.stringify({ pass: true, widths: [1280, 375], realAuthorisedData: true, sourceReferenceShell: true, committedEvidence: retainEvidence, evidenceDirectory: retainEvidence ? evidenceRelative : undefined, ownedCleanup: fixture.cleanupComplete }));
