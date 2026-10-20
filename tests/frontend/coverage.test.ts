// @vitest-environment node
/*
 * #61 mechanical coverage check. It parses the completed matrix, route list and FR/NFR trace in
 * _docs/mock-integration.md and compares them with _docs/operation-inventory.md, the live
 * createMockService() object and the real test/journey files. Any drift fails here.
 */
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createMockService, pendingDomains } from "../../frontend/mock/service";

const doc = readFileSync("_docs/mock-integration.md", "utf8"), inventory = readFileSync("_docs/operation-inventory.md", "utf8");
const section = (text: string, heading: string) => { const start = text.indexOf(`\n${heading}\n`); if (start < 0) throw Error(`Missing section ${heading}`); const rest = text.slice(start + heading.length + 2); const end = rest.search(/\n#{2,3} /); return end < 0 ? rest : rest.slice(0, end); };
const domainIds = [...inventory.matchAll(/^\| ([AGLWMPK]\d\d) /gm)].map(m => m[1]);
const uIds = [...inventory.matchAll(/^- \*\*(U0\d) /gm)].map(m => m[1]);
const columns = ["id", "inventory", "methods", "surface", "S", "E", "P", "F", "C", "journey"] as const;
type Row = Record<typeof columns[number], string>;
const rows: Row[] = section(doc, "## Coverage matrix").split("\n").filter(line => /^\| [AGLWMPKU]\d\d \|/.test(line)).map(line => {
  const cells = line.slice(2, -2).split(" | ");
  if (cells.length !== columns.length) throw Error(`Row ${cells[0]} has ${cells.length} cells`);
  return Object.fromEntries(columns.map((name, i) => [name, cells[i].trim()])) as Row;
});
const named = (cell: string) => [...cell.matchAll(/`([a-z]+\.[A-Za-z]+)`/g)].map(m => m[1]);
const service = createMockService() as unknown as Record<string, Record<string, unknown>>;
const functions = Object.entries(service).flatMap(([ns, value]) => value && typeof value === "object" ? Object.entries(value).filter(([, f]) => typeof f === "function").map(([name]) => `${ns}.${name}`) : []);
const mockOnly = [...section(doc, "### Mock-only members excluded from OpenAPI").matchAll(/`([a-z]+\.[A-Za-z]+)`/g)].map(m => m[1]);
const files = new Map<string, string>();
const source = (path: string) => { if (!files.has(path)) { if (!existsSync(path)) throw Error(`Referenced file ${path} does not exist`); files.set(path, readFileSync(path, "utf8")); } return files.get(path)!; };
/** Test bodies by exact title (`it("title"` at the start of a line). */
const tests = (path: string) => new Map(source(path).split(/\n(?=it\(")/).map(part => [/^it\("([^"]*)"/.exec(part)?.[1], part] as const).filter((entry): entry is [string, string] => !!entry[0]));
const refs = (cell: string) => cell.split("<br>").map(ref => ref.trim());

it("lists every inventory ID exactly once: 40 domain rows and U01-U06", () => {
  expect(domainIds).toHaveLength(40); expect(new Set(domainIds).size).toBe(40); expect(uIds).toEqual(["U01", "U02", "U03", "U04", "U05", "U06"]);
  const ids = rows.map(row => row.id);
  expect(new Set(ids).size).toBe(ids.length); expect([...ids].sort()).toEqual([...domainIds, ...uIds].sort());
});

it("names only methods that exist on createMockService(), and every service function is named in the matrix or the mock-only list", () => {
  for (const row of rows) {
    for (const method of named(row.methods)) expect(functions, `${row.id} names ${method}`).toContain(method);
    if (/^[AGLWPK]|^M0[1-5]/.test(row.id)) expect(named(row.methods).length, `${row.id} has a typed method`).toBeGreaterThan(0);
  }
  expect(mockOnly).toEqual(expect.arrayContaining(["context.initialIdentity", "context.read", "context.reset", "entry.advanceTime"]));
  for (const member of mockOnly) { const [ns, name] = member.split("."); expect(service[ns], `${member} still exists`).toHaveProperty(name); }
  const covered = new Set([...rows.flatMap(row => named(row.methods)), ...mockOnly]);
  expect(functions.filter(f => !covered.has(f)), "unused adapter functions").toEqual([]);
  expect(pendingDomains).toEqual([]);
});

it("references real test files and exact test titles in every S/E/P/F/C cell, with n/a only on U rows", () => {
  for (const row of rows) for (const column of ["S", "E", "P", "F", "C"] as const) {
    const cell = row[column]; expect(cell, `${row.id} ${column} is filled`).not.toBe("");
    for (const ref of refs(cell)) {
      if (ref.startsWith("n/a")) { expect(row.id, `${row.id} ${column} may not be n/a`).toMatch(/^U/); expect(ref).toMatch(/^n\/a — \S.{10,}/); continue; }
      const [path, title, extra] = ref.split(" › "); expect(extra, `${row.id} ${column} reference format`).toBeUndefined();
      expect(path, `${row.id} ${column}`).toMatch(/^tests\/frontend\/[a-z-]+\.test\.tsx?$/);
      expect(tests(path).has(title), `${row.id} ${column}: "${title}" in ${path}`).toBe(true);
    }
  }
});

it("backs every domain row's P, F and C with a test that actually invokes the row's methods", () => {
  for (const row of rows.filter(row => !row.id.startsWith("U") && row.id !== "M06")) for (const column of ["P", "F", "C"] as const) for (const method of named(row.methods)) {
    const bodies = refs(row[column]).map(ref => { const [path, title] = ref.split(" › "); return tests(path).get(title) ?? ""; });
    expect(bodies.some(body => body.includes(`s.${method}(`)), `${row.id} ${column} invokes ${method}`).toBe(true);
  }
});

it("names a /mock surface and a journey step that exists in its 375/1280 journey file for every row, with no placeholder cell", () => {
  for (const row of rows) {
    for (const cell of Object.values(row)) { expect(cell.trim(), `${row.id} has no empty cell`).not.toBe(""); expect(cell).not.toMatch(/\bTBD\b|\bTODO\b|^\?$|\(\?\)/); }
    expect(row.surface.length, `${row.id} surface`).toBeGreaterThan(5);
    const [path, label, extra] = row.journey.split(" › "); expect(extra).toBeUndefined();
    expect(path, `${row.id} journey`).toMatch(/^tests\/fixtures\/mock-[a-z-]+\.mjs$/); expect(source(path), `${row.id} journey label "${label}"`).toContain(label);
  }
  expect(source("tests/fixtures/mock-foundation-browser-check.mjs")).toContain("mockIntegrationJourney(");
});

it("gives every production route in the inventory's Current route column a named /mock surface", () => {
  const routes = new Set<string>();
  for (const line of inventory.split("\n").filter(line => /^\| [AGLWMPK]\d\d /.test(line))) {
    const routeCell = line.slice(line.indexOf(" | ") + 3).split(";")[0];
    for (const m of routeCell.matchAll(/`(\/[^`]*)`/g)) routes.add(m[1]);
  }
  expect(routes.size).toBeGreaterThanOrEqual(14);
  const listed = new Map([...section(doc, "### Route coverage").matchAll(/^- `([^`]+)` → (.+)$/gm)].map(m => [m[1], m[2].trim()]));
  for (const route of routes) expect(listed.get(route)?.length ?? 0, `${route} has a /mock surface`).toBeGreaterThan(5);
});

it("maps FR01-FR17 to exactly the inventory rows and NFR01-NFR05 to evidence", () => {
  const expected = new Map<string, Set<string>>();
  const add = (id: string, frs: string) => {
    for (const m of frs.matchAll(/FR(\d\d)(?:-(\d\d))?/g)) { const first = Number(m[1]), last = Number(m[2] ?? m[1]); for (let n = first; n <= last; n++) { const key = `FR${String(n).padStart(2, "0")}`; if (!expected.has(key)) expected.set(key, new Set()); expected.get(key)!.add(id); } }
  };
  for (const m of inventory.matchAll(/^\| ([AGLWMPK]\d\d) ((?:N?FR[\d/-]+)+) \|/gm)) add(m[1], m[2].replace(/NFR\d\d/g, ""));
  for (const m of inventory.matchAll(/^- \*\*(U0\d) ([^:]+):\*\*/gm)) add(m[1], m[2].replace(/NFR\d\d/g, ""));
  const trace = section(doc, "### FR/NFR trace"), listed = new Map([...trace.matchAll(/^- (FR\d\d): (.+)$/gm)].map(m => [m[1], new Set(m[2].split(", ").map(x => x.trim()))]));
  expect([...listed.keys()].sort()).toEqual(Array.from({ length: 17 }, (_, i) => `FR${String(i + 1).padStart(2, "0")}`));
  for (const [fr, ids] of expected) expect([...listed.get(fr)!].sort(), fr).toEqual([...ids].sort());
  for (let n = 1; n <= 5; n++) expect(trace, `NFR0${n} evidence`).toMatch(new RegExp(`^- NFR0${n}: .{40,}$`, "m"));
});
