"use server";
import { revalidatePath } from "next/cache";
import { getDatabase } from "../../db/server";
import { getGroupRequest } from "../../lib/access";
import { configuredMetadataProviders } from "../../lib/metadata/providers";
import { refreshTitleMetadata } from "../../lib/metadata/reviews";
type RefreshState = { kind: "idle" | "done" | "error"; message?: string };
export async function refreshMetadataAction(contextKey: string | undefined, id: string, _previous: RefreshState, _form: FormData): Promise<RefreshState> {
  try {
    const result = await refreshTitleMetadata(getDatabase(), await getGroupRequest(true, contextKey), id, configuredMetadataProviders(), process.env.WATCHNEXT_APP_ORIGIN);
    if (result.kind === "failure") return { kind: "error", message: result.message + " Expired imported values stay cleared; your own corrections and history are preserved." };
    return { kind: "done", message: "Verified provider fields refreshed. Your own corrections and history are preserved. Complete any missing details using Edit title." };
  } catch { return { kind: "error", message: "Metadata could not be refreshed. Check your selected profile and retry, or supply your own corrections. Expired values remain unavailable." }; }
  finally { revalidatePath("/watchlist"); revalidatePath("/archive"); revalidatePath("/watchlist/add"); revalidatePath(`/watchlist/${encodeURIComponent(id)}`); }
}
