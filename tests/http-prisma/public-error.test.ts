import { describe, expect, it } from "vitest";
import { AuthError } from "../../lib/accounts/security";
import { PrismaLibraryError } from "../../lib/http-prisma/library-store";
import { publicApplicationFailure } from "../../lib/http-prisma/public-error";

describe("Prisma application public errors", () => {
  it("preserves safe validation and conflict messages", () => {
    expect(publicApplicationFailure(new PrismaLibraryError("Title must contain 1–200 plain characters."))).toEqual({
      status: 422,
      code: "validation_failed",
      message: "Title must contain 1–200 plain characters.",
      retryable: false,
    });
    expect(publicApplicationFailure(new AuthError("This form is stale. Reload and try again."))).toEqual({
      status: 409,
      code: "conflict",
      message: "This form is stale. Reload and try again.",
      retryable: false,
    });
  });

  it("hides database and connection details from unexpected failures", () => {
    const raw = new Error("PrismaClientInitializationError: connect to postgresql://sdip:secret@postgres:5432/watchnext failed: ECONNREFUSED");
    const failure = publicApplicationFailure(raw);
    expect(failure).toEqual({
      status: 503,
      code: "service_unavailable",
      message: "The request could not be completed.",
      retryable: true,
    });
    expect(JSON.stringify(failure)).not.toMatch(/Prisma|postgres|sdip|secret|5432|ECONNREFUSED|watchnext/i);
  });
});
