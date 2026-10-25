import { PrismaIdentityGroupRepository } from "./identity-store";
import type { IdentityGroupOperationPath } from "../repositories/contracts";

const repository = new PrismaIdentityGroupRepository();
const paths = new Set<IdentityGroupOperationPath>([
  "context", "auth/register", "auth/login", "auth/logout", "auth/recovery",
  "groups", "groups/current", "groups/pending/join",
  "groups/current/members/remove", "groups/current/invitations/rotate",
  "invitations/resolve", "context/group-selection", "context/mode",
  "legacy/groups", "legacy/groups/current/profiles", "legacy/context/profile",
]);

/**
 * #49 composition seam. Request data can never select an adapter: this module
 * only forwards the trusted server-selected identity/group route to the
 * portable repository contract.
 */
export async function handlePrismaIdentity(request: Request, path: string[]): Promise<Response> {
  const operationPath = path.join("/");
  if (!paths.has(operationPath as IdentityGroupOperationPath)) {
    return Response.json({ error: { code: "not_found", message: "HTTP operation is unavailable.", retryable: false } }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  return repository.execute({ request, path: operationPath as IdentityGroupOperationPath });
}
