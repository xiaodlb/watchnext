import { randomBytes } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createFixture, safeDiagnostic } from "../e2e/lifecycle.mjs";

// A real isolated production regression, not a mock-service or component test.
let fixture, failure, current = "setup";
const check = (value, expected) => { if (!value) throw new Error(`Expected ${expected}; observed false`); };
const step = async (name, run) => { current = name; await run(); console.log(`PASS ${name}`); };
const field = (page, name) => page.getByLabel(name, { exact: true });
const press = (page, name) => page.getByRole("button", { name, exact: true }).press("Enter");
const box = async locator => { const value = await locator.boundingBox(); if (!value) throw new Error("Expected visible source-reference surface; observed no box"); return value; };
const ratio = async locator => { const value = await box(locator); return value.width / value.height; };

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
  await field(page, "Title to search").waitFor();
  await page.getByRole("button", { name: "Search titles", exact: true }).waitFor();
  check(await page.locator(".form-fields").count() >= 1, "the real source-style search and manual-entry surface");
}

async function captureComposition(page, name) {
  const path = join(fixture.root, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  check(existsSync(path) && statSync(path).size > 10_000, `a real ${name} screenshot capture`);
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
  await page.goto(fixture.origin + "/watchlist"); await page.getByRole("heading", { name: "Visual regression group", exact: true }).waitFor();
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
  await showSearchControls(page);
  await page.goto(fixture.origin + `/watchlist/${film}`); const portrait = page.locator(".detail-metadata > .title-cover"); await portrait.waitFor(); const poster = await ratio(portrait); check(poster > .62 && poster < .71, "portrait film detail cover geometry (2:3)");
  await page.goto(fixture.origin + `/watchlist/${video}`); const preview = page.locator(".detail-metadata > .video-cover"); await preview.waitFor(); const wide = await ratio(preview); check(wide > 1.7 && wide < 1.84, "16:9 YouTube detail preview geometry");
  await page.goto(fixture.origin + "/pick"); await page.getByRole("heading", { name: "Pick for me", exact: true }).waitFor(); await page.locator(".picker-viewers input[type=checkbox]").first().check(); await field(page, "Available time (whole minutes)").fill("25"); await field(page, "Mood").selectOption("funny"); await press(page, "Pick for me"); await page.getByText("Your suggestion is ready.", { exact: true }).waitFor();
}

async function mobile(page, video) {
  await page.setViewportSize({ width: 375, height: 900 }); await page.goto(fixture.origin + "/watchlist");
  const add = page.getByRole("link", { name: "Add title", exact: true }); await add.scrollIntoViewIfNeeded(); const action = await box(add); check(action.y + action.height <= 900, "a visible mobile primary Add action");
  const bottom = page.getByRole("navigation", { name: "Main navigation mobile" }); await bottom.waitFor(); for (const name of ["Watchlist", "Add", "Pick for me"]) check(await bottom.getByRole("link", { name, exact: true }).isVisible(), `the mobile ${name} action`);
  const grid = await gridMetrics(page, 2, 375);
  await captureComposition(page, "watchlist-375");
  check(grid.cardCount >= 6, "six real persisted titles for a two-column mobile grid");
  check(grid.columnCount === 2 && grid.firstCardWidth >= 150 && grid.firstCardWidth <= 180, `a readable two-column mobile grid; observed ${grid.columnCount} columns and ${Math.round(grid.firstCardWidth)}px cards`);
  check(grid.firstCoverHeight > grid.firstCoverWidth * 1.35 && grid.firstCoverHeight < grid.firstCoverWidth * 1.6, `portrait 2:3 covers on mobile cards; observed ${Math.round(grid.firstCoverWidth)}×${Math.round(grid.firstCoverHeight)}`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no mobile horizontal clipping");
  await page.goto(fixture.origin + `/watchlist/${video}`); const preview = page.locator(".detail-metadata > .video-cover"); await preview.waitFor(); const wide = await ratio(preview); check(wide > 1.7 && wide < 1.84, "16:9 YouTube preview geometry at 375px");
  // Pre-fix current main intentionally fails here: it retains a separate old
  // Group/Archive/Account strip above the source-style primary bottom nav.
  check(await page.getByRole("navigation", { name: "Other destinations" }).isVisible() === false, "the reference-style mobile shell has no extra legacy utility strip above its Watchlist/Add/Pick for me bottom navigation");
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
  await step("375px source-derived compact shell and real preview geometry", () => mobile(page, globalThis.ids.video));
  await context.close(); await fixture.audit();
} catch (error) { failure = error; }
finally { try { await fixture?.cleanup(); } catch (error) { failure ??= error; } }
if (failure) { console.error(`FAIL ${current}: ${safeDiagnostic(failure, fixture?.secrets ?? [], fixture?.root ?? "<none>", fixture ? [fixture.sentinelRoot] : [])}`); console.error(`Owned cleanup complete: ${fixture?.cleanupComplete ?? false}; no screenshots, traces, HAR or video retained.`); process.exitCode = 1; }
else console.log(JSON.stringify({ pass: true, widths: [1280, 375], realAuthorisedData: true, sourceReferenceShell: true, ownedCleanup: fixture.cleanupComplete }));
