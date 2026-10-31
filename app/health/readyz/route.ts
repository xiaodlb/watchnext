import { prismaIdentityClient } from "../../../lib/http-prisma/identity-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prismaIdentityClient().$queryRawUnsafe("SELECT 1");
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
