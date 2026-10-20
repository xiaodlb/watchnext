/** #60 picker journey through the real /mock controls. It never follows an external link. */
export async function mockPickerJourney({ page, origin, width, check, onAction = () => {} }) {
  let segment = "setup";
  const step = name => onAction(`${segment}: ${name}`);
  const click = name => { step(name); return page.getByRole("button", { name, exact: true }).click(); };
  const field = name => page.getByLabel(name, { exact: true });
  const picker = page.getByRole("region", { name: "Pick for me", exact: true }), library = page.getByRole("region", { name: "Saved synthetic library" });
  const pickerClick = name => { step(name); return picker.getByRole("button", { name, exact: true }).click(); };
  const result = name => picker.getByRole("heading", { level: 3, name, exact: true }).waitFor();
  const status = text => picker.locator(".picker-feedback").filter({ hasText: text }).waitFor();
  const noOverflow = async label => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: ${label} without horizontal overflow`);
  const refreshedNotice = () => picker.getByText("List changed; picks refreshed.", { exact: true });
  const signin = async user => { await click("Sign in"); await field("Username").fill(user); await field("Password").fill("synthetic password"); await click("Sign in to demo"); await page.getByRole("heading", { name: `Account: ${user}`, exact: true }).waitFor(); await click("Load groups"); await page.getByRole("button", { name: "Select Synthetic Friday friends", exact: true }).waitFor(); };
  const group = async name => { await click(`Select ${name}`); await page.getByRole("heading", { name: `Selected group: ${name}`, exact: true }).waitFor(); };
  const load = async () => { await pickerClick("Load picker"); await picker.getByRole("group", { name: "Who’s watching?" }).or(picker.getByText("No group members yet.", { exact: false })).first().waitFor(); };
  const viewer = name => picker.getByRole("checkbox", { name, exact: true });
  const set = async ({ viewers = [], minutes, mood = "Funny", rewatches = false }) => {
    for (const box of await picker.getByRole("group", { name: "Who’s watching?" }).getByRole("checkbox").all()) { const name = await box.evaluate(node => node.parentElement.querySelector(".profile-name").textContent); if ((await box.isChecked()) !== viewers.includes(name)) await box.click(); }
    await picker.getByLabel("Available time (whole minutes)").fill(minutes); await picker.getByRole("radio", { name: mood, exact: true }).check();
    if ((await picker.getByRole("checkbox", { name: "Rewatches OK" }).isChecked()) !== rewatches) await picker.getByRole("checkbox", { name: "Rewatches OK" }).click();
  };
  const sequence = async (labels, button = "Pick for me") => { await pickerClick(button); for (const [i, name] of labels.entries()) { await result(name); if (i < labels.length - 1) await pickerClick("Pick again"); } };
  const detail = async name => { await click("All saved titles"); await library.getByRole("status").filter({ hasText: "Synthetic library ready." }).waitFor(); await click(`Details: ${name}`); await library.getByRole("heading", { name: `Title details: ${name}`, exact: true }).waitFor(); };
  const personal = () => page.getByRole("region", { name: "Personal progress and feedback" });

  segment = "scenario 1 cycle and restart";
  await page.goto(origin + "/mock"); check(await page.getByText("Not available yet", { exact: true }).count() === 0, "picker no longer listed as unavailable");
  await signin("Demo.Owner"); await group("Synthetic Friday friends"); await load();
  check(await picker.getByRole("checkbox").evaluateAll(boxes => boxes.every(box => !box.checked)), "no viewer or rewatch preselected"); check(await picker.getByLabel("Available time (whole minutes)").inputValue() === "", "time starts empty"); check(await picker.getByRole("radio").evaluateAll(radios => radios.every(radio => !radio.checked)), "no mood preselected");
  await picker.getByRole("button", { name: "1 h 30 min", exact: true }).click(); check(await picker.getByLabel("Available time (whole minutes)").inputValue() === "90", "preset fills the field"); check(await picker.getByRole("button", { name: "1 h 30 min", exact: true }).getAttribute("aria-pressed") === "true", "preset pressed state");
  await set({ viewers: ["Demo.Viewer"], minutes: "90" });
  await sequence(["Together Tonight", "Short Laughs", "Paper Stars", "A Small Good Idea"]);
  const external = picker.getByRole("link", { name: "Watch (external)", exact: true });
  check(await external.getAttribute("target") === "_blank" && await external.getAttribute("rel") === "noopener noreferrer", "external link opens separately without opener");
  await pickerClick("Pick again"); await result("All matches shown"); await status("All matches shown. Choose Start again to begin explicitly.");
  await pickerClick("Start again"); await result("Together Tonight"); await picker.getByText("Exact match", { exact: true }).waitFor(); await noOverflow("scenario 1 result");

  segment = "no refresh after rating, note and unselected progress";
  await detail("Together Tonight"); await field("Rating (1–10)").fill("3"); await click("Save rating"); await personal().getByText("Your saved rating: 3/10.", { exact: true }).waitFor();
  await pickerClick("Pick again"); await result("Short Laughs"); check(await refreshedNotice().count() === 0, "rating does not refresh picks");
  await field("Your note text").fill("Picker journey note"); await click("Save note"); await personal().getByText("Your whole-title note is saved.").first().waitFor();
  await pickerClick("Pick again"); await result("Paper Stars"); check(await refreshedNotice().count() === 0, "note does not refresh picks");
  await field("Stopped at").fill("2:00"); await click("Save timestamp"); await personal().getByText("Saved timestamp: 2:00. Completion: Not finished.", { exact: true }).waitFor();
  await pickerClick("Pick again"); await result("A Small Good Idea"); check(await refreshedNotice().count() === 0, "unselected member progress does not refresh picks");
  check(await picker.getByText(/Rating|Picker journey note/).count() === 0, "ratings and notes never appear in the picker");

  segment = "archive and restore refresh";
  await detail("A Small Good Idea"); await click("Remove my contribution"); await click("Confirm own removal"); await library.getByText("Archived title: metadata is read-only until explicitly restored.", { exact: true }).waitFor();
  await pickerClick("Pick again"); await refreshedNotice().waitFor(); await result("Together Tonight");
  await pickerClick("Pick again"); await result("Short Laughs"); await pickerClick("Pick again"); await result("Paper Stars"); await pickerClick("Pick again"); await result("All matches shown"); check(await picker.getByRole("heading", { name: "A Small Good Idea" }).count() === 0, "archived title is not offered");
  await click("Restore title"); await click("Confirm restore"); await library.getByRole("button", { name: "Remove my contribution", exact: true }).waitFor();
  await pickerClick("Start again"); await refreshedNotice().waitFor(); await result("Together Tonight");

  segment = "input edit discards the cycle; scenarios 2-3 and 5-8";
  await picker.getByLabel("Available time (whole minutes)").fill("91"); check(await picker.getByRole("heading", { level: 3 }).count() === 0, "edit hides the result"); await picker.getByRole("button", { name: "Pick for me", exact: true }).waitFor();
  await set({ viewers: ["Demo.Owner", "Demo.Viewer"], minutes: "90" }); await sequence(["Together Tonight", "A Small Good Idea"]); await pickerClick("Pick again"); await result("All matches shown");
  await set({ viewers: ["Demo.Owner", "Demo.Viewer"], minutes: "90", rewatches: true }); await sequence(["Together Tonight", "Paper Stars"]);
  await picker.getByText("Catch-up episode for the least advanced viewer.", { exact: true }).waitFor(); await picker.getByText("Episode 1", { exact: true }).waitFor(); await picker.getByRole("list", { name: "Rewatching" }).getByText("Demo.Viewer", { exact: true }).waitFor();
  await set({ viewers: ["Demo.Viewer"], minutes: "14" }); await pickerClick("Pick for me"); await result("A Small Good Idea"); await picker.getByText("1 minute longer than your available time.", { exact: true }).waitFor(); await picker.getByText("Alternative suggestion", { exact: true }).waitFor();
  await pickerClick("Pick again"); await result("All matches shown");
  await set({ viewers: ["Demo.Viewer"], minutes: "10" }); await pickerClick("Pick for me"); await picker.getByText("5 minutes longer than your available time.", { exact: true }).waitFor();
  await set({ viewers: ["Demo.Viewer"], minutes: "90", mood: "Relaxing" }); await pickerClick("Pick for me"); await result("Together Tonight"); await picker.getByText("Requested Relaxing; different mood: Funny. Within your available time.", { exact: true }).waitFor();

  segment = "no-match with actions";
  await set({ viewers: ["Demo.Viewer"], minutes: "9" }); await pickerClick("Pick for me"); await result("No match"); await status("No match for these settings.");
  check(await picker.getByRole("list", { name: "No-match reasons" }).getByRole("listitem").allTextContents().then(items => items.join("|")) === "Some saved titles need usable title, type, duration or mood details.|No viewer-eligible title meets the requested mood/time or permitted alternatives.", "no-match reasons in baseline order");
  check(await picker.getByLabel("Available time (whole minutes)").inputValue() === "9", "no-match keeps submitted inputs");
  await pickerClick("View details to review progress or metadata"); await library.getByRole("heading", { name: "Title details: My retained title correction", exact: true }).waitFor(); check(new URL(page.url()).pathname === "/mock", "details stay inside /mock");
  await set({ viewers: ["Demo.Owner"], minutes: "5" }); await pickerClick("Pick for me"); await result("No match"); check(await picker.getByRole("list", { name: "No-match reasons" }).getByRole("listitem").count() === 3, "scenario 9 lists three reasons");

  segment = "slow cancel and unavailable retry without skipping";
  await set({ viewers: ["Demo.Viewer"], minutes: "90" }); await pickerClick("Pick for me"); await result("Together Tonight");
  await page.getByLabel("Simulated response").selectOption("slow"); await pickerClick("Pick again"); check(await picker.getByRole("button", { name: "Finding a pick…", exact: true }).isDisabled(), "pending submit disabled");
  check(await page.evaluate(() => document.activeElement?.textContent === "Cancel pick"), "focus moves to reachable Cancel pick"); check(await picker.getByLabel("Available time (whole minutes)").isEditable(), "inputs stay editable while pending");
  await page.keyboard.press("Enter"); await status("Pick canceled"); await picker.getByRole("button", { name: "Retry pick", exact: true }).waitFor();
  await page.getByLabel("Simulated response").selectOption("unavailable"); await pickerClick("Retry pick"); await status("We couldn’t pick right now. Your inputs are still here. Please try again.");
  await page.getByLabel("Simulated response").selectOption("ready"); await pickerClick("Retry pick"); await result("Short Laughs");

  segment = "synthetic-time conflict and Start a new cycle";
  for (let i = 0; i < 3; i++) { await click("Advance synthetic time ten minutes"); await page.waitForFunction(() => ![...document.querySelectorAll("button")].some(button => button.textContent === "Cancel entry request")); await page.getByText("Synthetic time advanced ten minutes", { exact: false }).first().waitFor(); }
  await pickerClick("Pick again"); await result("Start a new picking cycle"); await status("This picking cycle expired or changed. Start a new cycle to continue safely.");
  await pickerClick("Start a new cycle"); await result("Together Tonight"); await noOverflow("conflict recovery");

  segment = "selected progress refresh as Demo.Viewer";
  await signin("Demo.Viewer"); await picker.getByText("Picker context changed; previous picks and selections were cleared.", { exact: true }).waitFor();
  await group("Synthetic Friday friends"); await load(); check(await viewer("Demo.Viewer").isChecked() === false, "selections cleared after account change");
  await set({ viewers: ["Demo.Viewer"], minutes: "90" }); await pickerClick("Pick for me"); await result("Together Tonight");
  await detail("Together Tonight"); await click("Mark complete"); await personal().getByText("Completion: Finished.", { exact: false }).first().waitFor();
  await pickerClick("Pick again"); await refreshedNotice().waitFor(); await result("Short Laughs");
  await picker.getByRole("button", { name: "View details", exact: true }).click(); await library.getByRole("heading", { name: "Title details: Short Laughs", exact: true }).waitFor();

  segment = "long title and long group name wrap";
  const entry = page.getByRole("region", { name: "Add to the synthetic library" }), longTitle = "Unbrokenpickertitle".repeat(8);
  await click("Start fresh manual draft"); await field("Entry title").fill(longTitle); await entry.getByLabel("Entry type").selectOption("movie"); await field("Entry minutes").fill("999"); await field("Entry seconds").fill("0");
  await entry.getByRole("checkbox", { name: "funny", exact: true }).check(); await click("Save entry"); await entry.getByText("Saved to the actual synthetic library.", { exact: false }).first().waitFor();
  await set({ viewers: ["Demo.Viewer"], minutes: "1000" }); await pickerClick("Pick for me"); await result(longTitle); await noOverflow("long unbroken title result");
  const longGroup = "Longpickergroupname".repeat(4); await field("New group name").fill(longGroup); await click("Create account group"); await click("Continue to groups"); await page.getByRole("heading", { name: `Selected group: ${longGroup}`, exact: true }).waitFor();
  await load(); await picker.getByText(`Picking in ${longGroup}`, { exact: true }).waitFor();
  await set({ viewers: ["Demo.Viewer"], minutes: "30" }); await pickerClick("Pick for me"); await picker.getByText("There are no active saved titles to pick from.", { exact: true }).waitFor();
  await pickerClick("Add a title"); check(await page.evaluate(() => document.activeElement?.id === "mock-entry"), "add-title suggestion focuses the Add panel"); await noOverflow("long group name and empty-group no-match");

  segment = "weekend completed viewer";
  await group("Synthetic weekend pair"); await picker.getByText("Picker context changed; previous picks and selections were cleared.", { exact: true }).waitFor(); await load();
  check(await picker.getByRole("group", { name: "Who’s watching?" }).getByRole("checkbox").count() === 1 && await picker.getByText("Past participant", { exact: true }).count() === 0, "removed participant is never offered");
  await set({ viewers: ["Demo.Viewer"], minutes: "30" }); await pickerClick("Pick for me"); await result("No match"); await picker.getByText("Completion or different next episodes prevent a shared pick with these settings.", { exact: true }).waitFor();
  await set({ viewers: ["Demo.Viewer"], minutes: "30", rewatches: true }); await pickerClick("Pick for me"); await result("Past participant's film"); await picker.getByRole("list", { name: "Rewatching" }).getByText("Demo.Viewer", { exact: true }).waitFor();

  segment = "legacy pick without a profile, by keyboard";
  await click("Separate legacy mode"); await page.getByText("Mode: Separate legacy", { exact: true }).waitFor(); await field("Synthetic invite").fill("SYNTHETIC-LEGACY-INITIAL"); await click("Resolve synthetic invite"); await page.getByText("No active legacy profile.", { exact: true }).waitFor();
  await load(); await viewer("Legacy sample").focus(); await page.keyboard.press("Space"); check(await viewer("Legacy sample").isChecked(), "keyboard checks a viewer");
  await picker.getByLabel("Available time (whole minutes)").focus(); await page.keyboard.type("25");
  await picker.getByRole("radio", { name: "Funny", exact: true }).focus(); await page.keyboard.press("Space"); check(await picker.getByRole("radio", { name: "Funny", exact: true }).isChecked(), "keyboard chooses a mood");
  await picker.getByLabel("Available time (whole minutes)").press("Enter"); await result("Legacy sample film"); await status("Your suggestion is ready.");
  check(await page.evaluate(() => document.activeElement?.classList.contains("picker-feedback")), "focus moves to the announced result"); await noOverflow("legacy pick");
  check(new URL(page.url()).pathname === "/mock" && !page.url().includes("cycle"), "no picker state in the URL");
}
