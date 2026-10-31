import { AuthError } from "../accounts/security";
import { PrismaLibraryError } from "./library-store";

export type PublicApplicationFailure = {
  status: number;
  code: "conflict" | "validation_failed" | "service_unavailable";
  message: string;
  retryable: boolean;
};

/** Map trusted domain failures to their safe messages and hide unexpected internals. */
export function publicApplicationFailure(cause: unknown): PublicApplicationFailure {
  if (cause instanceof AuthError || cause instanceof PrismaLibraryError) {
    const status = /stale|access|Authentication|origin|invalid|Current group/i.test(cause.message) ? 409 : 422;
    return {
      status,
      code: status === 409 ? "conflict" : "validation_failed",
      message: cause.message,
      retryable: false,
    };
  }

  return {
    status: 503,
    code: "service_unavailable",
    message: "The request could not be completed.",
    retryable: true,
  };
}
