// @vitest-environment node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { expect, it } from "vitest";
/** #60: exact baseline pure files the mock picker may reuse unchanged. Not a lib/ wildcard; each is still visited recursively. */
const allowedBaseline = ["lib/picker/ranking.ts", "lib/picker/eligibility.ts", "lib/picker/types.ts", "lib/title-state.ts"];
function closure() {
  const root = process.cwd(), seen = new Set<string>();
  function visit(path: string) {
    if (seen.has(path)) return; seen.add(path); const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/\b(?:fetch|require)\s*\(|process\.env|document\.cookie|\b(?:localStorage|sessionStorage)\b|["']use server["']/);
    for (const match of source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
      const id = match[1]; expect(id).not.toMatch(/^(?:node:|server-only|@prisma)/);
      if (!id.startsWith(".") || id.endsWith(".css")) continue;
      const base = resolve(dirname(path), id), target = [base + ".ts", base + ".tsx"].find(existsSync);
      if (!target) throw Error("Unresolved client import");
      const file = relative(root, target).replaceAll("\\", "/");
      if (!allowedBaseline.includes(file)) expect(file).toMatch(/^(?:frontend\/|app\/mock\/)/);
      visit(target);
    }
  }
  visit(resolve(root, "app/mock/page.tsx"));
  return [...seen].map(path => relative(root, path).replaceAll("\\", "/"));
}
it("keeps the entire mock entry import closure client-safe with no native/auth/provider side effects", () => {
  const files = closure(); expect(files.length).toBeGreaterThanOrEqual(4);
});
it("reuses only the exact allowlisted baseline picker files; the server/cycle/view-state/db/production picker stay out", () => {
  const files = closure();
  for (const file of allowedBaseline) expect(files).toContain(file);
  expect(files.filter(file => file.startsWith("lib/")).sort()).toEqual([...allowedBaseline].sort());
  for (const forbidden of ["lib/picker/cycle.ts", "lib/picker/server.ts", "lib/picker/server-only.ts", "lib/picker/view-state.ts"]) expect(files).not.toContain(forbidden);
  expect(files.some(file => file.startsWith("db/") || file.startsWith("app/pick/"))).toBe(false);
});
