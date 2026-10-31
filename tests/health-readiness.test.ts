import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../lib/http-prisma/identity-store", () => ({
  prismaIdentityClient: () => ({ $queryRawUnsafe: mocks.query }),
}));

import { GET } from "../app/health/readyz/route";

afterEach(() => mocks.query.mockReset());

describe("database readiness route", () => {
  it("returns success only after the database query succeeds", async () => {
    mocks.query.mockResolvedValue([{ "1": 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns unavailable when the database query fails", async () => {
    mocks.query.mockRejectedValue(new Error("database unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
