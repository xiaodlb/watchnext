/**
 * #61 connected browser journey over ONE fresh /mock service instance, through the real controls.
 * It reads stable IDs from visible text, never follows an external link, uses only the keyboard for the
 * key steps (sign-in submit, group select, Details, Add save, Pick for me) and checks focus lands on the
 * announced result. `capture(family, region, { keep })` is the runner's opt-in synthetic evidence hook (no-op by default);
 * it is never called while a recovery code or invite is on screen.
 */
export const integrationSegments = Object.freeze([
  "step 1 accounts", "step 2 groups", "step 3 library", "step 4 manual entry", "step 5 provider entry", "step 6 personal",
  "step 7 picker", "step 8 mine and archive", "step 9 removal and rejoin", "step 10 legacy", "step 11 stale and cancel", "step 12 reset",
]);
export async function mockIntegrationJourney({ page, origin, width, check, onAction = () => {}, capture = async () => {} }) {
  let segment = "setup";
  const act = name => onAction(`${segment}: ${name}`);
  const enter = (value) => { segment = value; check(integrationSegments.includes(value), `known segment ${value}`); act("start"); };
  const click = name => { act(name); return page.getByRole("button", { name, exact: true }).click(); };
  const field = name => page.getByLabel(name, { exact: true });
  const region = name => page.getByRole("region", { name, exact: true });
  const accounts = region("Synthetic accounts"), groups = region("Synthetic groups and legacy access"), entry = region("Add to the synthetic library");
  const library = region("Saved synthetic library"), picker = region("Pick for me"), personal = page.getByRole("region", { name: "Personal progress and feedback" });
  const history = personal.getByRole("list", { name: "Group-visible personal history" });
  const noOverflow = async label => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: ${label} without horizontal overflow`);
  /** Keyboard-only activation: focus the control, then press Enter. */
  const key = async (locator, name) => { act(`keyboard ${name}`); await locator.focus(); await page.keyboard.press("Enter"); };
  const focusedText = () => page.evaluate(() => document.activeElement?.textContent ?? "");
  const focusOn = async (text, label) => { await page.waitForFunction(text => (document.activeElement?.textContent ?? "").includes(text), text, { timeout: 5000 }).catch(() => {}); check((await focusedText()).includes(text), `${width}: focus lands on the announced ${label} (observed "${(await focusedText()).slice(0, 80)}")`); };
  const libraryReady = () => library.getByRole("status").filter({ hasText: "Synthetic library ready." }).waitFor();
  const all = async () => { await click("All saved titles"); await libraryReady(); };
  const titles = async () => (await library.getByRole("button", { name: /^Details: / }).allTextContents()).map(text => text.slice("Details: ".length));
  const stableId = async () => (await library.getByText(/^Stable title: /).textContent()).slice("Stable title: ".length);
  const detail = async (name, keyboard = false) => { const button = library.getByRole("button", { name: `Details: ${name}`, exact: true }); if (keyboard) await key(button, `Details: ${name}`); else { act(`Details: ${name}`); await button.click(); } await library.getByRole("heading", { name: `Title details: ${name}`, exact: true }).waitFor(); return stableId(); };
  const loadGroups = async () => { await click("Load groups"); await groups.getByRole("status").filter({ hasText: "Synthetic group context ready." }).waitFor(); };
  const selectGroup = async (name, keyboard = false) => { const button = page.getByRole("button", { name: `Select ${name}`, exact: true }); if (keyboard) await key(button, `Select ${name}`); else { act(`Select ${name}`); await button.click(); } await groups.getByRole("heading", { name: `Selected group: ${name}`, exact: true }).waitFor(); };
  const signin = async (user, keyboard = false) => {
    await click("Sign in"); await field("Username").fill(user); await field("Password").fill("synthetic password");
    if (keyboard) { act("keyboard sign-in submit"); await field("Password").press("Enter"); } else await click("Sign in to demo");
    await page.getByRole("heading", { name: `Account: ${user}`, exact: true }).waitFor();
  };
  const friday = async user => { await signin(user); await loadGroups(); await selectGroup("Synthetic Friday friends"); };
  const savedRecord = async title => { const status = entry.getByRole("status").filter({ hasText: `Saved entry: ${title} (record ` }); await status.waitFor(); return /\(record ([^)]+)\)/.exec(await status.textContent())[1]; };
  const loadPicker = async () => { await picker.getByRole("button", { name: "Load picker", exact: true }).click(); await picker.getByRole("group", { name: "Who’s watching?" }).waitFor(); };
  const viewerNames = async () => picker.getByRole("group", { name: "Who’s watching?" }).locator(".profile-name").allTextContents();
  const setPick = async (viewers, minutes, mood = "Funny") => {
    for (const box of await picker.getByRole("group", { name: "Who’s watching?" }).getByRole("checkbox").all()) { const name = await box.evaluate(node => node.parentElement.querySelector(".profile-name").textContent); if ((await box.isChecked()) !== viewers.includes(name)) await box.click(); }
    await picker.getByLabel("Available time (whole minutes)").fill(minutes); await picker.getByRole("radio", { name: mood, exact: true }).check();
  };
  const result = name => picker.getByRole("heading", { level: 3, name, exact: true }).waitFor();
  const refreshNotice = () => picker.getByText("List changed; picks refreshed.", { exact: true });
  const recordIds = async () => (await history.getByText(/^Record ID: /).allTextContents()).map(text => text.slice("Record ID: ".length));
  const historyItem = name => history.getByRole("listitem").filter({ hasText: name });

  enter("step 1 accounts");
  await page.goto(origin + "/mock"); await page.getByRole("heading", { name: "WatchNext preview", exact: true }).waitFor();
  await accounts.getByText("not security evidence", { exact: false }).waitFor();
  await click("Register"); await field("Username").fill(`Journey.User${width}`); await field("Password").fill("synthetic journey password"); await field("Confirm password").fill("synthetic journey password");
  await click("Create account"); await field("One-time synthetic recovery code").waitFor(); await click("Continue");
  await page.getByRole("heading", { name: `Account: Journey.User${width}`, exact: true }).waitFor(); check(await field("One-time synthetic recovery code").count() === 0, "reveal discarded before any capture");
  await click("Sign out"); await accounts.getByRole("status").filter({ hasText: "Signed out of the synthetic account." }).waitFor();
  await click("Sign in"); await field("Username").waitFor();
  // Evidence state: empty sign-in with visible keyboard focus on Username reached by Tab.
  await accounts.getByRole("button", { name: "Recover account", exact: true }).focus(); await page.keyboard.press("Tab");
  check(await page.evaluate(() => document.activeElement?.getAttribute("name") === "username"), "Tab reaches the username field");
  check(await field("Username").inputValue() === "" && await field("Password").inputValue() === "", "sign-in fields are empty for the evidence state");
  await capture("sign-in", accounts);
  await signin("Demo.Owner", true); await focusOn("Synthetic account context ready.", "sign-in result");

  enter("step 2 groups");
  await loadGroups(); await selectGroup("Synthetic Friday friends", true); await focusOn("Synthetic group context ready.", "group selection");
  await field("New group name").fill("Journey group"); await click("Create account group"); await field("Private synthetic invite").waitFor(); await click("Continue to groups");
  await groups.getByRole("heading", { name: "Selected group: Journey group", exact: true }).waitFor(); check(await field("Private synthetic invite").count() === 0, "group invite discarded");
  await click("Load library"); await libraryReady(); await library.getByText("No active saved titles in this group.", { exact: true }).waitFor();
  await selectGroup("Synthetic Friday friends");

  enter("step 3 library");
  await click("Load library"); await libraryReady();
  const seeds = { "Together Tonight": "joint-movie", "Short Laughs": "saved-series", "Paper Stars": "saved-anime", "A Small Good Idea": "saved-video" };
  check(JSON.stringify((await titles()).slice(0, 4)) === JSON.stringify(Object.keys(seeds)), "seeded All order");
  await library.getByRole("article").filter({ hasText: "Together Tonight" }).getByRole("list", { name: "All contributors" }).getByText("Demo.Viewer", { exact: true }).waitFor();
  await capture("library", library);
  for (const [name, id] of Object.entries(seeds)) { check(await detail(name, name === "Together Tonight") === id, `seed ${name} keeps ${id}`); if (name === "Together Tonight") await focusOn("Synthetic library ready.", "Details result"); await click("Back to titles"); await libraryReady(); }
  await click("My contributions"); await libraryReady(); check(JSON.stringify(await titles()) === JSON.stringify(["Together Tonight", "A Small Good Idea"]), "owner Mine");

  enter("step 4 manual entry");
  await click("Start fresh manual draft"); await entry.getByLabel("Entry title", { exact: true }).fill("Journey Laugh"); await entry.getByLabel("Entry type").selectOption("movie");
  await entry.getByLabel("Entry minutes", { exact: true }).fill("15"); await entry.getByLabel("Entry seconds", { exact: true }).fill("0"); await entry.getByRole("checkbox", { name: "funny", exact: true }).check();
  await key(entry.getByRole("button", { name: "Save entry", exact: true }), "Save entry"); const X = await savedRecord("Journey Laugh");
  await focusOn("Saved to the actual synthetic library.", "Add save result");
  await all(); check((await titles()).includes("Journey Laugh"), "X in All"); await click("My contributions"); await libraryReady(); check((await titles()).includes("Journey Laugh"), "X in Mine");
  check(await detail("Journey Laugh") === X, "X detail keeps the save ID");

  enter("step 5 provider entry");
  const provider = async () => {
    await click("Start fresh manual draft"); await entry.getByLabel("Synthetic lookup query", { exact: true }).fill("journey lessons"); await click("Search or resolve fixture");
    await click("Choose Synthetic video 1"); await entry.getByRole("status").filter({ hasText: "Synthetic detail filled automatically" }).waitFor();
    await entry.getByRole("checkbox", { name: "relaxing", exact: true }).check();
  };
  await provider(); await capture("add", entry);
  await click("Save entry"); const Y = await savedRecord("Synthetic video 1"); check(Y !== X, "Y is a new title");
  await friday("Demo.Viewer"); await provider(); await click("Save entry"); check(await savedRecord("Synthetic video 1") === Y, "second adder converges on the same Y");
  await click("Load library"); await libraryReady(); check((await titles()).filter(name => name === "Synthetic video 1").length === 1, "one shared card for Y");
  check(await detail("Synthetic video 1") === Y, "Y detail");
  const adders = await library.getByRole("list", { name: "All contributors" }).locator("li").allTextContents(); check(JSON.stringify(adders) === JSON.stringify(["Demo.Owner", "Demo.Viewer"]), "Y has two adders");

  enter("step 6 personal");
  await field("Stopped at").fill("3:00"); await click("Save timestamp"); await personal.getByText("Saved timestamp: 3:00. Completion: Not finished.", { exact: true }).waitFor();
  await field("Rating (1–10)").fill("7"); await click("Save rating"); await personal.getByText("Your saved rating: 7/10.", { exact: true }).waitFor();
  await field("Your note text").fill("Journey note"); await click("Save note"); await personal.getByText("Your whole-title note is saved.").first().waitFor();
  const yRecord = `personal-${Y}-friday-viewer`; await historyItem("Demo.Viewer (You)").getByText(`Record ID: ${yRecord}`, { exact: true }).waitFor();
  await capture("detail", personal, { keep: "bottom" });

  enter("step 7 picker");
  await loadPicker(); check(JSON.stringify(await viewerNames()) === JSON.stringify(["Demo.Owner", "Demo.Viewer"]), "both active members are viewers");
  await setPick(["Demo.Viewer"], "90"); await picker.getByRole("button", { name: "Pick for me", exact: true }).click(); await result("Together Tonight"); await picker.getByText("Exact match", { exact: true }).waitFor();
  await capture("pick", picker);
  await setPick(["Demo.Viewer"], "15"); await key(picker.getByRole("button", { name: "Pick for me", exact: true }), "Pick for me"); await result("A Small Good Idea");
  await focusOn("Your suggestion is ready.", "pick result");
  await all(); await detail("Journey Laugh"); await field("Rating (1–10)").fill("6"); await click("Save rating"); await personal.getByText("Your saved rating: 6/10.", { exact: true }).waitFor();
  await picker.getByRole("button", { name: "Pick again", exact: true }).click(); await result("Journey Laugh"); check(await refreshNotice().count() === 0, "a rating never refreshes picks");
  await picker.getByRole("button", { name: "View details", exact: true }).click(); await library.getByRole("heading", { name: "Title details: Journey Laugh", exact: true }).waitFor();
  check(await stableId() === X, "View details opens Stable title X"); check(new URL(page.url()).pathname === "/mock", "details stay inside /mock");
  await click("Back to titles"); await libraryReady(); await detail("A Small Good Idea"); await field("Stopped at").fill("1:00"); await click("Save timestamp"); await personal.getByText("Saved timestamp: 1:00. Completion: Not finished.", { exact: true }).waitFor();
  await picker.getByRole("button", { name: "Pick again", exact: true }).click(); await refreshNotice().waitFor(); await result("A Small Good Idea");

  enter("step 8 mine and archive");
  await friday("Demo.Owner"); await all(); await detail("Journey Laugh"); await field("Rating (1–10)").fill("9"); await click("Save rating"); await personal.getByText("Your saved rating: 9/10.", { exact: true }).waitFor();
  const xRecord = `personal-${X}-friday-owner`; await historyItem("Demo.Owner (You)").getByText(`Record ID: ${xRecord}`, { exact: true }).waitFor();
  await click("Remove my contribution"); await click("Confirm own removal"); await library.getByText("Archived title: metadata is read-only until explicitly restored.", { exact: true }).waitFor();
  await all(); check(!(await titles()).includes("Journey Laugh"), "archived X leaves All"); await click("My contributions"); await libraryReady(); check(!(await titles()).includes("Journey Laugh"), "archived X leaves Mine");
  await click("Open archive"); await libraryReady(); await library.getByRole("heading", { name: "Archived titles", exact: true }).waitFor(); check((await titles()).includes("Journey Laugh"), "X appears in the archive");
  await loadPicker(); await setPick(["Demo.Viewer"], "15"); await picker.getByRole("button", { name: "Pick for me", exact: true }).click(); await result("A Small Good Idea");
  await picker.getByRole("button", { name: "Pick again", exact: true }).click(); await result("All matches shown"); check(await picker.getByRole("heading", { name: "Journey Laugh" }).count() === 0, "archived X is not picked");
  await detail("Journey Laugh"); await click("Restore title"); await click("Confirm restore"); await library.getByRole("button", { name: "Remove my contribution", exact: true }).waitFor();
  check(await stableId() === X, "restore keeps X"); await personal.getByText("Your saved rating: 9/10.", { exact: true }).waitFor(); await historyItem("Demo.Owner (You)").getByText(`Record ID: ${xRecord}`, { exact: true }).waitFor();
  await click("My contributions"); await libraryReady(); check((await titles()).includes("Journey Laugh"), "restored X is back in Mine");

  enter("step 9 removal and rejoin");
  await loadGroups(); await click("Remove Demo.Viewer"); await click("Confirm removal"); await groups.getByText("Inactive", { exact: false }).waitFor();
  check(await field("Private synthetic invite").count() === 0, "no invite on screen for the groups capture");
  await capture("groups", groups);
  await click("Rotate synthetic invite"); await click("Confirm rotation"); await field("Private synthetic invite").waitFor(); const invite = await field("Private synthetic invite").inputValue(); await click("Continue to groups");
  await groups.getByText("Invitation generation: 2", { exact: true }).waitFor();
  await loadPicker(); check(JSON.stringify(await viewerNames()) === JSON.stringify(["Demo.Owner"]), "a removed member is not a picker viewer");
  await all(); await detail("Synthetic video 1"); await historyItem("Demo.Viewer (Inactive participant)").getByText(`Record ID: ${yRecord}`, { exact: true }).waitFor();
  await library.getByRole("list", { name: "All contributors" }).getByText("Inactive participant", { exact: false }).waitFor();
  await signin("Demo.Viewer"); await field("Synthetic invite").fill("SYNTHETIC-FRIDAY-INITIAL"); await click("Resolve synthetic invite"); await groups.getByRole("status").filter({ hasText: "missing, expired or revoked" }).waitFor();
  await field("Synthetic invite").fill(invite); await click("Resolve synthetic invite"); await groups.getByText("Ready to join: Synthetic Friday friends", { exact: true }).waitFor(); await click("Join pending group");
  await groups.getByRole("heading", { name: "Selected group: Synthetic Friday friends", exact: true }).waitFor();
  await click("Load library"); await libraryReady(); await detail("Synthetic video 1");
  await historyItem("Demo.Viewer (You)").getByText(`Record ID: ${yRecord}`, { exact: true }).waitFor(); await historyItem("Demo.Viewer (You)").getByText("Manual timestamp: 3:00", { exact: true }).waitFor();
  await loadPicker(); check(JSON.stringify(await viewerNames()) === JSON.stringify(["Demo.Owner", "Demo.Viewer"]), "the rejoined same member is a viewer again");

  enter("step 10 legacy");
  await click("Separate legacy mode"); await groups.getByText("Mode: Separate legacy", { exact: true }).waitFor(); await field("Synthetic invite").fill("SYNTHETIC-LEGACY-INITIAL"); await click("Resolve synthetic invite");
  await groups.getByText("No active legacy profile.", { exact: true }).waitFor(); await capture("legacy", groups);
  await click("Load library"); await libraryReady(); check(JSON.stringify(await titles()) === JSON.stringify(["Legacy sample film"]), "legacy library shows no account records");
  check(await library.getByRole("button", { name: "My contributions", exact: true }).count() === 0, "legacy has All only");
  await loadPicker(); await setPick(["Legacy sample"], "25"); await picker.getByRole("button", { name: "Pick for me", exact: true }).click(); await result("Legacy sample film");

  enter("step 11 stale and cancel");
  await click("Account groups"); await groups.getByText("Mode: Account groups", { exact: true }).waitFor(); await selectGroup("Synthetic Friday friends");
  // Slow then Cancel on a manual save writes nothing
  await page.getByLabel("Simulated response").selectOption("slow");
  await click("Start fresh manual draft"); await entry.getByLabel("Entry title", { exact: true }).fill("Cancelled Laugh"); await entry.getByLabel("Entry type").selectOption("movie");
  await entry.getByLabel("Entry minutes", { exact: true }).fill("15"); await entry.getByLabel("Entry seconds", { exact: true }).fill("0"); await entry.getByRole("checkbox", { name: "funny", exact: true }).check();
  await click("Save entry"); await click("Cancel entry request"); await entry.getByRole("status").filter({ hasText: "Entry request canceled." }).waitFor();
  await page.getByLabel("Simulated response").selectOption("ready"); await all(); check(!(await titles()).includes("Cancelled Laugh"), "cancelled save wrote nothing");
  // A group switch commits while a Slow pick is pending: the late result is discarded and the picker announces the change
  await loadPicker(); await setPick(["Demo.Viewer"], "90"); await page.getByLabel("Simulated response").selectOption("slow");
  await click("Select Synthetic weekend pair"); await picker.getByRole("button", { name: "Pick for me", exact: true }).click();
  await groups.getByRole("heading", { name: "Selected group: Synthetic weekend pair", exact: true }).waitFor({ timeout: 5000 });
  await picker.getByText("Picker context changed; previous picks and selections were cleared.", { exact: true }).waitFor(); await page.waitForTimeout(1500);
  check(await picker.getByRole("heading", { level: 3 }).count() === 0, "late pick from the old group is never shown");
  // Unavailable then retry on a library read
  await page.getByLabel("Simulated response").selectOption("unavailable"); await click("Load library"); await library.getByRole("status").filter({ hasText: "unavailable" }).waitFor();
  await page.getByLabel("Simulated response").selectOption("ready"); await click("Load library"); await libraryReady(); check(JSON.stringify(await titles()) === JSON.stringify(["Past participant's film"]), "retry reads the weekend library");
  // Slow personal save, then Reset: nothing is written and every panel restarts
  await detail("Past participant's film"); await page.getByLabel("Simulated response").selectOption("slow"); await field("Rating (1–10)").fill("2"); await click("Save rating");
  await personal.getByRole("button", { name: "Cancel personal request", exact: true }).waitFor(); await click("Reset demo");
  await page.getByRole("status").filter({ hasText: "Synthetic preview ready." }).first().waitFor(); await page.waitForTimeout(1500);
  check(await library.getByRole("heading", { name: /^Title details/ }).count() === 0, "reset discards the pending personal view");
  await page.getByLabel("Simulated response").selectOption("ready");

  enter("step 12 reset");
  await page.getByText("No account is signed in.", { exact: true }).waitFor();
  await click("Sign in"); await field("Username").fill(`Journey.User${width}`); await field("Password").fill("synthetic journey password"); await click("Sign in to demo");
  await accounts.getByRole("status").filter({ hasText: "Username or password is incorrect." }).waitFor();
  await signin("Demo.Viewer"); await loadGroups(); await selectGroup("Synthetic weekend pair"); await click("Load library"); await libraryReady(); await detail("Past participant's film");
  check(await historyItem("Demo.Viewer (You)").getByText("Rating: Not rated", { exact: true }).count() === 1, "the held rating never committed");
  await signin("Demo.Owner"); await loadGroups(); check(await page.getByRole("button", { name: "Select Journey group", exact: true }).count() === 0, "Reset removed the new group");
  await selectGroup("Synthetic Friday friends"); await click("Load library"); await libraryReady();
  const after = await titles(); check(!after.includes("Journey Laugh") && !after.includes("Synthetic video 1"), "Reset removed X and Y");
  check(JSON.stringify(after.slice(0, 4)) === JSON.stringify(Object.keys(seeds)), "seeds are back"); check(await detail("Together Tonight") === "joint-movie", "seed keeps its original ID");
  await noOverflow("connected journey end"); check(new URL(page.url()).pathname === "/mock", "the journey stayed inside /mock");
  return { X, Y };
}
