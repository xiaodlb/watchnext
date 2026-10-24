import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("root OpenAPI contract", () => {
  it("validates versioning, inventory mappings, schemas, references and examples", () => {
    const output = execFileSync(process.execPath, ["scripts/verify-openapi.mjs"], { cwd: root, encoding: "utf8" });
    expect(output).toContain("PASS: OpenAPI 3.1.1");
    expect(output).toContain("40 inventory IDs");
  });
});
