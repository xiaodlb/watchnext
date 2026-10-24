import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpService } from "../../frontend/service/http-service";

const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; vi.restoreAllMocks(); });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

describe("same-origin HTTP frontend service", () => {
  it("uses credentials and a fixed /v1 path for account registration", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ recoveryCode: "private-once", context: { revision: 3 } }));
    globalThis.fetch = fetch;
    const service = createHttpService();
    const result = await service.accounts.register({ username: "Http.User", password: "long enough password", confirmation: "long enough password" }, service.context.initialIdentity);
    expect(result).toMatchObject({ kind: "success", value: { code: "private-once", next: "account" }, context: { mode: "http", revision: 3 } });
    expect(fetch).toHaveBeenCalledWith("/v1/auth/register", expect.objectContaining({ method: "POST", credentials: "same-origin" }));
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ username: "Http.User", expectedContextRevision: 0 });
    expect(body).not.toHaveProperty("scenario");
    expect(body).not.toHaveProperty("actorId");
  });

  it("keeps a failed HTTP mutation visible instead of falling back to mock state", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response({ error: { code: "validation_failed", message: "Enter a title.", retryable: false } }, 422));
    const service = createHttpService();
    const result = await service.library.removeOwn("title", 1, { mode: "http", instance: "test", revision: 4 });
    expect(result).toMatchObject({ kind: "failure", error: { code: "validation_failed", message: "Enter a title." } });
  });

  it("serializes picker text into the declared numeric HTTP DTO", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ kind: "no_match", refreshed: false, message: "None", context: { revision: 8 } }));
    globalThis.fetch = fetch;
    const service = createHttpService();
    await service.picker.pick({ viewerIds: ["a"], availableMinutes: "25", mood: "funny", rewatches: false }, "intent-1", { mode: "http", instance: "test", revision: 7 });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ viewerIds: ["a"], availableMinutes: 25, mood: "funny", rewatches: false, intentId: "intent-1", expectedContextRevision: 7 });
  });
});
